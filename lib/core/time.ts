import type { Hours, ModeConfig, Selection } from "./model";
import { AppError } from "./validation";
const formatters = new Map<string, Intl.DateTimeFormat>();
export function localParts(time: number, zone: string) {
    let f = formatters.get(zone);
    if (!f) {
        f = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
        if(formatters.size>=256)formatters.delete(formatters.keys().next().value!);
        formatters.set(zone, f);
    }
    const parts = Object.fromEntries(f.formatToParts(time).map(p => [p.type, p.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    return { date, minute: Number(parts.hour) * 60 + Number(parts.minute), local: `${date}T${parts.hour}:${parts.minute}` };
}
export function addDays(date: string, days: number): string { return new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10); }
export function localInstant(local: string, zone: string, ambiguity: "REJECT" | "EARLIER" | "LATER" = "REJECT"): number {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
        throw new AppError("Choose a local date and time");
    const nominal = Date.parse(local + ":00Z");
    if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 16) !== local)
        throw new AppError("Invalid local date");
    const offsets = new Set<number>();
    for (let h = -36; h <= 36; h += 6) {
        const sample = nominal + h * 3600000;
        offsets.add(Date.parse(localParts(sample, zone).local + ":00Z") - sample);
    }
    const candidates = [...offsets].map(offset => nominal - offset).filter(time => localParts(time, zone).local === local).sort((a, b) => a - b);
    if (!candidates.length)
        throw new AppError("That local time does not exist because of daylight saving time");
    if (candidates.length > 1 && ambiguity === "REJECT")
        throw new AppError("That time occurs twice; select earlier or later daylight-saving occurrence");
    return (ambiguity === "LATER" ? candidates.at(-1) : candidates[0])!;
}
export function dayDifference(start: number, end: number, zone: string): number { return (Date.parse(localParts(end, zone).date) - Date.parse(localParts(start, zone).date)) / 86400000; }
export function startOfDay(date: string, zone: string): number {
    for (let minute = 0; minute < 1440; minute++)
        try {
            return localInstant(date + "T" + String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0"), zone, "EARLIER");
        }
        catch { }
    return localInstant(addDays(date, 1) + "T00:00", zone, "EARLIER");
}
export function rollingWindow(now: Date, zone: string) { const today = localParts(now.getTime(), zone).date; return { start: startOfDay(today, zone), end: startOfDay(addDays(today, 30), zone), today, lastDate: addDays(today, 29) }; }
export function operatingWindows(date:string,hours:Hours){const weekday=new Date(date+"T12:00Z").getUTCDay();return hours.exceptions[date]??hours.weekly[String(weekday)]??[];}
function openAt(time:number,hours:Hours,zone:string,end=false):boolean {const p=localParts(time,zone);return operatingWindows(p.date,hours).some(w=>p.minute>=w.start&&(end?p.minute<=w.end:p.minute<w.end));}
export function checkSchedule(s: Selection, config: Exclude<ModeConfig, {
    mode: "QUOTE";
}>, hours: Hours, zone: string, now: Date) {
    const start = localInstant(s.startLocal, zone, s.ambiguity), end = localInstant(s.endLocal, zone, s.endAmbiguity??s.ambiguity), window = rollingWindow(now, zone);
    if (end <= start || start < window.start || end > window.end || start < now.getTime() + config.noticeMinutes * 60000)
        throw new AppError("Choose an interval within the next 30 calendar days and minimum booking notice");
    let occupiedStart = start, occupiedEnd = end, durationUnits: number | null = null;
    if (config.mode === "SERVICE") {
        if (end - start !== config.durationMinutes * 60000)
            throw new AppError("Appointment must match the configured service duration");
        occupiedStart -= config.bufferBefore * 60000;
        occupiedEnd += config.bufferAfter * 60000;
    }
    if (config.mode === "RENTAL") {
        durationUnits = config.price.kind === "HOURLY" ? (end - start) / 3600000 : dayDifference(start, end, zone);
        if (!Number.isInteger(durationUnits) || durationUnits < config.minimumUnits || config.price.kind === "DAILY" && localParts(start, zone).minute !== localParts(end, zone).minute)
            throw new AppError("Select whole rental units; daily rentals return at the same local clock time");
        occupiedEnd += config.turnaroundMinutes * 60000;
    }
    if (config.mode === "RESERVATION") {
        if (s.partySize < config.minimumParty || s.partySize > config.maximumParty)
            throw new AppError("Party size is outside this offering's limits");
        if(config.interval==="SLOT"&&!operatingWindows(localParts(start,zone).date,hours).some(w=>localParts(start,zone).minute>=w.start&&(localParts(start,zone).minute-w.start)%config.slotMinutes===0))throw new AppError("Choose an aligned reservation slot");
        if (config.interval === "SLOT" && end - start !== config.slotMinutes * 60000)
            throw new AppError("Reservation must match its time slot");
        if (config.price.kind === "PER_NIGHT") {
            durationUnits = dayDifference(start, end, zone);
            if (durationUnits < 1)
                throw new AppError("Select at least one calendar night");
        }
    }
    if (occupiedStart < window.start || occupiedEnd > window.end)
        throw new AppError("Buffers and turnaround must fit within the 30-day window");
    if (hours.blocked.some(b => Date.parse(b.start) < occupiedEnd && Date.parse(b.end) > occupiedStart))
        throw new AppError("This period is blocked");
    const overnight = config.mode === "RENTAL" || config.mode === "RESERVATION" && config.interval === "MULTIDAY";
    if (overnight) {
        if (!openAt(start, hours, zone) || !openAt(end, hours, zone, true))
            throw new AppError("Pickup, return or arrival is outside operating windows");
    }
    else {
        for (let t = occupiedStart; t < occupiedEnd; t += 60000)
            if (!openAt(t, hours, zone))
                throw new AppError("Appointment is outside operating hours");
    }
    return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), occupiedStart: new Date(occupiedStart).toISOString(), occupiedEnd: new Date(occupiedEnd).toISOString(), durationUnits };
}
export function calendarEvent(reference: string, name: string, start: string, end: string, createdAt: string = start): string {
    const escape = (v: string) => v.replace(/\\/g, "\\\\").replace(/[\r\n]+/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const stamp = (v: string) => v.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const fold = (line: string) => { let result = "", part = "", bytes = 0; for (const character of line) {
        const size = new TextEncoder().encode(character).length;
        if (bytes + size > 75) {
            result += part + "\r\n ";
            part = "";
            bytes = 1;
        }
        part += character;
        bytes += size;
    } return result + part; };
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JobFray//Confirmation//EN", "BEGIN:VEVENT", `UID:${escape(reference)}@jobfray.com`, `DTSTAMP:${stamp(createdAt)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escape(name)}`, "END:VEVENT", "END:VCALENDAR", ""].map(fold).join("\r\n");
}
