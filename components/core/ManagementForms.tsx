/* eslint-disable @next/next/no-img-element -- Private media requires same-origin session cookies and bypasses image optimization. */
"use client";
import { useState } from "react";
import type { Business, BusinessMode, Offering, Resource, ModeConfig } from "@/lib/core/model";
import { api, imageUpload } from "./api";
import { localInstant, localParts } from "@/lib/core/time";
const MODES: BusinessMode[] = ["RENTAL", "SERVICE", "QUOTE", "RESERVATION"];
function cents(value: FormDataEntryValue | null): number {
    const s = String(value ?? "0");
    if (!/^\d+(?:\.\d{1,2})?$/.test(s))
        throw new Error("Use a nonnegative price with at most two decimal places");
    const [a, b = ""] = s.split(".");
    const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
    if (!Number.isSafeInteger(n))
        throw new Error("Price is too large");
    return n;
}
export function ProfileForm({ business, onSaved }: {
    business: Business | null;
    onSaved: () => void;
}) {
    const [error, setError] = useState(""), [busy, setBusy] = useState(false);
    return <form className="card stack" onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
                await api("save-profile", { name: f.get("name"), slug: f.get("slug"), category: f.get("category"), description: f.get("description"), email: f.get("email"), phone: f.get("phone"), address: f.get("address"), addressPublic: f.has("addressPublic"), city: f.get("city"), zip: f.get("zip"), latitude: 0, longitude: 0, timeZone: f.get("timeZone"), modes: MODES.filter(m => f.has(m)), directory: f.has("directory") });
                onSaved();
            }
            catch (err) {
                setError((err as Error).message);
            }
            finally {
                setBusy(false);
            }
        }}>
    <h2>{business ? "Business information" : "1. Tell us about your business"}</h2><p>Your website is free. Banking information is never required.</p>
    <div className="form-grid"><label>Business name<input name="name" defaultValue={business?.name} maxLength={120} required/></label><label>Website slug<input name="slug" defaultValue={business?.slug} pattern="[a-z][a-z0-9\-]{1,38}[a-z0-9]" maxLength={40} required/><small>3-40 lowercase letters, numbers or hyphens.</small></label><label>Category<input name="category" defaultValue={business?.category} maxLength={100} required/></label><label>Business email<input name="email" type="email" defaultValue={business?.email} required/></label><label>Business phone<input name="phone" type="tel" placeholder="+15125550123" defaultValue={business?.phone} required/></label><label>Time zone<input name="timeZone" defaultValue={business?.timeZone ?? "America/Chicago"} required/></label></div>
    <label>Business description<textarea name="description" defaultValue={business?.description} rows={3} maxLength={2000} required/></label>
    <fieldset><legend>Business modes</legend><div className="check-row">{MODES.map(m => <label key={m}><input type="checkbox" name={m} defaultChecked={business?.modes.includes(m) ?? false}/>{m}</label>)}</div></fieldset>
    <div className="form-grid"><label>Operating address (private by default)<input name="address" defaultValue={business?.address} placeholder="100 Test Lane, Austin, TX 78701" required/></label><label>City<input name="city" defaultValue={business?.city ?? "Austin"} required/></label><label>ZIP<input name="zip" defaultValue={business?.zip ?? "78701"} pattern="[0-9]{5}" required/></label></div>
    <label className="check"><input type="checkbox" name="addressPublic" defaultChecked={business?.addressPublic ?? false}/>Show operating address publicly</label><label className="check"><input type="checkbox" name="directory" defaultChecked={business?.directory ?? true}/>Include my published business in the directory</label>
    <small>In the local sandbox, exact-address geocoding uses synthetic fixtures, including 100 Test Lane, Austin, TX 78701.</small>
    <button className="button" disabled={busy}>{busy ? "Saving..." : "Save business information"}</button>{error && <p className="error-text" role="alert">{error}</p>}
  </form>;
}
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const clock = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const minute = (v: FormDataEntryValue | null) => { const [h, m] = String(v).split(":").map(Number); return h! * 60 + m!; };
export function ResourceForm({ business, resource, onSaved }: {
    business: Business;
    resource: Resource | null;
    onSaved: () => void;
}) {
    const [exceptions, setExceptions] = useState<{
        date: string;
        closed: boolean;
        start: string;
        end: string;
    }[]>(Object.entries(resource?.hours.exceptions ?? {}).map(([date, w]) => ({ date, closed: !w.length, start: clock(w[0]?.start ?? 540), end: clock(w[0]?.end ?? 1020) }))), [blocks, setBlocks] = useState<{
        start: string;
        end: string;
        originalStart?: string;
        originalEnd?: string;
    }[]>((resource?.hours.blocked ?? []).map(b => ({ start: localParts(Date.parse(b.start), business.timeZone).local, end: localParts(Date.parse(b.end), business.timeZone).local, originalStart: b.start, originalEnd: b.end }))), [error, setError] = useState("");
    return <form className="card stack" onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            const f = new FormData(e.currentTarget);
            try {
                const weekly = Object.fromEntries(weekdays.map((_, i) => [String(i), f.has("day" + i) ? [{ start: minute(f.get("start" + i)), end: minute(f.get("end" + i)) }] : []]));
                if (new Set(exceptions.map(v => v.date)).size !== exceptions.length)
                    throw new Error("Use one exception per date.");
                const blocked = blocks.map(b => ({ start: b.originalStart && localParts(Date.parse(b.originalStart), business.timeZone).local === b.start ? b.originalStart : new Date(localInstant(b.start, business.timeZone)).toISOString(), end: b.originalEnd && localParts(Date.parse(b.originalEnd), business.timeZone).local === b.end ? b.originalEnd : new Date(localInstant(b.end, business.timeZone)).toISOString() }));
                await api("save-resource", { businessId: business.id, id: resource?.id, resource: { name: f.get("name"), capacity: Number(f.get("capacity")), hours: { weekly, exceptions: Object.fromEntries(exceptions.map(v => [v.date, v.closed ? [] : [{ start: minute(v.start), end: minute(v.end) }]])), blocked } } });
                onSaved();
            }
            catch (err) {
                setError((err as Error).message);
            }
        }}>
    <h2>{resource ? "Edit shared capacity" : "Add shared capacity"}</h2><p>A pool can be shared by multiple offerings. No employee, room or seat assignments are needed. Times use {business.timeZone}.</p>
    <div className="form-grid"><label>Pool name<input name="name" defaultValue={resource?.name ?? "Main capacity"} maxLength={100} required/></label><label>Available units<input name="capacity" type="number" min={1} max={10000} defaultValue={resource?.capacity ?? 1} required/></label></div>
    <fieldset><legend>Weekly operating hours</legend><p>Use 24-hour closing times; 24:00 means midnight at the end of the day.</p>{weekdays.map((day, i) => { const w = resource?.hours.weekly[String(i)]?.[0]; return <div className="hours-row" key={day}><label className="check"><input name={"day" + i} type="checkbox" defaultChecked={resource ? !!w : i > 0 && i < 6}/>{day}</label><label>Open<input name={"start" + i} type="time" defaultValue={clock(w?.start ?? 540)} required/></label><label>Close<input name={"end" + i} type="text" pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00" maxLength={5} defaultValue={clock(w?.end ?? 1020)} required/></label></div>; })}</fieldset>
    <fieldset><legend>Date-specific exceptions</legend>{exceptions.map((v, i) => <div className="form-grid" key={i}><label>Date<input type="date" value={v.date} onChange={e => setExceptions(a => a.map((x, n) => i === n ? { ...x, date: e.target.value } : x))} required/></label><label className="check"><input type="checkbox" checked={v.closed} onChange={e => setExceptions(a => a.map((x, n) => i === n ? { ...x, closed: e.target.checked } : x))}/>Closed</label>{!v.closed && <><label>Open<input type="time" value={v.start} onChange={e => setExceptions(a => a.map((x, n) => i === n ? { ...x, start: e.target.value } : x))}/></label><label>Close<input type="text" pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00" maxLength={5} value={v.end} onChange={e => setExceptions(a => a.map((x, n) => i === n ? { ...x, end: e.target.value } : x))}/></label></>}<button type="button" onClick={() => setExceptions(a => a.filter((_, n) => n !== i))}>Remove exception</button></div>)}<button type="button" onClick={() => setExceptions(a => [...a, { date: "", closed: true, start: "09:00", end: "17:00" }])}>Add date exception</button></fieldset>
    <fieldset><legend>Blocked occupancy periods</legend><p>{blocks.length} periods are blocked. Remove a row to unblock future availability. Confirmed obligations remain intact.</p>{blocks.map((v, i) => <div className="form-grid" key={i}><label>Start<input type="datetime-local" value={v.start} onChange={e => setBlocks(a => a.map((x, n) => i === n ? { ...x, start: e.target.value } : x))} required/></label><label>End<input type="datetime-local" value={v.end} onChange={e => setBlocks(a => a.map((x, n) => i === n ? { ...x, end: e.target.value } : x))} required/></label><button type="button" onClick={() => setBlocks(a => a.filter((_, n) => n !== i))}>Remove blocked period</button></div>)}<button type="button" onClick={() => setBlocks(a => [...a, { start: "", end: "" }])}>Add blocked period</button></fieldset>
    <p>Today through the next 29 local dates. Checkout holds last 15 minutes. Existing confirmed obligations remain intact when these settings change.</p><button className="button">Save availability and capacity</button>{error && <p role="alert" className="error-text">{error}</p>}
  </form>;
}
function ModeFields({ mode, config }: {
    mode: BusinessMode;
    config: ModeConfig | undefined;
}) {
    return <fieldset><legend>{mode} settings</legend><div className="check-row"><label className="check"><input name={mode + "-MOBILE"} type="checkbox" defaultChecked={config?.fulfillments.includes("MOBILE") ?? false}/>{mode === "RENTAL" ? "Business delivery" : "Mobile"}</label><label className="check"><input name={mode + "-STOREFRONT"} type="checkbox" defaultChecked={config?.fulfillments.includes("STOREFRONT") ?? true}/>{mode === "RENTAL" ? "Customer pickup" : "Storefront"}</label></div>
    <div className="form-grid"><label>Mobile/delivery radius (miles)<input type="number" name={mode + "-radius"} min={0} max={500} defaultValue={config?.radiusMiles ?? 10}/></label>
    {mode !== "QUOTE" && <><label>Pricing<select name={mode + "-price"} defaultValue={config?.price.kind ?? (mode === "RENTAL" ? "HOURLY" : "FIXED")}>{(mode === "RENTAL" ? ["HOURLY", "DAILY"] : mode === "SERVICE" ? ["FIXED", "STARTING", "VARIABLE"] : ["FIXED", "PER_PERSON", "PER_NIGHT", "FREE"]).map(v => <option value={v} key={v}>{v.replaceAll("_", " ")}</option>)}</select></label><label>Underlying price (USD)<input type="number" min={0} step="0.01" name={mode + "-cents"} defaultValue={config?.price.kind !== "VARIABLE" && config?.price.cents !== undefined ? (config.price.cents / 100).toFixed(2) : "0.00"}/></label><label>Minimum notice (minutes)<input type="number" name={mode + "-notice"} min={0} max={43200} defaultValue={config?.mode !== "QUOTE" ? config?.noticeMinutes ?? 60 : 60}/></label></>}
    {mode === "SERVICE" && <><label>Appointment minutes<input type="number" name="SERVICE-duration" min={15} max={1440} defaultValue={config?.mode === "SERVICE" ? config.durationMinutes : 60}/></label><label>Buffer before (minutes)<input type="number" name="SERVICE-before" min={0} max={1440} defaultValue={config?.mode === "SERVICE" ? config.bufferBefore : 0}/></label><label>Buffer after (minutes)<input type="number" name="SERVICE-after" min={0} max={1440} defaultValue={config?.mode === "SERVICE" ? config.bufferAfter : 0}/></label></>}
    {mode === "RENTAL" && <><label>Minimum rental units<input type="number" name="RENTAL-minimum" min={1} max={720} defaultValue={config?.mode === "RENTAL" ? config.minimumUnits : 1}/></label><label>Turnaround minutes<input type="number" name="RENTAL-turnaround" min={0} max={1440} defaultValue={config?.mode === "RENTAL" ? config.turnaroundMinutes : 0}/></label></>}
    {mode === "RESERVATION" && <><label>Capacity counted by<select name="RESERVATION-capacity" defaultValue={config?.mode === "RESERVATION" ? config.capacityUnit : "SPACE"}><option value="SPACE">Pooled spaces</option><option value="PERSON">People</option></select></label><label>Reservation intervals<select name="RESERVATION-interval" defaultValue={config?.mode === "RESERVATION" ? config.interval : "SLOT"}><option value="SLOT">Fixed time slots</option><option value="MULTIDAY">Multi-day intervals</option></select></label><label>Slot minutes<input type="number" name="RESERVATION-slot" min={15} max={1440} defaultValue={config?.mode === "RESERVATION" ? config.slotMinutes : 60}/></label><label>Minimum party size<input type="number" name="RESERVATION-minimum" min={1} max={10000} defaultValue={config?.mode === "RESERVATION" ? config.minimumParty : 1}/></label><label>Maximum party size<input type="number" name="RESERVATION-maximum" min={1} max={10000} defaultValue={config?.mode === "RESERVATION" ? config.maximumParty : 10}/></label><label>Arrival instructions<textarea name="RESERVATION-instructions" maxLength={500} defaultValue={config?.mode === "RESERVATION" ? config.arrivalInstructions : ""}/></label></>}
    </div>{mode === "QUOTE" && <p>Quote requests cost $3, require a customer-confirmed contact phone, a description of up to 200 characters and 1-3 photos, and do not reserve time.</p>}
  </fieldset>;
}
export function OfferingForm({ business, resources, offering, onSaved }: {
    business: Business;
    resources: Resource[];
    offering: Offering | null;
    onSaved: () => void;
}) {
    const [selected, setSelected] = useState<BusinessMode[]>(offering?.configurations.map(c => c.mode) ?? []), [photos, setPhotos] = useState(offering?.photos ?? []), [error, setError] = useState("");
    return <form className="card stack" onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            const f = new FormData(e.currentTarget);
            try {
                const configs = selected.map(mode => {
                    const kind = String(f.get(mode + "-price") ?? "VARIABLE"), base = { mode, fulfillments: (["MOBILE", "STOREFRONT"] as const).filter(v => f.has(mode + "-" + v)), radiusMiles: Number(f.get(mode + "-radius")), price: kind === "VARIABLE" ? { kind } : { kind, cents: kind === "FREE" ? 0 : cents(f.get(mode + "-cents")) } };
                    return { ...base, ...(mode === "SERVICE" ? { durationMinutes: Number(f.get("SERVICE-duration")), bufferBefore: Number(f.get("SERVICE-before")), bufferAfter: Number(f.get("SERVICE-after")), noticeMinutes: Number(f.get(mode + "-notice")) } : mode === "RENTAL" ? { minimumUnits: Number(f.get("RENTAL-minimum")), turnaroundMinutes: Number(f.get("RENTAL-turnaround")), noticeMinutes: Number(f.get(mode + "-notice")) } : mode === "RESERVATION" ? { capacityUnit: f.get("RESERVATION-capacity"), interval: f.get("RESERVATION-interval"), slotMinutes: Number(f.get("RESERVATION-slot")), minimumParty: Number(f.get("RESERVATION-minimum")), maximumParty: Number(f.get("RESERVATION-maximum")), noticeMinutes: Number(f.get(mode + "-notice")), arrivalInstructions: f.get("RESERVATION-instructions") } : {}) };
                });
                await api("save-offering", { businessId: business.id, id: offering?.id, offering: { name: f.get("name"), description: f.get("description"), photos, active: f.has("active"), resourceId: f.get("resourceId") || null, configurations: configs } });
                onSaved();
            }
            catch (err) {
                setError((err as Error).message);
            }
        }}>
    <h2>{offering ? "Edit offering" : "Add an offering"}</h2><label>Name<input name="name" defaultValue={offering?.name} maxLength={120} required/></label><label>Description<textarea name="description" defaultValue={offering?.description} maxLength={2000} required/></label>
    <fieldset><legend>Applicable modes</legend><div className="check-row">{[...new Set([...business.modes, ...(offering?.configurations.map(c => c.mode) ?? [])])].map(mode => <label key={mode}><input type="checkbox" checked={selected.includes(mode)} onChange={e => setSelected(a => e.target.checked ? [...a, mode] : a.filter(v => v !== mode))}/>{mode}</label>)}</div></fieldset>
    <label>Shared capacity pool<select name="resourceId" defaultValue={offering?.resourceId ?? ""}><option value="">No scheduled capacity (quote only)</option>{resources.map(r => <option value={r.id} key={r.id}>{r.name} / {r.capacity} units</option>)}</select></label>
    {selected.map(mode => <ModeFields key={mode} mode={mode} config={offering?.configurations.find(c => c.mode === mode)}/>)}
    <label>Offering photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={async (e) => {
            try {
                const ids: string[] = [];
                for (const file of Array.from(e.target.files ?? []).slice(0, 8 - photos.length))
                    ids.push(await imageUpload(file, business.id, "BUSINESS"));
                setPhotos(v => [...v, ...ids]);
            }
            catch (err) {
                setError((err as Error).message);
            }
        }}/></label><div className="photo-grid">{photos.map(id => <div key={id}><img src={"/media/" + id} alt="Offering preview" width={160} height={110}/><button type="button" onClick={() => setPhotos(a => a.filter(v => v !== id))}>Remove photo</button></div>)}</div>
    <label className="check"><input type="checkbox" name="active" defaultChecked={offering?.active ?? true}/>Active for new requests</label><button className="button">Save offering</button>{error && <p className="error-text" role="alert">{error}</p>}
  </form>;
}
