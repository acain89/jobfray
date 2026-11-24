import { randomUUID, createHmac } from "node:crypto";
import type { Repository, Transaction } from "./repository";
import type { Allocation, RequestRecord, Selection, Snapshot } from "./model";
import type { BusinessId, OfferingId, OwnerId, ResourceId } from "../domain/types";
import type { Geocoder, PaymentAdapter } from "./providers";
import { distanceMiles } from "./providers";
import { AppError, selection, string } from "./validation";
import { hash, contactProof, enqueue, audit, ownerScope } from "./security";
import { checkSchedule, localInstant, localParts, operatingWindows } from "./time";
import { calculatePlatformFee, PRICING_POLICY_VERSION } from "../server/fees";
import { assertCapacity } from "../domain/capacity";
import { integer } from "../domain/validation";
function capacity(existing: Allocation[], candidate: Allocation, limit: number, now: Date) {
    const project = (a: Allocation) => ({ id: a.id, businessId: a.businessId as BusinessId, requestId: a.requestId, resourceId: a.resourceId as ResourceId, startsAt: a.start, endsAt: a.end, units: a.units, status: a.status, holdExpiresAt: a.expiresAt });
    const overlapping = existing.filter(a => Date.parse(a.end) > Date.parse(candidate.start) && Date.parse(a.start) < Date.parse(candidate.end));
    try {
        assertCapacity({ businessId: candidate.businessId as BusinessId, ownerId: "verified-public-allocation" as OwnerId }, { id: candidate.resourceId as ResourceId, businessId: candidate.businessId as BusinessId, name: "Shared capacity", capacity: limit, timeZone: "UTC" }, overlapping.map(project), project(candidate), now);
    }
    catch {
        throw new AppError("That capacity is no longer available. Choose another period.", 409);
    }
}
export interface CheckoutResult {
    requestId: string;
    confirmationToken: string;
    snapshot: Snapshot;
    status: RequestRecord["status"];
}
export class BookingService {
    constructor(readonly repo: Repository, readonly geocoder: Geocoder, readonly payments: PaymentAdapter, private confirmationKey: string) {
        if (confirmationKey.length < 32)
            throw new Error("Confirmation key is too short");
    }
    private confirmationToken(id: string) { return createHmac("sha256", this.confirmationKey).update("confirmation:" + id).digest("base64url"); }
    async checkout(input: unknown, proof: string, key: string, now: Date): Promise<CheckoutResult> {
        const s = selection(input);
        string(key, 100);
        const payloadHash = hash(JSON.stringify(s));
        const replay = async (tx: Transaction): Promise<CheckoutResult | null> => {
            const previous = (await tx.find("requests", { businessId: s.businessId, idempotencyKey: key }))[0];
            if (previous) {
                if (previous.payloadHash !== payloadHash)
                    throw new AppError("Idempotency key was used with a different request", 409);
                const snap = (await tx.find("snapshots", { businessId: s.businessId, requestId: previous.id }))[0]!;
                return { requestId: previous.id, confirmationToken: this.confirmationToken(previous.id), snapshot: snap, status: previous.status };
            }
            return null;
        };
        const cached = await this.repo.transaction(["tenant:" + s.businessId], async (tx) => { await contactProof(tx, proof, s.contact.phone, now); return replay(tx); });
        if (cached)
            return cached;
        // No provider call occurs before contact verification or on a historical replay.
        const point = s.fulfillment === "MOBILE" ? await this.geocoder.address(s.contact.address) : null;
        return this.repo.transaction(["tenant:" + s.businessId], async (tx) => {
            await contactProof(tx, proof, s.contact.phone, now);
            const existing = await replay(tx);
            if (existing)
                return existing;
            const business = await tx.get("businesses", s.businessId), offering = await tx.get("offerings", s.offeringId);
            if (!business || business.status !== "PUBLISHED" || !business.published || !offering || offering.businessId !== s.businessId || !offering.active || !business.modes.includes(s.mode))
                throw new AppError("Offering is not available", 404);
            const config = offering.configurations.find(c => c.mode === s.mode);
            if (!config || !config.fulfillments.includes(s.fulfillment))
                throw new AppError("Unsupported offering or fulfillment");
            if (s.fulfillment === "MOBILE" && (!point || distanceMiles(point, business) > config.radiusMiles))
                throw new AppError("The exact service address is outside the business service radius");
            if (s.fulfillment !== "MOBILE" && s.contact.address)
                throw new AppError("An address is not needed for storefront fulfillment");
            if (s.mode !== "RENTAL" && s.quantity !== 1)
                throw new AppError("Quantity is only applicable to pooled rentals");
            if (s.mode !== "RESERVATION" && s.partySize !== 1)
                throw new AppError("Party size is only applicable to reservations");
            if (s.mode === "QUOTE" && (!s.contact.notes || s.photos.length < 1 || s.startLocal || s.endLocal))
                throw new AppError("Quotes require a description and 1-3 photos, without scheduling");
            for (const id of s.photos) {
                const media = await tx.get("media", id);
                if (!media || media.businessId !== business.id || media.kind !== "QUOTE" || media.proofHash !== hash(proof) || media.expiresAt && Date.parse(media.expiresAt) <= now.getTime())
                    throw new AppError("Invalid or expired quote image");
            }
            const id = randomUUID(), token = this.confirmationToken(id), expiresAt = new Date(now.getTime() + 15 * 60000).toISOString();
            let timing: ReturnType<typeof checkSchedule> | null = null;
            if (config.mode !== "QUOTE") {
                const resource = offering.resourceId ? await tx.get("resources", offering.resourceId) : null;
                if (!resource || resource.businessId !== business.id)
                    throw new AppError("Capacity settings are unavailable");
                timing = checkSchedule(s, config, resource.hours, business.timeZone, now);
                const allocation: Allocation = { id: randomUUID(), businessId: business.id, requestId: id, resourceId: resource.id, start: timing.occupiedStart, end: timing.occupiedEnd,
                    units: config.mode === "RENTAL" ? s.quantity : config.mode === "RESERVATION" && config.capacityUnit === "PERSON" ? s.partySize : 1, status: "HELD", expiresAt };
                capacity(await tx.find("allocations", { businessId: business.id, resourceId: resource.id }), allocation, resource.capacity, now);
                // Request is inserted before its allocation below to satisfy database foreign keys.
                const request = this.request(s, id, expiresAt, hash(token), business, timing, offering.name, now, config.mode === "RESERVATION" ? config.arrivalInstructions : "");
                await tx.put("requests", { ...request, idempotencyKey: key, payloadHash });
                await tx.put("allocations", allocation);
            }
            else
                await tx.put("requests", { ...this.request(s, id, expiresAt, hash(token), business, null, offering.name, now, ""), idempotencyKey: key, payloadHash });
            let subtotal: number | null = null, priceLabel = "Variable price - arrange the underlying price directly with the business";
            if (config.price.kind !== "VARIABLE") {
                const factor = config.mode === "RENTAL" ? s.quantity * (timing?.durationUnits ?? 1) : config.price.kind === "PER_PERSON" ? s.partySize : config.price.kind === "PER_NIGHT" ? (timing?.durationUnits ?? 1) : 1;
                integer(factor, 1);
                subtotal = integer(config.price.cents * factor);
                priceLabel = config.price.kind === "STARTING" ? "Advertised minimum; final price is agreed directly with the business" : "Underlying price; pay the business directly";
            }
            const snapshot: Snapshot = Object.freeze({ id: randomUUID(), businessId: business.id as BusinessId, offeringId: offering.id as OfferingId, requestId: id, mode: s.mode, fulfillment: s.fulfillment, quantity: s.quantity, partySize: s.partySize, durationUnits: timing?.durationUnits ?? null,
                durationUnit: config.price.kind === "DAILY" || config.price.kind === "PER_NIGHT" ? "DAY" : config.price.kind === "HOURLY" ? "HOUR" : null,
                priceKind: subtotal === null ? "UNKNOWN" : "KNOWN", priceBasis: subtotal === null ? null : config.mode === "RENTAL" || config.price.kind === "PER_NIGHT" ? "QUANTITY_DURATION" : config.price.kind === "PER_PERSON" ? "QUANTITY" : "FIXED", unitAmountCents: config.price.kind === "VARIABLE" ? null : config.price.cents,
                underlyingSubtotalCents: subtotal, platformFeeCents: calculatePlatformFee(s.mode, subtotal), pricingPolicyVersion: PRICING_POLICY_VERSION, currency: "USD", recipient: "JOBFRAY", processingCostPayer: "JOBFRAY", createdAt: now.toISOString(), priceLabel, policyDisclosureVersion: "jf-facilitation-v1" });
            await tx.put("snapshots", snapshot);
            await audit(tx, business.id, "CHECKOUT_HELD", "CUSTOMER_VERIFIED", now, id);
            return { requestId: id, confirmationToken: token, snapshot, status: "PENDING_PAYMENT" };
        });
    }
    private request(s: Selection, id: string, expiresAt: string, confirmationHash: string, b: {
        id: string;
        name: string;
        phone: string;
        email: string;
        address: string;
        timeZone: string;
    }, timing: ReturnType<typeof checkSchedule> | null, offeringName: string, now: Date, instructions: string): RequestRecord {
        return { id, businessId: b.id, offeringId: s.offeringId, mode: s.mode, fulfillment: s.fulfillment, idempotencyKey: "", payloadHash: "", paymentIntentId: null, status: "PENDING_PAYMENT", payment: "CREATED", start: timing?.start ?? null, end: timing?.end ?? null, expiresAt, contact: s.contact, photos: s.photos, confirmationHash, reference: "JF-" + randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(), offeringName, businessName: b.name, businessPhone: b.phone, businessEmail: b.email, businessAddress: s.fulfillment === "STOREFRONT" ? b.address : "", timeZone: b.timeZone, instructions, createdAt: now.toISOString(), confirmedAt: null, priceLabel: "", refundReason: null };
    }
    async slots(businessId: string, offeringId: string, mode: string, fulfillment: string, date: string, now: Date, partySize?: number) {
        return this.repo.transaction(["tenant:" + businessId], async (tx) => {
            const b = await tx.get("businesses", businessId), o = await tx.get("offerings", offeringId), c = o?.configurations.find(c => c.mode === mode);
            if (!b?.published || b.status !== "PUBLISHED" || !o?.active || o.businessId !== businessId || !c || !b.modes.includes(c.mode) || !c.fulfillments.includes(fulfillment as "MOBILE" | "STOREFRONT") || c.mode === "QUOTE")
                throw new AppError("Offering not available", 404);
            if (c.mode === "RENTAL" || c.mode === "RESERVATION" && c.interval === "MULTIDAY")
                return { slots: [], range: true };
            const r = o.resourceId ? await tx.get("resources", o.resourceId) : null;
            if (!r || r.businessId !== businessId)
                throw new AppError("Capacity not available", 404);
            const allocations = await tx.find("allocations", { businessId, resourceId: r.id }), slots: {
                start: string;
                end: string;
                startLocal: string;
                endLocal: string;
                ambiguity: "EARLIER" | "LATER";
                endAmbiguity:"EARLIER"|"LATER";
                label: string;
            }[] = [], seen = new Set<string>();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
                throw new AppError("Choose a date");
            const starts=c.mode==="RESERVATION"?[...new Set(operatingWindows(date,r.hours).flatMap(w=>Array.from({length:Math.ceil((w.end-w.start)/c.slotMinutes)},(_,i)=>w.start+i*c.slotMinutes)))]:Array.from({length:96},(_,i)=>i*15);
            for (const minute of starts)
                for (const ambiguity of ["EARLIER", "LATER"] as const) {
                    const startLocal = date + "T" + String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
                    try {
                        const start = localInstant(startLocal, b.timeZone, ambiguity), end = start + (c.mode === "SERVICE" ? c.durationMinutes : c.slotMinutes) * 60000, endLocal = localParts(end, b.timeZone).local;
                        const endAmbiguity=localInstant(endLocal,b.timeZone,"EARLIER")===end?"EARLIER" as const:"LATER" as const;
                        const input: Selection = { businessId, offeringId, mode: c.mode, fulfillment: fulfillment as "MOBILE" | "STOREFRONT", quantity: 1, partySize: c.mode === "RESERVATION" ? partySize ?? c.minimumParty : 1, startLocal, endLocal, ambiguity, endAmbiguity, contact: { name: "", phone: "", address: "", notes: "" }, photos: [] };
                        const t = checkSchedule(input, c, r.hours, b.timeZone, now);
                        if (seen.has(t.start))
                            continue;
                        capacity(allocations, { id: "availability-only", businessId, requestId: "availability-only", resourceId: r.id, start: t.occupiedStart, end: t.occupiedEnd, units: c.mode === "RESERVATION" && c.capacityUnit === "PERSON" ? input.partySize : 1, status: "HELD", expiresAt: new Date(now.getTime() + 60000).toISOString() }, r.capacity, now);
                        seen.add(t.start);
                        slots.push({ start: t.start, end: t.end, startLocal, endLocal, ambiguity, endAmbiguity, label: new Date(start).toLocaleTimeString("en-US", { timeZone: b.timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }) });
                    }
                    catch { /* Public output reveals availability only, never internal allocation or contact details. */ }
                }
            return { slots, range: false };
        });
    }
    async intent(requestId: string, token: string, now: Date = new Date()) {
        const result = await this.repo.transaction(["request:" + requestId], async (tx) => {
            const request = await tx.get("requests", requestId);
            if (!request || request.confirmationHash !== hash(token))
                throw new AppError("Not found", 404);
            if (request.status !== "PENDING_PAYMENT" || Date.parse(request.expiresAt) <= now.getTime())
                throw new AppError("Checkout hold expired or already processed", 409);
            const snapshot = (await tx.find("snapshots", { businessId: request.businessId, requestId }))[0]!;
            return { request, snapshot };
        });
        const intent = await this.payments.create({ requestId, amountCents: result.snapshot.platformFeeCents, currency: "USD", idempotencyKey: "jf-fee:" + requestId });
        await this.repo.transaction(["tenant:" + result.request.businessId], async (tx) => {
            const current = (await tx.get("requests", requestId))!;
            if (current.paymentIntentId && current.paymentIntentId !== intent.id)
                throw new AppError("Provider idempotency conflict", 409);
            await tx.put("requests", { ...current, paymentIntentId: intent.id });
        });
        return intent;
    }
    async paymentEvent(payload: string, signature: string, now: Date) {
        const event = this.payments.verify(payload, signature);
        const businessId = await this.repo.transaction(["event-read"], async (tx) => (await tx.get("requests", event.requestId))?.businessId);
        if (!businessId)
            throw new AppError("Unknown payment request", 404);
        return this.repo.transaction(["tenant:" + businessId, "payment:" + event.paymentId], async (tx) => {
            const request = (await tx.get("requests", event.requestId))!, snapshot = (await tx.find("snapshots", { businessId, requestId: request.id }))[0]!;
            if (request.paymentIntentId !== event.intentId)
                throw new AppError("Payment identity does not match checkout", 403);
            const duplicate = await tx.get("events", event.eventId);
            if (duplicate) {
                if (duplicate.providerId !== event.paymentId || duplicate.requestId !== request.id || duplicate.amountCents !== event.amountCents)
                    throw new AppError("Payment event identity conflict", 409);
                return { status: request.status };
            }
            const paid = (await tx.find("events", { providerId: event.paymentId }))[0];
            if (paid && (paid.requestId !== request.id || paid.amountCents !== event.amountCents))
                throw new AppError("Payment is already bound to another request", 409);
            // Every verified event is durable. A second payment identity is a duplicate-charge remediation.
            const prior = (await tx.find("events", { businessId, requestId: request.id }))[0];
            await tx.put("events", { id: event.eventId, businessId, requestId: request.id, providerId: event.paymentId, amountCents: event.amountCents, currency: event.currency, processedAt: now.toISOString() });
            if (paid)
                return { status: request.status };
            const allocations = await tx.find("allocations", { businessId, requestId: request.id });
            const expired = Date.parse(request.expiresAt) <= now.getTime() || allocations.some(a => a.status !== "HELD");
            const business = await tx.get("businesses", businessId);
            const failure = event.amountCents !== snapshot.platformFeeCents ? "PAYMENT_AMOUNT_MISMATCH" : prior ? "DUPLICATE_CHARGE" : request.status !== "PENDING_PAYMENT" || expired ? "HOLD_EXPIRED" : business?.status !== "PUBLISHED" ? "BUSINESS_UNAVAILABLE" : null;
            if (failure) {
                // Preserve a previously fulfilled confirmation if a later duplicate charge arrives.
                if (!request.confirmedAt) {
                    request.status = "REFUND_REQUIRED";
                    for (const a of allocations)
                        await tx.put("allocations", { ...a, status: "RELEASED", expiresAt: null });
                }
                request.payment = "REFUND_REQUIRED";
                request.refundReason = failure;
                await tx.put("refunds", { id: randomUUID(), businessId, requestId: request.id, paymentId: event.paymentId, reason: failure, state: "REQUIRED", createdAt: now.toISOString(), resolvedAt: null });
                await audit(tx, businessId, "REFUND_REQUIRED:" + failure, "PAYMENT", now, request.id);
            }
            else {
                for (const a of allocations)
                    await tx.put("allocations", { ...a, status: "CONFIRMED", expiresAt: null });
                request.status = request.mode === "QUOTE" ? "DELIVERED" : "CONFIRMED";
                request.payment = "SUCCEEDED";
                request.confirmedAt = now.toISOString();
                request.priceLabel = snapshot.priceLabel;
                for (const id of request.photos) {
                    const media = await tx.get("media", id);
                    if (media)
                        await tx.put("media", { ...media, expiresAt: new Date(now.getTime() + 180 * 86400000).toISOString() });
                }
                await enqueue(tx, { businessId, destination: (await tx.get("accounts", business!.ownerId))!.email, channel: "EMAIL", kind: "CONFIRMED_REQUEST", body: `${request.reference}: ${request.offeringName}. Open your authenticated JobFray dashboard for details.`, key: "confirmed-email:" + request.id }, now);
                if (business?.pushEnabled)
                    await enqueue(tx, { businessId, destination: business.ownerId, channel: "PUSH", kind: "CONFIRMED_REQUEST", body: "A new request is available in your dashboard.", key: "confirmed-push:" + request.id }, now);
                await enqueue(tx, { businessId, destination: request.contact.phone, channel: "SMS", kind: "CUSTOMER_CONFIRMATION", body: "/confirmation#access=" + this.confirmationToken(request.id), key: "confirmation:" + request.id }, now);
                await audit(tx, businessId, "REQUEST_CONFIRMED", "PAYMENT", now, request.id);
            }
            await tx.put("requests", request);
            return { status: request.status };
        });
    }
    async confirmation(token: string) {
        return this.repo.transaction(["confirmation"], async (tx) => {
            const request = (await tx.find("requests", { confirmationHash: hash(token) }))[0];
            if (!request)
                throw new AppError("Confirmation not found", 404);
            const snapshot = (await tx.find("snapshots", { businessId: request.businessId, requestId: request.id }))[0]!;
            if (!request.confirmedAt)
                return { status: request.status, reference: request.reference, snapshot };
            return { status: request.status, reference: request.reference, snapshot, request };
        });
    }
    async reconcile(now: Date) {
        const tenants = await this.repo.transaction(["reconcile-list"], async (tx) => [...new Set((await tx.find("requests", { status: "PENDING_PAYMENT" })).map(r => r.businessId))]);
        let count = 0;
        for (const businessId of tenants)
            await this.repo.transaction(["tenant:" + businessId], async (tx) => {
                for (const r of await tx.find("requests", { businessId, status: "PENDING_PAYMENT" }))
                    if (Date.parse(r.expiresAt) <= now.getTime()) {
                        await tx.put("requests", { ...r, status: "EXPIRED" });
                        for (const a of await tx.find("allocations", { businessId, requestId: r.id }))
                            await tx.put("allocations", { ...a, status: "RELEASED", expiresAt: null });
                        await audit(tx, businessId, "HOLD_EXPIRED", "RECONCILIATION", now, r.id);
                        count++;
                    }
            });
        return count;
    }
    async release(token: string | undefined, businessId: string, requestId: string, now: Date) {
        return this.repo.transaction(["tenant:" + businessId], async (tx) => {
            const scope = await ownerScope(tx, token, businessId, now), request = await tx.get("requests", requestId);
            if (!request || request.businessId !== businessId)
                throw new AppError("Not found", 404);
            if (request.start && Date.parse(request.start) <= now.getTime())
                throw new AppError("Only future capacity may be released");
            if (!request.confirmedAt)
                throw new AppError("Only confirmed records may be operationally released");
            for (const a of await tx.find("allocations", { businessId, requestId }))
                await tx.put("allocations", { ...a, status: "RELEASED", expiresAt: null });
            request.status = "RELEASED";
            await tx.put("requests", request);
            await audit(tx, businessId, "FUTURE_CAPACITY_RELEASED", scope.accountId, now, requestId);
            return { released: true };
        });
    }
}
export async function deliverNotifications(repo: Repository, transport: import("./providers").NotificationTransport, now: Date) {
    const batch = await repo.transaction(["outbox-worker"], async (tx) => {
        const rows = [...await tx.find("outbox", { state: "PENDING" }), ...await tx.find("outbox", { state: "SENDING" })].filter(r => r.state !== "SENT" && Date.parse(r.availableAt) <= now.getTime() && (!r.leaseUntil || Date.parse(r.leaseUntil) <= now.getTime())).slice(0, 50);
        for (const row of rows)
            await tx.put("outbox", { ...row, state: "SENDING", leaseUntil: new Date(now.getTime() + 60000).toISOString() });
        return rows;
    });
    for (const row of batch) {
        let sent = false;
        try {
            await transport.send(row);
            sent = true;
        }
        catch { /* no payloads or private data in logs */ }
        await repo.transaction(["outbox:" + row.id], async (tx) => {
            const current = await tx.get("outbox", row.id);
            if (!current || current.state === "SENT")
                return;
            await tx.put("outbox", { ...current, state: sent ? "SENT" : "PENDING", attempts: current.attempts + 1, leaseUntil: null, availableAt: new Date(now.getTime() + Math.min(3600000, 30000 * 2 ** Math.min(current.attempts, 7))).toISOString() });
        });
    }
    return batch.length;
}
