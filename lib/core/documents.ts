import type { Table, Tables } from "./model";
import { record, integer } from "../domain/validation";
import { AppError, string, email, phone, profile, content, hours, offering, whole } from "./validation";
/** Validate stored JSON aggregates at the adapter boundary; malformed records fail closed. */
export function storedDocument<K extends Table>(table: K, input: unknown): Tables[K] {
    const v = record(input);
    string(v.id, 100);
    if ("businessId" in v && v.businessId !== null)
        string(v.businessId, 100);
    if (table === "businesses") {
        const fields = ["name", "slug", "category", "description", "email", "phone", "address", "addressPublic", "city", "zip", "latitude", "longitude", "timeZone", "modes", "directory"];
        profile(Object.fromEntries(fields.map(k => [k, v[k]])));
        content(v.draft);
        if (v.published !== null)
            content(v.published);
        string(v.ownerId, 100);
        whole(v.revision, 0, 2147483647);
        if (!["DRAFT", "PUBLISHED", "SUSPENDED"].includes(String(v.status)))
            throw new AppError("Invalid stored publication state", 503);
    }
    if (table === "offerings") {
        const { id, businessId, ...fields } = v;
        offering(fields, string(businessId, 100), string(id, 100));
    }
    if (table === "resources") {
        whole(v.capacity, 1, 10000);
        hours(v.hours);
    }
    if (table === "accounts") {
        email(v.email);
        if (typeof v.passwordHash !== "string" || !/^scrypt-32768:[A-Za-z0-9_-]+:[a-f0-9]{128}$/.test(v.passwordHash))
            throw new AppError("Invalid stored credential", 503);
    }
    if (table === "requests") {
        const c = record(v.contact);
        phone(c.phone);
        string(c.name, 100);
        string(c.notes, v.mode === "QUOTE" ? 200 : 1000, false);
        string(c.address, 250, false);
        if (!["RENTAL", "SERVICE", "QUOTE", "RESERVATION"].includes(String(v.mode)))
            throw new AppError("Invalid stored request", 503);
        if (v.mode === "QUOTE" && (v.start !== null || v.end !== null))
            throw new AppError("Invalid quote schedule", 503);
        if (v.mode !== "QUOTE" && (typeof v.start !== "string" || typeof v.end !== "string" || !Number.isFinite(Date.parse(v.start)) || !(Date.parse(v.start) < Date.parse(v.end))))
            throw new AppError("Invalid stored interval", 503);
    }
    if (table === "snapshots") {
        if (v.underlyingSubtotalCents !== null)
            integer(v.underlyingSubtotalCents);
        if (v.unitAmountCents !== null)
            integer(v.unitAmountCents);
        integer(v.platformFeeCents);
        if (v.currency !== "USD" || v.recipient !== "JOBFRAY" || v.processingCostPayer !== "JOBFRAY" || ![200, 300, 400, 500].includes(v.platformFeeCents as number))
            throw new AppError("Invalid financial snapshot", 503);
        string(v.pricingPolicyVersion, 100);
        if ((v.priceKind === "UNKNOWN") !== (v.underlyingSubtotalCents === null))
            throw new AppError("Invalid stored pricing facts", 503);
        // Never call the current fee calculator when reading historical facts.
    }
    return input as Tables[K];
}
