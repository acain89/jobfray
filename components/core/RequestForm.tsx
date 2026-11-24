"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SiteData } from "./SiteView";
import type { ModeConfig, Selection } from "@/lib/core/model";
import type { CheckoutResult } from "@/lib/core/booking";
import { DISCLOSURE } from "@/lib/core/model";
import { api, imageUpload, money } from "./api";
interface Slot {
    startLocal: string;
    endLocal: string;
    ambiguity: "EARLIER" | "LATER";
    endAmbiguity: "EARLIER" | "LATER";
    label: string;
}
export function RequestForm({ site, offeringId, initialMode, sandbox, enabled = false, today, lastDate }: {
    site: SiteData;
    offeringId: string;
    initialMode: string;
    sandbox: boolean;
    enabled?: boolean;
    today: string;
    lastDate: string;
}) {
    const router = useRouter();
    const offering = site.offerings.find(o => o.id === offeringId)!, [mode, setMode] = useState(initialMode), config = offering.configurations.find(c => c.mode === mode) ?? offering.configurations[0]!, [fulfillment, setFulfillment] = useState(config.fulfillments[0]!), [phone, setPhone] = useState(""), [photos, setPhotos] = useState<string[]>([]), [error, setError] = useState(""), [message, setMessage] = useState(""), [date, setDate] = useState(today), [slots, setSlots] = useState<Slot[]>([]), [slot, setSlot] = useState(""), [result, setResult] = useState<{
        snapshot: Awaited<ReturnType<import("@/lib/core/booking").BookingService["preview"]>>;
    } | null>(null), [busy, setBusy] = useState(false), [key] = useState(() => crypto.randomUUID());
    const [phoneModal, setPhoneModal] = useState(false), [capability, setCapability] = useState("");
    const phoneInput = useRef<HTMLInputElement>(null), dialog = useRef<HTMLDialogElement>(null), yesButton = useRef<HTMLButtonElement>(null), noButton=useRef<HTMLButtonElement>(null), pending = useRef<Selection | null>(null), capabilityPromise = useRef<Promise<string> | null>(null);
    const ensureCapability = async () => { if (capability)
        return capability; capabilityPromise.current ??= api<{
        capability: string;
    }>("request-capability", { businessId: site.id }).then(v => { setCapability(v.capability); return v.capability; }).catch(error => { capabilityPromise.current = null; throw error; }); return capabilityPromise.current; };
    useEffect(() => { if (phoneModal) {
        dialog.current?.showModal();
        yesButton.current?.focus();
    }
    else
        dialog.current?.close(); }, [phoneModal]);
    const editPhone = () => {dialog.current?.close();setPhoneModal(false);phoneInput.current?.focus();};
    const [partySize, setPartySize] = useState(config.mode === "RESERVATION" ? config.minimumParty : 1);
    const endBoundary = new Date(Date.parse(lastDate + "T12:00Z") + 86400000).toISOString().slice(0, 10) + "T00:00";
    const ranged = config.mode === "RENTAL" || config.mode === "RESERVATION" && config.interval === "MULTIDAY";
    const running = useRef(false);
    const run = async (fn: () => Promise<void>) => {
        if (running.current)
            return;
        running.current = true;
        setError("");
        setMessage("");
        setBusy(true);
        try {
            await fn();
        }
        catch (e) {
            setError((e as Error).message);setResult(null);
        }
        finally {
            running.current = false;
            setBusy(false);
        }
    };
    return <section className="request-form"><Link href={"/sites/" + site.slug}>Back to {site.name}</Link><p className="eyebrow">{site.name} / {site.city}</p><h1>{offering.name}</h1><p>{offering.description}</p>
    {!sandbox && !enabled && <aside className="notice"><h2>Online requests are not open yet</h2><p>Financial checkout remains disabled until the real payment adapter is separately authorized and verified. You can inspect offering information and availability.</p></aside>}
    {sandbox && <div className="sandbox-banner">Local mock workflow. No money is collected. Use synthetic contact details only.</div>}
    <form className="card stack" onChange={() => setResult(null)} onSubmit={e => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () => {
                if (!sandbox && !enabled)
                    throw new Error("Financial checkout is not enabled");
                const chosen = slots[Number(slot)], input: Selection = { businessId: site.id, offeringId: offering.id, mode: config.mode, fulfillment, quantity: config.mode === "RENTAL" ? Number(f.get("quantity")) : 1, partySize: config.mode === "RESERVATION" ? Number(f.get("party")) : 1, startLocal: config.mode === "QUOTE" ? "" : ranged ? String(f.get("start")) : chosen?.startLocal ?? "", endLocal: config.mode === "QUOTE" ? "" : ranged ? String(f.get("end")) : chosen?.endLocal ?? "", ambiguity: ranged ? String(f.get("ambiguity")) as Selection["ambiguity"] : chosen?.ambiguity ?? "REJECT", endAmbiguity: ranged ? String(f.get("endAmbiguity")) as Selection["ambiguity"] : chosen?.endAmbiguity ?? "REJECT", contact: { name: String(f.get("name")), phone, address: fulfillment === "MOBILE" ? String(f.get("address")) : "", notes: String(f.get("notes") ?? "") }, photos };
                pending.current = input;
                setResult(await api("review", { selection: input }));
            });
        }}>
      <fieldset className="stack request-fields" disabled={busy}>
      <div className="form-grid"><label>Request type<select value={config.mode} disabled={busy} onChange={e => { setMode(e.target.value); setPhotos([]); const next = offering.configurations.find(c => c.mode === e.target.value)!; setPartySize(next.mode === "RESERVATION" ? next.minimumParty : 1); setSlots([]); setSlot(""); setFulfillment(offering.configurations.find(c => c.mode === e.target.value)!.fulfillments[0]!); }}>{offering.configurations.map(c => <option value={c.mode} key={c.mode}>{c.mode}</option>)}</select></label><label>Fulfillment<select value={fulfillment} disabled={busy} onChange={e => { setFulfillment(e.target.value as "MOBILE" | "STOREFRONT"); setSlots([]); setSlot(""); }}>{config.fulfillments.map(v => <option value={v} key={v}>{v === "MOBILE" ? config.mode === "RENTAL" ? "Business delivery" : "At your location" : config.mode === "RENTAL" ? "Customer pickup" : "At the business"}</option>)}</select></label></div>
      <p>{priceDescription(config)} A separate customer-paid JF platform fee is shown before payment.</p>
      {config.mode === "RENTAL" && <label>Quantity<input name="quantity" type="number" min={1} max={10000} defaultValue={1} required/></label>}
      {config.mode === "RESERVATION" && <label>Party size<input name="party" type="number" min={config.minimumParty} max={config.maximumParty} value={partySize} onChange={e => { setPartySize(Number(e.target.value)); setSlots([]); setSlot(""); }} required/></label>}
      {config.mode !== "QUOTE" && <fieldset><legend>Choose dates and times / {site.timeZone}</legend><p>One rolling 30-calendar-day window: {today} through {lastDate}. Availability is rechecked when your 15-minute checkout hold is created.</p>
        {ranged ? <><div className="form-grid"><label>Start<input name="start" type="datetime-local" min={today + "T00:00"} max={lastDate + "T23:59"} required/></label><label>End<input name="end" type="datetime-local" min={today + "T00:00"} max={endBoundary} required/></label></div><label>Start-time daylight-saving occurrence<select name="ambiguity" defaultValue="REJECT"><option value="REJECT">Ask me to choose if ambiguous</option><option value="EARLIER">Earlier occurrence</option><option value="LATER">Later occurrence</option></select></label><label>End-time daylight-saving occurrence<select name="endAmbiguity" defaultValue="REJECT"><option value="REJECT">Ask me to choose if ambiguous</option><option value="EARLIER">Earlier occurrence</option><option value="LATER">Later occurrence</option></select></label>{config.mode === "RENTAL" && <p>Hourly rentals use whole elapsed hours. Daily rentals use whole business-local calendar days and return at the same local clock time. Pickup and return must fit operating windows; overnight occupancy does not require the business to stay open.</p>}</> : <><div className="form-grid"><label>Date<input type="date" min={today} max={lastDate} value={date} onChange={e => { setDate(e.target.value); setSlots([]); setSlot(""); }}/></label><button type="button" disabled={busy} onClick={() => void run(async () => {
                    const params = new URLSearchParams({ op: "slots", businessId: site.id, offeringId: offering.id, mode: config.mode, fulfillment, date, partySize: String(partySize) }), r = await fetch("/api/core?" + params), v = await r.json();
                    if (!r.ok)
                        throw new Error(v.error);
                    setSlots(v.slots);
                    setSlot("");
                    setMessage(v.slots.length ? "Choose an available appointment." : "No available appointments on this date.");
                })}>Find available times</button></div><label>Available appointment<select value={slot} onChange={e => setSlot(e.target.value)} required><option value="">Choose a time</option>{slots.map((v, i) => <option value={i} key={v.startLocal + v.ambiguity}>{v.label}</option>)}</select></label></>}
      </fieldset>}
      <fieldset><legend>Your contact details / no account needed</legend><label>Name<input name="name" autoComplete="name" maxLength={100} required/></label><label>Phone (international format)<input type="tel" value={phone} autoComplete="tel" placeholder="+15125550124" ref={phoneInput} onChange={e => { setPhone(e.target.value); setResult(null); setPhoneModal(false); }} required/></label>
        {fulfillment === "MOBILE" && <label>{config.mode === "RENTAL" ? "Delivery" : "Service"} address<input name="address" autoComplete="street-address" maxLength={250} placeholder="200 Customer Lane, Austin, TX 78701" required/><small>Exact eligibility is verified before checkout. Your address is not public.</small></label>}
      </fieldset>
      <label>{config.mode === "QUOTE" ? "Job description (200 characters maximum)" : "Notes (optional)"}<textarea name="notes" maxLength={config.mode === "QUOTE" ? 200 : 1000} required={config.mode === "QUOTE"} rows={3}/></label>
      {config.mode === "QUOTE" && <><label>Job photos: 1 required, maximum 3<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={e => void run(async () => {
                const added: string[] = [];
                for (const file of Array.from(e.target.files ?? []).slice(0, 3 - photos.length))
                    added.push(await imageUpload(file, site.id, "QUOTE", await ensureCapability()));
                setPhotos(v => [...v, ...added]);
            })}/><small>Up to 5 MB per image; private, validated and metadata-stripped.</small></label><div className="pills">{photos.map((id, i) => <button type="button" key={id} onClick={() => setPhotos(v => v.filter(x => x !== id))}>Photo {i + 1} / remove</button>)}</div></>}
      <aside className="notice"><h2>Before you continue</h2><p>{DISCLOSURE}</p><Link href="/terms">Read the draft Terms and privacy information</Link></aside>
      {!result && <button className="button" disabled={busy || !sandbox && !enabled}>{busy ? "Checking availability..." : "Review request and separate JF fee"}</button>}
      </fieldset>
    </form>
    {result && <section className="card stack" aria-labelledby="review-heading"><h2 id="review-heading">Review your request</h2><p>Underlying subtotal: <strong>{money(result.snapshot.underlyingSubtotalCents)}</strong></p><p>{result.snapshot.priceLabel}</p><p>Quantity: {result.snapshot.quantity} / Party: {result.snapshot.partySize}{result.snapshot.durationUnits ? ` / Duration: ${result.snapshot.durationUnits} ${result.snapshot.durationUnit}` : ""}</p><p>Separate JF platform fee: <strong>{money(result.snapshot.platformFeeCents)}</strong></p><p>No underlying business payment is collected by JF. Your 15-minute checkout begins only after you confirm your phone number.</p><button className="button" disabled={busy} onClick={() => setPhoneModal(true)}>Pay Now</button></section>}

    <dialog ref={dialog} className="phone-confirmation" onKeyDown={e=>{if(e.key!=="Tab")return;if(e.shiftKey&&document.activeElement===yesButton.current){e.preventDefault();noButton.current?.focus();}else if(!e.shiftKey&&document.activeElement===noButton.current){e.preventDefault();yesButton.current?.focus();}}} aria-labelledby="phone-confirm-title" aria-describedby="phone-confirm-description" onCancel={() => setPhoneModal(false)} onClick={e => { if (e.target === e.currentTarget)
        setPhoneModal(false); }}>
      <h2 id="phone-confirm-title">Confirm your phone number</h2>
      <p id="phone-confirm-description">The business will use this number to contact you.</p>
      <p className="confirmed-phone"><strong>{formatPhone(result?.snapshot.customerPhone ?? "")}</strong></p>
      <p>Is this number correct?</p>
      <div className="stack"><button ref={yesButton} type="button" className="phone-confirm-yes" disabled={busy} onClick={() => {
            setPhoneModal(false);
            void run(async () => {
                if (!pending.current || !result)
                    throw new Error("Review your current request first");
                const checkout = await api<CheckoutResult>("checkout", { selection: pending.current, capability: await ensureCapability(), confirmedPhone: result.snapshot.customerPhone,review:result.snapshot, idempotencyKey: key });
                if (sandbox) {
                    await api("mock-pay", { requestId: checkout.requestId });
                    router.push("/confirmation");
                }
                else {
                    const payment = await api<{
                        checkoutUrl: string;
                    }>("payment-start", { requestId: checkout.requestId });
                    const url = new URL(payment.checkoutUrl);
                    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
                        throw new Error("Invalid checkout destination");
                    window.location.assign(url.href);
                }
            });
        }}>Yes — Continue to Payment</button><button type="button" ref={noButton} className="phone-confirm-no" onClick={editPhone}>No — Edit Phone Number</button></div>
    </dialog>
    {error && <p role="alert" className="error-text">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
function priceDescription(c: ModeConfig) {
    if (c.mode === "QUOTE")
        return "Quote request: $3 JF fee.";
    if (c.price.kind === "VARIABLE")
        return "Underlying price is genuinely variable and arranged directly with the business; the JF fee is $3.";
    return `${c.price.kind === "STARTING" ? "Advertised minimum, not a guaranteed final price: " : "Underlying price: "}${money(c.price.cents)}${c.price.kind === "HOURLY" ? " per whole hour" : c.price.kind === "DAILY" ? " per whole local day" : c.price.kind === "PER_PERSON" ? " per person" : c.price.kind === "PER_NIGHT" ? " per calendar night" : ""}.`;
}
function formatPhone(value: string) { return /^\+1\d{10}$/.test(value) ? "+1 (" + value.slice(2, 5) + ") " + value.slice(5, 8) + "-" + value.slice(8) : value; }
