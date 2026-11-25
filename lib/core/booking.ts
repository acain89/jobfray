import { requestCapability } from "./request-capability";
import { randomUUID, createHmac } from "node:crypto";
import type { Repository, Transaction } from "./repository";
import type { Allocation, RequestRecord, Selection, Snapshot } from "./model";
import type { BusinessId, OfferingId, OwnerId, ResourceId } from "../domain/types";
import type { Geocoder, PaymentAdapter } from "./providers";
import { distanceMiles } from "./providers";
import { AppError, selection, string } from "./validation";
import { hash, rateLimit, enqueue, audit, ownerScope } from "./security";
import { checkSchedule, localInstant, localParts, operatingWindows, startOfDay, addDays } from "./time";
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
function selectionPrice(s: Selection, config: import("./model").ModeConfig, timing: ReturnType<typeof checkSchedule> | null) {
    let subtotal: number | null = null, priceLabel = "Variable price - arrange the underlying price directly with the business";
    if (config.price.kind !== "VARIABLE") {
        const factor = config.mode === "RENTAL" ? s.quantity * (timing?.durationUnits ?? 1) : config.price.kind === "PER_PERSON" ? s.partySize : config.price.kind === "PER_NIGHT" ? (timing?.durationUnits ?? 1) : 1;
        integer(factor, 1);
        subtotal = integer(config.price.cents * factor);
        priceLabel = config.price.kind === "STARTING" ? "Advertised minimum; final price is agreed directly with the business" : "Underlying price; pay the business directly";
    }
    return { subtotal, priceLabel };
}
function assertAcceptedReview(accepted:unknown,facts:object){
 if(accepted===undefined)return;
 if(!accepted||typeof accepted!=="object"||Array.isArray(accepted))throw new AppError("Review the current price before checkout");
 const expected=accepted as Record<string,unknown>,actual=facts as Record<string,unknown>;
 for(const key of ["underlyingSubtotalCents","platformFeeCents","quantity","partySize","durationUnits","durationUnit","customerPhone","priceLabel","pricingPolicyVersion"])if(expected[key]!==actual[key])throw new AppError("Price or request details changed. Review your request again.",409);
}
export interface CheckoutResult {
    requestId: string;
    confirmationToken: string;
    snapshot: Snapshot;
    status: RequestRecord["status"];
}
export class BookingService {
    constructor(readonly repo: Repository, readonly geocoder: Geocoder, readonly payments: PaymentAdapter, private confirmationKey: string, private keyVersion = "v1", private previousKeys: Readonly<Record<string, string>> = {}, private durableCheckout = false) {
        if (confirmationKey.length < 32 || !/^[a-z0-9-]{1,40}$/.test(keyVersion) || Object.entries(previousKeys).some(([id, key]) => !(/^[a-z0-9-]{1,40}$/.test(id)) || typeof key !== "string" || key.length < 32))
            throw new Error("Invalid confirmation signing configuration");
    }
    private confirmationToken(id: string, version = this.keyVersion) {
        const key = version === this.keyVersion ? this.confirmationKey : this.previousKeys[version];
        if (!key)
            throw new AppError("Historical confirmation key is unavailable", 503);
        return createHmac("sha256", key).update("confirmation:" + id).digest("base64url");
    }
    async checkout(input: unknown, capability: string, key: string, now: Date, browser: string,acceptedReview?:unknown): Promise<CheckoutResult> {
        const s = selection(input);
        string(key, 100);
        const validateCapability = (tx: Transaction) => requestCapability(tx, capability, s.businessId, browser, now);
        const payloadHash = hash(JSON.stringify(s));
        const replay = async (tx: Transaction): Promise<CheckoutResult | null> => {
            const previous = (await tx.find("requests", { businessId: s.businessId, idempotencyKey: key }))[0];
            if (previous) {
                if (previous.browserHash !== hash(browser))
                    throw new AppError("Request belongs to another browser", 403);
                if (previous.payloadHash !== payloadHash)
                    throw new AppError("Idempotency key was used with a different request", 409);
                const snap = (await tx.find("snapshots", { businessId: s.businessId, requestId: previous.id }))[0]!;
                assertAcceptedReview(acceptedReview,snap);
                return { requestId: previous.id, confirmationToken: this.confirmationToken(previous.id, previous.confirmationKeyVersion ?? "v1"), snapshot: snap, status: previous.status };
            }
            return null;
        };
        const cached = await this.repo.transaction([], async (tx) => { await validateCapability(tx); return replay(tx); });
        if (cached)
            return cached;
        await rateLimit(this.repo, "checkout-browser:" + s.businessId + ":" + hash(browser), 10, now);
        // No provider call occurs before contact verification or on a historical replay.
        const point = s.fulfillment === "MOBILE" ? await this.geocoder.address(s.contact.address) : null;
        return this.repo.transaction(["tenant:" + s.businessId], async (tx) => {
            await validateCapability(tx);
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
                if ((await tx.find("requests", { businessId: s.businessId }, { limit: 1, containsPhoto: id })).length)
                    throw new AppError("Quote image already belongs to another request", 403);
                const media = await tx.get("media", id);
                if (!media || media.businessId !== business.id || media.kind !== "QUOTE" || media.capabilityHash !== hash(capability) || media.expiresAt && Date.parse(media.expiresAt) <= now.getTime())
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
                capacity(await tx.find("allocations", { businessId: business.id, resourceId: resource.id }, { ranges: [{ field: "end", operator: "gt", value: allocation.start }, { field: "start", operator: "lt", value: allocation.end }] }), allocation, resource.capacity, now);
                // Request is inserted before its allocation below to satisfy database foreign keys.
                const request = this.request(s, id, expiresAt, hash(token), business, timing, offering.name, now, config.mode === "RESERVATION" ? config.arrivalInstructions : "");
                await tx.put("requests", { ...request, browserHash: hash(browser), idempotencyKey: key, payloadHash });
                await tx.put("allocations", allocation);
            }
            else
                await tx.put("requests", { ...this.request(s, id, expiresAt, hash(token), business, null, offering.name, now, ""), browserHash: hash(browser), idempotencyKey: key, payloadHash });
            const { subtotal, priceLabel } = selectionPrice(s, config, timing);
            const snapshot: Snapshot = Object.freeze({ id: randomUUID(), businessId: business.id as BusinessId, offeringId: offering.id as OfferingId, requestId: id, mode: s.mode, fulfillment: s.fulfillment, quantity: s.quantity, partySize: s.partySize, durationUnits: timing?.durationUnits ?? null,
                durationUnit: config.price.kind === "DAILY" || config.price.kind === "PER_NIGHT" ? "DAY" : config.price.kind === "HOURLY" ? "HOUR" : null,
                priceKind: subtotal === null ? "UNKNOWN" : "KNOWN", priceBasis: subtotal === null ? null : config.mode === "RENTAL" || config.price.kind === "PER_NIGHT" ? "QUANTITY_DURATION" : config.price.kind === "PER_PERSON" ? "QUANTITY" : "FIXED", unitAmountCents: config.price.kind === "VARIABLE" ? null : config.price.cents,
                underlyingSubtotalCents: subtotal, platformFeeCents: calculatePlatformFee(s.mode, subtotal), pricingPolicyVersion: PRICING_POLICY_VERSION, currency: "USD", recipient: "JOBFRAY", processingCostPayer: "JOBFRAY", createdAt: now.toISOString(), priceLabel, customerPhone: s.contact.phone, policyDisclosureVersion: "jf-facilitation-v1" });
            assertAcceptedReview(acceptedReview,snapshot);
            await tx.put("snapshots", snapshot);
            await audit(tx, business.id, "CHECKOUT_HELD", "BROWSER_CAPABILITY", now, id);
            return { requestId: id, confirmationToken: token, snapshot, status: "PENDING_PAYMENT" };
        });
    }
    async preview(input: unknown, now: Date) {
        const s = selection(input);
        return this.repo.transaction([], async (tx) => {
            const business = await tx.get("businesses", s.businessId), offering = await tx.get("offerings", s.offeringId), config = offering?.configurations.find(c => c.mode === s.mode);
            if (!business?.published || business.status !== "PUBLISHED" || !offering?.active || offering.businessId !== business.id || !business.modes.includes(s.mode) || !config || !config.fulfillments.includes(s.fulfillment))
                throw new AppError("Offering unavailable", 404);
            let timing: ReturnType<typeof checkSchedule> | null = null;
            if (config.mode !== "QUOTE") {
                const resource = offering.resourceId ? await tx.get("resources", offering.resourceId) : null;
                if (!resource || resource.businessId !== business.id)
                    throw new AppError("Capacity unavailable");
                timing = checkSchedule(s, config, resource.hours, business.timeZone, now);
            }
            const { subtotal, priceLabel } = selectionPrice(s, config, timing);
            return {pricingPolicyVersion:PRICING_POLICY_VERSION, underlyingSubtotalCents: subtotal, platformFeeCents: calculatePlatformFee(s.mode, subtotal), priceLabel, quantity: s.quantity, partySize: s.partySize, durationUnits: timing?.durationUnits ?? null, durationUnit: config.price.kind === "DAILY" || config.price.kind === "PER_NIGHT" ? "DAY" : config.price.kind === "HOURLY" ? "HOUR" : null, customerPhone: s.contact.phone };
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
        return { id, businessId: b.id, offeringId: s.offeringId, mode: s.mode, fulfillment: s.fulfillment, idempotencyKey: "", payloadHash: "", paymentIntentId: null, status: "PENDING_PAYMENT", payment: "CREATED", start: timing?.start ?? null, end: timing?.end ?? null, expiresAt, contact: s.contact, photos: s.photos, confirmationHash, confirmationKeyVersion: this.keyVersion, reference: "JF-" + randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(), offeringName, businessName: b.name, businessPhone: b.phone, businessEmail: b.email, businessAddress: s.fulfillment === "STOREFRONT" ? b.address : "", timeZone: b.timeZone, instructions, createdAt: now.toISOString(), confirmedAt: null, priceLabel: "", refundReason: null };
    }
    async slots(businessId: string, offeringId: string, mode: string, fulfillment: string, date: string, now: Date, partySize?: number) {
        return this.repo.transaction([], async (tx) => {
            const b = await tx.get("businesses", businessId), o = await tx.get("offerings", offeringId), c = o?.configurations.find(c => c.mode === mode);
            if (!b?.published || b.status !== "PUBLISHED" || !o?.active || o.businessId !== businessId || !c || !b.modes.includes(c.mode) || !c.fulfillments.includes(fulfillment as "MOBILE" | "STOREFRONT") || c.mode === "QUOTE")
                throw new AppError("Offering not available", 404);
            if (c.mode === "RENTAL" || c.mode === "RESERVATION" && c.interval === "MULTIDAY")
                return { slots: [], range: true };
            const r = o.resourceId ? await tx.get("resources", o.resourceId) : null;
            if (!r || r.businessId !== businessId)
                throw new AppError("Capacity not available", 404);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
                throw new AppError("Choose a date");
            const firstDate = localParts(now.getTime(), b.timeZone).date;
            let validDate = false;
            try {
                validDate = addDays(date, 0) === date;
            }
            catch { }
            if (!validDate || date < firstDate || date > addDays(firstDate, 29))
                throw new AppError("Choose a date within the 30-calendar-day window");
            const dayStart = startOfDay(date, b.timeZone), dayEnd = startOfDay(addDays(date, 1), b.timeZone);
            const before = c.mode === "SERVICE" ? c.bufferBefore : 0, after = c.mode === "SERVICE" ? c.durationMinutes + c.bufferAfter : c.slotMinutes;
            const allocations = await tx.find("allocations", { businessId, resourceId: r.id }, { oneOf: { field: "status", values: ["HELD", "CONFIRMED"] }, ranges: [{ field: "end", operator: "gt", value: new Date(dayStart - before * 60000).toISOString() }, { field: "start", operator: "lt", value: new Date(dayEnd + after * 60000).toISOString() }] }), slots: {
                start: string;
                end: string;
                startLocal: string;
                endLocal: string;
                ambiguity: "EARLIER" | "LATER";
                endAmbiguity: "EARLIER" | "LATER";
                label: string;
            }[] = [], seen = new Set<string>();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
                throw new AppError("Choose a date");
            const starts = c.mode === "RESERVATION" ? [...new Set(operatingWindows(date, r.hours).flatMap(w => Array.from({ length: Math.ceil((w.end - w.start) / c.slotMinutes) }, (_, i) => w.start + i * c.slotMinutes)))] : Array.from({ length: 96 }, (_, i) => i * 15);
            for (const minute of starts)
                for (const ambiguity of ["EARLIER", "LATER"] as const) {
                    const startLocal = date + "T" + String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
                    try {
                        const start = localInstant(startLocal, b.timeZone, ambiguity), end = start + (c.mode === "SERVICE" ? c.durationMinutes : c.slotMinutes) * 60000, endLocal = localParts(end, b.timeZone).local;
                        const endAmbiguity = localInstant(endLocal, b.timeZone, "EARLIER") === end ? "EARLIER" as const : "LATER" as const;
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
            if (this.durableCheckout) {
                const id = "checkout-create:" + request.id;
                if (!await tx.get("operations", id))
                    await tx.put("operations", { id, businessId: request.businessId, kind: "CHECKOUT_CREATE", state: "RUNNING", availableAt: now.toISOString(), attempts: 1, leaseUntil: null, payload: { requestId: request.id, amountCents: snapshot.platformFeeCents, startedAt: now.toISOString() } });
            }
            return { request, snapshot };
        });
        const intent = await this.payments.create({ requestId, amountCents: result.snapshot.platformFeeCents, currency: "USD", idempotencyKey: "jf-fee:" + requestId,
            providerExpiresAt: Math.floor(Date.parse(result.request.createdAt) / 1000) + 3600 });
        await this.repo.transaction(["tenant:" + result.request.businessId], async (tx) => {
            const current = (await tx.get("requests", requestId))!;
            if (current.paymentIntentId && current.paymentIntentId !== intent.id)
                throw new AppError("Provider idempotency conflict", 409);
            await tx.put("requests", { ...current, paymentIntentId: intent.id });
            if (this.durableCheckout) {
                const prepared = await tx.get("operations", "checkout-create:" + current.id);
                if (prepared)
                    await tx.put("operations", { ...prepared, state: "DONE", payload: { ...prepared.payload, sessionId: intent.id } });
            }
            if (this.durableCheckout) {
                const id = "checkout:" + intent.id;
                if (!await tx.get("operations", id))
                    await tx.put("operations", { id, businessId: current.businessId, kind: "CHECKOUT_RECONCILE", state: "PENDING", availableAt: now.toISOString(), attempts: 0, leaseUntil: null, payload: { sessionId: intent.id, expiresAt: current.expiresAt } });
            }
        });
        return intent;
    }
    async paymentEvent(payload: string, signature: string, now: Date) {
        const event = await this.payments.verify(payload, signature);
        return this.acceptVerifiedPayment(event, now);
    }
    /** Trusted adapter output only; browser input must never enter this boundary. */
    async acceptVerifiedPayment(event: import("./providers").VerifiedPayment, now: Date) {
        const businessId = await this.repo.transaction([], async (tx) => (await tx.get("requests", event.requestId))?.businessId);
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
            const missingAllocation = request.mode !== "QUOTE" && allocations.length !== 1;
            const expired = Date.parse(request.expiresAt) <= now.getTime() || allocations.some(a => a.status !== "HELD");
            const business = await tx.get("businesses", businessId);
            const failure = missingAllocation ? "JF_ALLOCATION_MISSING" : event.amountCents !== snapshot.platformFeeCents ? "PAYMENT_AMOUNT_MISMATCH" : prior ? "DUPLICATE_CHARGE" : request.status !== "PENDING_PAYMENT" || expired ? "HOLD_EXPIRED" : business?.status !== "PUBLISHED" ? "BUSINESS_UNAVAILABLE" : null;
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
                request.settledPaymentId = event.paymentId;
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
                await audit(tx, businessId, "REQUEST_CONFIRMED", "PAYMENT", now, request.id);
            }
            await tx.put("requests", request);
            return { status: request.status };
        });
    }
    async confirmation(token: string) {
        return this.repo.transaction([], async (tx) => {
            const request = (await tx.find("requests", { confirmationHash: hash(token) }))[0];
            if (!request)
                throw new AppError("Confirmation not found", 404);
            const snapshot = (await tx.find("snapshots", { businessId: request.businessId, requestId: request.id }))[0]!;
            if (!request.confirmedAt)
                return { accessToken: token, status: request.status, reference: request.reference, snapshot };
            return { accessToken: token, status: request.status, reference: request.reference, snapshot, request };
        });
    }
    async reconcile(now: Date, limit = 100) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AppError("Invalid expired-hold batch limit");
        const tenants = await this.repo.transaction([], async (tx) => [...new Set((await tx.find("requests", { status: "PENDING_PAYMENT" }, { limit, ranges: [{ field: "expiresAt", operator: "lte", value: now.toISOString() }] })).map(r => r.businessId))]);
        let count = 0;
        for (const businessId of tenants) {
            if (count >= limit) break;
            const processed = await this.repo.transaction(["tenant:" + businessId], async (tx) => {
                let changed = 0;
                for (const r of await tx.find("requests", { businessId, status: "PENDING_PAYMENT" }, { limit: limit - count, ranges: [{ field: "expiresAt", operator: "lte", value: now.toISOString() }] }))
                    if (Date.parse(r.expiresAt) <= now.getTime()) {
                        await tx.put("requests", { ...r, status: "EXPIRED" });
                        for (const a of await tx.find("allocations", { businessId, requestId: r.id }))
                            await tx.put("allocations", { ...a, status: "RELEASED", expiresAt: null });
                        await audit(tx, businessId, "HOLD_EXPIRED", "RECONCILIATION", now, r.id);
                        changed++;
                    }
                return changed;
            });
            count += processed;
        }
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
export async function deliverNotifications(repo: Repository, transport: import("./providers").NotificationTransport, now: Date, limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new AppError("Invalid notification batch limit");
    const began = performance.now();
    const batch = await repo.transaction(["outbox-worker"], async (tx) => {
        const rows = [...await tx.find("outbox", { state: "PENDING" }, { limit, oneOf: { field: "channel", values: ["EMAIL", "PUSH"] }, ranges: [{ field: "availableAt", operator: "lte", value: now.toISOString() }] }), ...await tx.find("outbox", { state: "SENDING" }, { limit, oneOf: { field: "channel", values: ["EMAIL", "PUSH"] }, ranges: [{ field: "availableAt", operator: "lte", value: now.toISOString() }, { field: "leaseUntil", operator: "lte", value: now.toISOString() }] })].filter(r => r.state !== "SENT" && Date.parse(r.availableAt) <= now.getTime() && (!r.leaseUntil || Date.parse(r.leaseUntil) <= now.getTime())).slice(0, limit);
        const leased = rows.map(row => ({ ...row, state: "SENDING" as const, leaseUntil: new Date(now.getTime() + 60000).toISOString(), leaseToken: randomUUID() }));
        for (const row of leased)
            await tx.put("outbox", row);
        return leased;
    });
    for (const row of batch) {
        const owned = await repo.transaction(["outbox:" + row.id], async (tx) => { const current = await tx.get("outbox", row.id); if (!current || current.state !== "SENDING" || current.leaseToken !== row.leaseToken)
            return false; await tx.put("outbox", { ...current, leaseUntil: new Date(now.getTime() + performance.now() - began + 60000).toISOString() }); return true; });
        if (!owned)
            continue;
        let sent = false;
        try {
            await transport.send(row);
            sent = true;
        }
        catch { /* no payloads or private data in logs */ }
        await repo.transaction(["outbox:" + row.id], async (tx) => {
            const current = await tx.get("outbox", row.id);
            if (!current || current.state === "SENT" || current.leaseToken !== row.leaseToken)
                return;
            await tx.put("outbox", { ...current, state: sent ? "SENT" : "PENDING", attempts: current.attempts + 1, leaseUntil: null, availableAt: new Date(now.getTime() + Math.min(3600000, 30000 * 2 ** Math.min(current.attempts, 7))).toISOString() });
        });
    }
    return batch.length;
}
