"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { BookingService } from "@/lib/core/booking";
import { api, query, money } from "./api";
type Receipt = Awaited<ReturnType<BookingService["confirmation"]>>;
export function Confirmation() {
    const [receipt, setReceipt] = useState<Receipt | null>(null), [error, setError] = useState("");
    useEffect(() => {
        void (async () => {
            const token = new URLSearchParams(window.location.hash.slice(1)).get("access");
            if (token) {
                history.replaceState(null, "", window.location.pathname);
                await api("confirmation-open", { token });
            }
            setReceipt(await query<Receipt>("confirmation"));
        })().catch(e => setError(e.message));
    }, []);
    if (!receipt)
        return <section><h1>Your confirmation</h1>{error ? <p role="alert">{error}</p> : <p>Opening protected confirmation...</p>}</section>;
    const r = "request" in receipt ? receipt.request : undefined;
    return <section className="confirmation-card"><p className="eyebrow">JobFray / protected confirmation</p><h1>{r ? "Your request is confirmed" : receipt.status === "REFUND_REQUIRED" ? "Payment needs remediation" : "Request not confirmed"}</h1><p className="confirmation-reference">{receipt.reference}</p><span className="pill">{receipt.status}</span>
    {r ? <><h2>{r.offeringName}</h2><p>{r.businessName} / {r.mode} / {r.fulfillment}</p>{r.start && r.end && <p>{new Date(r.start).toLocaleString("en-US", { timeZone: r.timeZone })} to {new Date(r.end).toLocaleString("en-US", { timeZone: r.timeZone })} / {r.timeZone}</p>}<p>{r.contact.name} / {r.contact.phone}</p>{r.contact.address && <p>{r.contact.address}</p>}{r.businessAddress && <p>Business location: {r.businessAddress}</p>}<p>{r.instructions}</p><p>Quantity: {receipt.snapshot.quantity} / Party size: {receipt.snapshot.partySize}{receipt.snapshot.durationUnits ? ` / ${receipt.snapshot.durationUnits} ${receipt.snapshot.durationUnit}` : ""}</p><p>Underlying subtotal: <strong>{money(receipt.snapshot.underlyingSubtotalCents)}</strong></p><p>{receipt.snapshot.priceLabel}</p><p>Separate JF platform fee: <strong>{money(receipt.snapshot.platformFeeCents)}</strong></p><div className="notice"><h2>Contact the business directly</h2><p><a href={"tel:" + r.businessPhone}>{r.businessPhone}</a> / <a href={"mailto:" + r.businessEmail}>{r.businessEmail}</a></p><p>Contact the business for cancellations or rescheduling. Your confirmation and financial history remain preserved.</p></div><div className="actions">{r.start && <a className="button" href="/api/calendar">Add to calendar</a>}<button onClick={() => window.print()}>Print confirmation</button></div><p>Keep the protected link sent to your verified phone to securely reopen this page. Do not share it publicly.</p></> : <p>{receipt.status === "REFUND_REQUIRED" ? "JF could not fulfill this request. Refund remediation is required; this is not a booking confirmation." : "A browser redirect is not proof of payment. Confirmation appears only after verified payment and successful allocation."}</p>}
    <Link href="/terms">Terms and privacy information</Link>
  </section>;
}
