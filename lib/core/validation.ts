import { businessMode, fulfillment, integer, keys, parseBusinessModes, parseFulfillments, record } from "../domain/validation";
import type { Business, Hours, ModeConfig, Offering, Price, Selection, WebsiteContent } from "./model";
export class AppError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
export function string(value: unknown, max = 200, required = true): string {
    if (typeof value !== "string" || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))
        throw new AppError("Invalid text field");
    return value.trim();
}
export function number(value: unknown, min: number, max: number): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
        throw new AppError("Number outside allowed range");
    return value;
}
export function whole(value: unknown, min = 1, max = 1000000): number { return number(integer(value, min), min, max); }
export function email(value: unknown): string {
    const result = string(value, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
        throw new AppError("Enter a valid email address");
    return result;
}
export function phone(value: unknown): string {
    const result = string(value, 32).replace(/[ ()-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(result))
        throw new AppError("Use international phone format, for example +15125550123");
    return result;
}
export function list(value: unknown, max: number): unknown[] {
    if (!Array.isArray(value) || value.length > max)
        throw new AppError("Invalid list");
    return value;
}
export function ids(value: unknown, max = 12): string[] { return list(value, max).map(v => string(v, 80)); }
export function bool(value: unknown): boolean {
    if (typeof value !== "boolean")
        throw new AppError("Expected true or false");
    return value;
}
export function content(input: unknown): WebsiteContent {
    const v = record(input);
    keys(v, ["headline", "description", "gallery", "testimonials", "theme"]);
    const t = record(v.theme);
    keys(t, ["page", "components", "trim", "button", "letters"]);
    if (!["ROUND", "SOFT", "SQUARE"].includes(String(t.button)))
        throw new AppError("Invalid button style");
    return { headline: string(v.headline, 120, false), description: string(v.description, 3000, false), gallery: ids(v.gallery),
        testimonials: list(v.testimonials, 6).map(item => {
            const r = record(item);
            keys(r, ["name", "text", "genuine"]);
            if (r.genuine !== true)
                throw new AppError("Only genuine testimonials may be published");
            return { name: string(r.name, 80), text: string(r.text, 500), genuine: true };
        }),
        theme: { page: whole(t.page, 0, 9), components: whole(t.components, 0, 9), trim: whole(t.trim, 0, 9), letters: whole(t.letters, 0, 4), button: t.button as WebsiteContent["theme"]["button"] } };
}
export function hours(input: unknown): Hours {
    const v = record(input);
    keys(v, ["weekly", "exceptions", "blocked"]);
    const parse = (input: unknown, dates: boolean) => {
        const obj = record(input);
        if (Object.keys(obj).length > (dates ? 60 : 7))
            throw new AppError("Too many windows");
        return Object.fromEntries(Object.entries(obj).map(([key, values]) => {
            if (dates ? !/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(Date.parse(key)) || new Date(key).toISOString().slice(0, 10) !== key : !/^[0-6]$/.test(key))
                throw new AppError("Invalid calendar day");
            const windows = list(values, 8).map(item => {
                const w = record(item);
                keys(w, ["start", "end"]);
                const start = whole(w.start, 0, 1439), end = whole(w.end, 1, 1440);
                if (start >= end)
                    throw new AppError("Window end must follow start");
                return { start, end };
            }).sort((a, b) => a.start - b.start);
            if (windows.some((w, i) => i > 0 && w.start < windows[i - 1]!.end))
                throw new AppError("Operating windows overlap");
            return [key, windows];
        }));
    };
    return { weekly: parse(v.weekly, false), exceptions: parse(v.exceptions, true), blocked: list(v.blocked, 100).map(item => {
            const b = record(item);
            keys(b, ["start", "end"]);
            const start = string(b.start, 30), end = string(b.end, 30);
            if (!start.endsWith("Z") || !end.endsWith("Z") || !Number.isFinite(Date.parse(start)) || !(Date.parse(start) < Date.parse(end)))
                throw new AppError("Blocked periods require increasing UTC dates");
            return { start, end };
        }) };
}
function price(input: unknown): Price {
    const v = record(input);
    if (v.kind === "VARIABLE") {
        keys(v, ["kind"]);
        return { kind: "VARIABLE" };
    }
    keys(v, ["kind", "cents"]);
    if (typeof v.kind !== "string" || !["FIXED", "STARTING", "PER_PERSON", "PER_NIGHT", "HOURLY", "DAILY", "FREE"].includes(v.kind))
        throw new AppError("Invalid price type");
    const cents = integer(v.cents);
    if (v.kind === "FREE" && cents !== 0)
        throw new AppError("Free pricing must be zero");
    return { kind: v.kind as Exclude<Price["kind"], "VARIABLE">, cents };
}
export function configuration(input: unknown): ModeConfig {
    const v = record(input), mode = businessMode(v.mode), p = price(v.price);
    const base = { mode, price: p, fulfillments: [...parseFulfillments(v.fulfillments)], radiusMiles: number(v.radiusMiles, 0, 500) };
    const common = ["mode", "price", "fulfillments", "radiusMiles"];
    const allowed = mode === "RENTAL" ? ["HOURLY", "DAILY"] : mode === "SERVICE" ? ["FIXED", "STARTING", "VARIABLE"] : mode === "RESERVATION" ? ["FIXED", "PER_PERSON", "PER_NIGHT", "FREE"] : ["VARIABLE"];
    if (!allowed.includes(p.kind))
        throw new AppError("Price type is not applicable to this mode");
    if (base.fulfillments.includes("MOBILE") && base.radiusMiles <= 0)
        throw new AppError("Mobile fulfillment requires a service radius");
    switch (mode) {
        case "QUOTE":
            keys(v, common);
            return { ...base, mode };
        case "SERVICE":
            keys(v, [...common, "durationMinutes", "bufferBefore", "bufferAfter", "noticeMinutes"]);
            return { ...base, mode, durationMinutes: whole(v.durationMinutes, 15, 1440), bufferBefore: whole(v.bufferBefore, 0, 1440), bufferAfter: whole(v.bufferAfter, 0, 1440), noticeMinutes: whole(v.noticeMinutes, 0, 43200) };
        case "RENTAL":
            keys(v, [...common, "minimumUnits", "turnaroundMinutes", "noticeMinutes"]);
            return { ...base, mode, minimumUnits: whole(v.minimumUnits, 1, 720), turnaroundMinutes: whole(v.turnaroundMinutes, 0, 1440), noticeMinutes: whole(v.noticeMinutes, 0, 43200) };
        case "RESERVATION": {
            keys(v, [...common, "capacityUnit", "interval", "slotMinutes", "minimumParty", "maximumParty", "noticeMinutes", "arrivalInstructions"]);
            if (v.capacityUnit !== "SPACE" && v.capacityUnit !== "PERSON" || v.interval !== "SLOT" && v.interval !== "MULTIDAY")
                throw new AppError("Invalid reservation capacity or interval");
            const minimumParty = whole(v.minimumParty, 1, 10000), maximumParty = whole(v.maximumParty, minimumParty, 10000);
            if (p.kind === "PER_NIGHT" && v.interval !== "MULTIDAY")
                throw new AppError("Per-night pricing requires multi-day reservations");
            return { ...base, mode, capacityUnit: v.capacityUnit, interval: v.interval, slotMinutes: whole(v.slotMinutes, 15, 1440), minimumParty, maximumParty, noticeMinutes: whole(v.noticeMinutes, 0, 43200), arrivalInstructions: string(v.arrivalInstructions, 500, false) };
        }
    }
}
export function offering(input: unknown, businessId: string, id: string): Offering {
    const v = record(input);
    keys(v, ["name", "description", "photos", "active", "resourceId", "configurations"]);
    const configurations = list(v.configurations, 4).map(configuration);
    if (!configurations.length || new Set(configurations.map(c => c.mode)).size !== configurations.length)
        throw new AppError("Select unique offering modes");
    if (configurations.some(c => c.mode !== "QUOTE") && typeof v.resourceId !== "string")
        throw new AppError("Scheduled offerings need a shared capacity pool");
    return { id, businessId, name: string(v.name, 120), description: string(v.description, 2000), photos: ids(v.photos, 8), active: bool(v.active), resourceId: v.resourceId === null ? null : string(v.resourceId, 80), configurations };
}
export function profile(input: unknown): Pick<Business, "name" | "slug" | "category" | "description" | "email" | "phone" | "address" | "addressPublic" | "city" | "zip" | "latitude" | "longitude" | "timeZone" | "modes" | "directory"> {
    const v = record(input);
    keys(v, ["name", "slug", "category", "description", "email", "phone", "address", "addressPublic", "city", "zip", "latitude", "longitude", "timeZone", "modes", "directory"]);
    const slug = string(v.slug, 40);
    if (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) || ["www", "app", "api", "admin", "auth", "find", "mail", "support", "dashboard", "sites", "localhost"].includes(slug))
        throw new AppError("Choose an available business slug, 3-40 lowercase letters, numbers or hyphens");
    const timeZone = string(v.timeZone, 80);
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    const zip = string(v.zip, 5);
    if (!/^\d{5}$/.test(zip))
        throw new AppError("Enter a five-digit ZIP code");
    return { name: string(v.name, 120), slug, category: string(v.category, 100), description: string(v.description, 2000), email: email(v.email), phone: phone(v.phone), address: string(v.address, 250), addressPublic: bool(v.addressPublic), city: string(v.city, 100), zip, latitude: number(v.latitude, -90, 90), longitude: number(v.longitude, -180, 180), timeZone, modes: [...parseBusinessModes(v.modes)], directory: bool(v.directory) };
}
export function selection(input: unknown): Selection {
    const v = record(input);
    keys(v, ["businessId", "offeringId", "mode", "fulfillment", "quantity", "partySize", "startLocal", "endLocal", "ambiguity", "endAmbiguity", "contact", "photos"]);
    const c = record(v.contact);
    keys(c, ["name", "phone", "address", "notes"]);
    if (v.ambiguity !== "REJECT" && v.ambiguity !== "EARLIER" && v.ambiguity !== "LATER")
        throw new AppError("Invalid DST selection");
    if(v.endAmbiguity!==undefined&&v.endAmbiguity!=="REJECT"&&v.endAmbiguity!=="EARLIER"&&v.endAmbiguity!=="LATER")throw new AppError("Invalid end-time DST selection");
    const mode = businessMode(v.mode);
    return { businessId: string(v.businessId, 80), offeringId: string(v.offeringId, 80), mode, fulfillment: fulfillment(v.fulfillment), quantity: whole(v.quantity, 1, 10000), partySize: whole(v.partySize, 1, 10000), startLocal: string(v.startLocal, 16, false), endLocal: string(v.endLocal, 16, false), ambiguity: v.ambiguity, endAmbiguity:(v.endAmbiguity??v.ambiguity) as Selection["ambiguity"],
        contact: { name: string(c.name, 100), phone: phone(c.phone), address: string(c.address, 250, false), notes: string(c.notes, mode === "QUOTE" ? 200 : 1000, false) }, photos: ids(v.photos, mode === "QUOTE" ? 3 : 0) };
}
