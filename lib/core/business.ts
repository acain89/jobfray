import { randomUUID } from "node:crypto";
import type { Repository, Transaction } from "./repository";
import type { Business, Offering, Resource } from "./model";
import { EMPTY_CONTENT } from "./model";
import { AppError, content, hours, offering, profile, string, whole, number } from "./validation";
import { audit, ownerScope, session } from "./security";
import { record, keys } from "../domain/validation";
import type { Geocoder, Point } from "./providers";
import { distanceMiles } from "./providers";
export async function tenantRecord<K extends "offerings" | "resources" | "requests" | "media">(tx: Transaction, table: K, id: string, businessId: string) {
    const row = (await tx.find(table, { id, businessId } as Partial<import("./model").Tables[K]>))[0];
    if (!row || row.businessId !== businessId)
        throw new AppError("Record not found", 404);
    return row;
}
export async function saveProfile(repo: Repository, rawSession: string | undefined, input: unknown, now: Date, discoveryPoint?: Point) {
    const data = profile(input);
    if (discoveryPoint) {
        number(discoveryPoint.latitude, -90, 90);
        number(discoveryPoint.longitude, -180, 180);
    }
    return repo.transaction(["business-slug:" + data.slug, "owner-session:" + rawSession?.slice(0, 8)], async (tx) => {
        const { account } = await session(tx, rawSession, now), existing = (await tx.find("businesses", { ownerId: account.id }))[0];
        const duplicate = (await tx.find("businesses", { slug: data.slug }))[0];
        if (duplicate && duplicate.id !== existing?.id)
            throw new AppError("That business slug is already in use", 409);
        const row: Business = existing ? { ...existing, ...data, revision: existing.revision + 1 } : { ...data, id: randomUUID(), ownerId: account.id, status: "DRAFT", revision: 1, draft: structuredClone(EMPTY_CONTENT), published: null, pushEnabled: false, suspensionReason: null };
        if (discoveryPoint)
            row.discoveryPoint = discoveryPoint;
        else if (existing?.zip !== data.zip)
            delete row.discoveryPoint;
        await tx.put("businesses", row);
        await audit(tx, row.id, "BUSINESS_SAVED", account.id, now);
        return row;
    });
}
/** Minimal authenticated profile read for QR/readiness operations; never loads customer history. */
export async function ownerBusiness(repo: Repository, rawSession: string | undefined, now: Date): Promise<Business | null> {
    return repo.transaction([], async (tx) => { const { account } = await session(tx, rawSession, now); return (await tx.find("businesses", { ownerId: account.id }))[0] ?? null; });
}
export async function workspace(repo: Repository, rawSession: string | undefined, now: Date, afterId?: string) {
    return repo.transaction([], async (tx) => {
        const { account } = await session(tx, rawSession, now), business = (await tx.find("businesses", { ownerId: account.id }))[0] ?? null;
        const cursor = business && afterId ? await tenantRecord(tx, "requests", afterId, business.id) : null;
        if (cursor && !cursor.confirmedAt)
            throw new AppError("Invalid history cursor");
        const requests = business ? await tx.find("requests", { businessId: business.id }, { limit: 100, afterId, orderBy: "createdAt", ...(cursor ? { afterValue: cursor.createdAt } : {}), ranges: [{ field: "confirmedAt", operator: "notNull" }] }) : [];
        const snapshots = business && requests.length ? await tx.find("snapshots", { businessId: business.id }, { oneOf: { field: "requestId", values: requests.map(r => r.id) }, limit: 100 }) : [];
        return { asOf: now.toISOString(), account: { id: account.id, email: account.email }, business, offerings: business ? await tx.find("offerings", { businessId: business.id }) : [], resources: business ? await tx.find("resources", { businessId: business.id }) : [], requests, snapshots, historyCursor: afterId ?? null, historyLimited: requests.length === 100, nextCursor: requests.length === 100 ? requests.at(-1)!.id : null };
    });
}
export async function saveResource(repo: Repository, token: string | undefined, businessId: string, id: string | null, input: unknown, now: Date) {
    const v = record(input);
    keys(v, ["name", "capacity", "hours"]);
    return repo.transaction(["tenant:" + businessId], async (tx) => {
        const scope = await ownerScope(tx, token, businessId, now);
        if (id)
            await tenantRecord(tx, "resources", id, businessId);
        const row: Resource = { id: id ?? randomUUID(), businessId, name: string(v.name, 100), capacity: whole(v.capacity, 1, 10000), hours: hours(v.hours) };
        // A lower capacity cannot invalidate already promised overlapping obligations.
        if (id) {
            const allocations = await tx.find("allocations", { businessId, resourceId: id }, { ranges: [{ field: "end", operator: "gt", value: now.toISOString() }] });
            const events = allocations.filter(a => a.status === "CONFIRMED" || a.status === "HELD" && Date.parse(a.expiresAt!) > now.getTime()).flatMap(a => [{ at: Date.parse(a.start), delta: a.units }, { at: Date.parse(a.end), delta: -a.units }]).sort((a, b) => a.at - b.at || a.delta - b.delta);
            let occupied = 0;
            for (const event of events) {
                occupied += event.delta;
                if (occupied > row.capacity)
                    throw new AppError("Capacity cannot be reduced below existing obligations. Release future capacity first.", 409);
            }
        }
        // Existing confirmed/held allocations are never rewritten or removed by calendar/capacity edits.
        await tx.put("resources", row);
        await audit(tx, businessId, "CAPACITY_SETTINGS_SAVED", scope.accountId, now);
        return row;
    });
}
export async function saveOffering(repo: Repository, token: string | undefined, businessId: string, id: string | null, input: unknown, now: Date) {
    const data = offering(input, businessId, id ?? randomUUID());
    return repo.transaction(["tenant:" + businessId], async (tx) => {
        const scope = await ownerScope(tx, token, businessId, now), business = (await tx.get("businesses", businessId))!;
        const previous = id ? await tenantRecord(tx, "offerings", id, businessId) : null;
        if (data.configurations.some(c => !business.modes.includes(c.mode) && !previous?.configurations.some(old => old.mode === c.mode)))
            throw new AppError("Enable the business mode before adding it to an offering");
        if (data.resourceId)
            await tenantRecord(tx, "resources", data.resourceId, businessId);
        for (const image of data.photos) {
            const media = await tenantRecord(tx, "media", image, businessId);
            if (media.kind !== "BUSINESS")
                throw new AppError("Invalid offering photo");
        }
        await tx.put("offerings", data);
        await audit(tx, businessId, "OFFERING_SAVED", scope.accountId, now);
        return data;
    });
}
export async function autosave(repo: Repository, token: string | undefined, businessId: string, revision: number, input: unknown, now: Date, design = true) {
    const draft = content(input);
    return repo.transaction(["tenant:" + businessId], async (tx) => {
        await ownerScope(tx, token, businessId, now);
        const business = (await tx.get("businesses", businessId))!;
        if (business.revision !== revision)
            throw new AppError("The website changed in another tab. Reload before saving.", 409);
        for (const image of draft.gallery) {
            const media = await tenantRecord(tx, "media", image, businessId);
            if (media.kind !== "BUSINESS")
                throw new AppError("Invalid gallery image");
        }
        if (!design)
            draft.theme = business.draft.theme;
        business.draft = draft;
        business.revision++;
        await tx.put("businesses", business);
        return { revision: business.revision };
    });
}
export async function readiness(tx: Transaction, business: Business): Promise<string[]> {
    const errors: string[] = [];
    if (!business.name || !business.category || !business.description || !business.phone || !business.email || !business.address || !business.zip)
        errors.push("Complete your business information and location.");
    if (!business.draft.headline || !business.draft.description)
        errors.push("Add a website headline and description.");
    if (!business.modes.length)
        errors.push("Enable at least one business mode.");
    const offerings = (await tx.find("offerings", { businessId: business.id })).filter(o => o.active && o.configurations.some(c => business.modes.includes(c.mode)));
    if (!offerings.length)
        errors.push("Add at least one active offering in an enabled mode.");
    const resources = new Map((await tx.find("resources", { businessId: business.id })).map(resource => [resource.id, resource]));
    for (const item of offerings)
        if (item.configurations.some(c => c.mode !== "QUOTE" && business.modes.includes(c.mode))) {
            const resource = item.resourceId ? resources.get(item.resourceId) : null;
            if (!resource || !Object.values(resource.hours.weekly).some(w => w.length))
                errors.push(`Configure operating hours for ${item.name}.`);
        }
    if (business.status === "SUSPENDED")
        errors.push("This business is suspended. Contact platform administration.");
    return errors;
}
export async function publish(repo: Repository, token: string | undefined, businessId: string, now: Date) {
    return repo.transaction(["tenant:" + businessId], async (tx) => {
        const scope = await ownerScope(tx, token, businessId, now), business = (await tx.get("businesses", businessId))!, errors = await readiness(tx, business);
        if (errors.length)
            throw new AppError(errors.join(" "));
        business.status = "PUBLISHED";
        business.published = structuredClone(business.draft);
        business.revision++;
        await tx.put("businesses", business);
        await audit(tx, businessId, "WEBSITE_PUBLISHED", scope.accountId, now);
        return { published: true };
    });
}
export async function unpublish(repo: Repository, token: string | undefined, businessId: string, now: Date) {
    return repo.transaction(["tenant:" + businessId], async (tx) => {
        const scope = await ownerScope(tx, token, businessId, now), b = (await tx.get("businesses", businessId))!;
        if (b.status !== "SUSPENDED")
            b.status = "DRAFT";
        await tx.put("businesses", b);
        await audit(tx, businessId, "WEBSITE_UNPUBLISHED", scope.accountId, now);
        return { unpublished: true };
    });
}
export async function suspend(repo: Repository, token: string | undefined, businessId: string, reason: string, admins: readonly string[], now: Date) {
    return repo.transaction(["tenant:" + businessId], async (tx) => {
        const { account } = await session(tx, token, now);
        if (!admins.includes(account.email))
            throw new AppError("Forbidden", 403);
        const b = await tx.get("businesses", businessId);
        if (!b)
            throw new AppError("Business not found", 404);
        b.status = "SUSPENDED";
        b.suspensionReason = string(reason, 300);
        await tx.put("businesses", b);
        await audit(tx, businessId, "BUSINESS_SUSPENDED", account.id, now);
        return { suspended: true };
    });
}
export function publicOffering(o: Offering, b: Business) { return { id: o.id, name: o.name, description: o.description, photos: o.photos, configurations: o.configurations.filter(c => b.modes.includes(c.mode)) }; }
export function publicBusiness(b: Business, offerings: Offering[]) { return { id: b.id, slug: b.slug, name: b.name, category: b.category, city: b.city, timeZone: b.timeZone, address: b.addressPublic ? b.address : null, content: b.published!, offerings: offerings.filter(o => o.active).map(o => publicOffering(o, b)).filter(o => o.configurations.length) }; }
export async function publishedSite(repo: Repository, slug: string) {
    return repo.transaction([], async (tx) => {
        const b = (await tx.find("businesses", { slug, status: "PUBLISHED" }))[0];
        if (!b?.published)
            return null;
        return publicBusiness(b, await tx.find("offerings", { businessId: b.id }));
    });
}
export async function directory(repo: Repository, query: {
    text: string;
    mode: string;
    fulfillment: string;
    zip: string;
    point?: Point;
    after?: string;
}, geocoder: Geocoder) {
    const point = query.point ?? (query.zip ? await geocoder.zip(query.zip) : null);
    if (repo.searchDirectory)
        return repo.searchDirectory({ text: query.text, mode: query.mode, fulfillment: query.fulfillment, point, ...(query.after ? { after: query.after } : {}) });
    const result: import("./discovery").DirectoryRow[] = [];
    let afterId: string | undefined;
    const centroids = new Map<string, Point>();
    while (true) {
        const page = await repo.transaction([], async (tx) => {
            const businesses = await tx.find("businesses", { status: "PUBLISHED", directory: true }, { limit: 100, afterId });
            const offerings = businesses.length ? await tx.find("offerings", { active: true }, { oneOf: { field: "businessId", values: businesses.map(b => b.id) } }) : [];
            return { businesses, offerings };
        });
        for (const b of page.businesses) {
            if (!b.published)
                continue;
            let publicPoint: Point = b;
            if (!b.addressPublic && point) {
                publicPoint = b.discoveryPoint ?? centroids.get(b.zip) ?? await geocoder.zip(b.zip);
                if (centroids.size < 1000)
                    centroids.set(b.zip, publicPoint);
            }
            const matching = page.offerings.filter(o => o.businessId === b.id && (!query.text || (b.category + " " + o.name + " " + o.description).toLowerCase().includes(query.text.toLowerCase())) && o.configurations.some(c => b.modes.includes(c.mode) && (!query.mode || c.mode === query.mode) && (!query.fulfillment || c.fulfillments.includes(query.fulfillment as "MOBILE" | "STOREFRONT")) && (!point || query.fulfillment !== "MOBILE" || distanceMiles(point, publicPoint) <= c.radiusMiles + 5)));
            if (!matching.length)
                continue;
            result.push({ slug: b.slug, name: b.name, category: b.category, city: b.city, distance: point ? Math.round(distanceMiles(point, publicPoint) / 5) * 5 : null, offerings: matching.map(o => ({ name: o.name, modes: o.configurations.filter(c => b.modes.includes(c.mode)).map(c => c.mode) })) });
        }
        result.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0) || a.name.localeCompare(b.name));
        result.splice(100);
        if (page.businesses.length < 100)
            break;
        afterId = page.businesses.at(-1)!.id;
    }
    return result;
}
export function subdomainSlug(host: string, baseHost = "jobfray.com"): string | null {
    const normalized = host.toLowerCase().split(":")[0] ?? "";
    if (!normalized.endsWith("." + baseHost))
        return null;
    const slug = normalized.slice(0, -baseHost.length - 1);
    return /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) && !["www", "app", "api", "admin", "auth", "find", "mail", "support"].includes(slug) ? slug : null;
}
