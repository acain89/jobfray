/* eslint-disable @next/next/no-img-element -- Private media requires same-origin session cookies and bypasses image optimization. */
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { workspace } from "@/lib/core/business";
import type { Offering, Resource } from "@/lib/core/model";
import { api, appSession, query, money } from "./api";
import { ProfileForm, ResourceForm, OfferingForm } from "./ManagementForms";
import { PushControls } from "./PushControls";
import { Builder } from "./Builder";
type Workspace = Awaited<ReturnType<typeof workspace>>;
const tabs = ["Overview", "Offerings", "Availability", "Business", "Website content", "Website design", "Publish & share", "Notifications"];
export function Dashboard() {
    const router = useRouter();
    const [notificationBusy,setNotificationBusy]=useState(false);
    const [data, setData] = useState<Workspace | null>(null), [tab, setTab] = useState("Overview"), [error, setError] = useState(""), [message, setMessage] = useState(""), [editing, setEditing] = useState<Offering | null>(null), [pool, setPool] = useState<Resource | null>(null), [sandbox, setSandbox] = useState(false), [origin, setOrigin] = useState(""), [ready, setReady] = useState<string[] | null>(null);
    const load = async () => {
        try {
            setData(await query<Workspace>("workspace"));
            setError("");
        }
        catch (e) {
            setError((e as Error).message);
        }
    };
    useEffect(() => {
        let cancelled = false;
        void appSession().then(async (s) => {
            if (cancelled)
                return;
            setSandbox(s.sandbox);
            setOrigin(window.location.origin);
            if (!s.available) {
                setError("Application persistence is not connected. Use the documented local sandbox to review the working application.");
                return;
            }
            await load();
        });
        return () => { cancelled = true; };
    }, []);
    const act = async (op: string, payload: unknown) => {
        setError("");
        setMessage("");
        try {
            await api(op, payload);
            setMessage("Saved successfully.");
            await load();
        }
        catch (e) {
            setError((e as Error).message);
        }
    };
    if (!data)
        return <section className="auth-panel"><h1>Your business workspace</h1>{error ? <p role="alert">{error}</p> : <p>Loading your workspace...</p>}<Link href="/login">Sign in</Link></section>;
    const b = data.business, url = b ? (sandbox ? origin + "/sites/" + b.slug : `https://${b.slug}.jobfray.com`) : "";
    return <div className="dashboard"><div className="dashboard-heading"><div><p className="eyebrow">Your free business workspace</p><h1>{b?.name ?? "Welcome to JobFray"}</h1><p>{b ? `${b.status} / ${b.city}` : "Build your website in a few simple steps."}</p></div><button type="button" onClick={async () => { await api("logout"); router.push("/login"); }}>Sign out</button></div>
    {sandbox && <div className="sandbox-banner">Local sandbox / synthetic data only / payments and delivery are simulated. <Link href="/sandbox/inbox">Local inbox</Link></div>}
    {error && <p role="alert" className="error-text">{error}</p>}{message && <p role="status">{message}</p>}
    {!b ? <ProfileForm business={null} onSaved={() => void load()}/> : <>
      <nav className="dashboard-tabs" aria-label="Dashboard sections">{tabs.map(name => <button key={name} type="button" aria-pressed={tab === name} onClick={() => { setTab(name); setMessage(""); }}>{name}</button>)}</nav>
      <section hidden={tab !== "Overview"}>{(data.historyLimited || data.historyCursor) && <div><p role="status">Showing up to 100 confirmed records, newest first.</p>{data.historyCursor && <button type="button" onClick={() => void load()}>First history page</button>}{data.historyLimited && <button type="button" onClick={() => { void query<Workspace>("workspace", { after: data.nextCursor! }).then(setData).catch(e => setError((e as Error).message)); }}>Next history page</button>}</div>}<div className="metrics"><div><strong>{data.requests.filter(r => r.start && Date.parse(r.start) > Date.parse(data.asOf) && r.status === "CONFIRMED").length}</strong><span>Upcoming bookings on this page</span></div><div><strong>{data.requests.filter(r => r.mode === "QUOTE" && r.status === "DELIVERED").length}</strong><span>Delivered quotes on this page</span></div><div><strong>{data.offerings.length}</strong><span>Offerings</span></div></div>
        <h2>Requests and history</h2>{!data.requests.length && <div className="empty-state"><h3>Your next customer connection starts here.</h3><p>Confirmed bookings, reservations and paid quote requests will appear here. External notification failures never remove these records.</p><button className="button" onClick={() => setTab("Offerings")}>Add your first offering</button></div>}
        <div className="request-list">{[...data.requests].sort((a, b) => (a.start ?? a.createdAt).localeCompare(b.start ?? b.createdAt)).map(r => {
                const snapshot = data.snapshots.find(s => s.requestId === r.id);
                return <article className="card" key={r.id}><div className="section-heading"><span className="pill">{r.mode} / {r.status}</span><strong>{r.reference}</strong></div><h3>{r.offeringName}</h3><p>{r.start ? new Date(r.start).toLocaleString("en-US", { timeZone: r.timeZone }) : "Quote request"}{r.end ? " to " + new Date(r.end).toLocaleString("en-US", { timeZone: r.timeZone }) : ""}</p><p>{r.contact.name} / <a href={"tel:" + r.contact.phone}>{r.contact.phone}</a></p>{r.contact.address && <p>{r.contact.address}</p>}<p>{r.contact.notes}</p><div className="photo-grid">{r.photos.map(id => <a href={"/media/" + id} key={id}><img src={"/media/" + id} width={180} height={120} alt="Customer job photo"/></a>)}</div><p>Underlying subtotal: {money(snapshot?.underlyingSubtotalCents ?? null)} / JF fee: {money(snapshot?.platformFeeCents ?? null)}</p>{r.payment === "REFUND_REQUIRED" && <p role="status">JF payment remediation is required. Confirmation history is preserved.</p>}{r.confirmedAt && (!r.start || Date.parse(r.start) > Date.parse(data.asOf)) && r.status !== "RELEASED" && <button onClick={() => {
                            if (window.confirm("Release future capacity while preserving all confirmation and financial history?"))
                                void act("release", { businessId: b.id, requestId: r.id });
                        }}>Mark operationally closed / release future capacity</button>}</article>;
            })}</div>
      </section>
      <section hidden={tab !== "Business"}><ProfileForm key={b.revision} business={b} onSaved={() => void load()}/></section>
      <section hidden={tab !== "Offerings"}><div className="section-heading"><h2>Your offerings</h2><button onClick={() => setEditing(null)}>New offering</button></div><div className="pills">{data.offerings.map(o => <button key={o.id} onClick={() => setEditing(o)}>{o.name}{o.active ? "" : " (inactive)"}</button>)}</div><OfferingForm key={editing?.id ?? "new"} business={b} resources={data.resources} offering={editing} onSaved={() => { setEditing(null); void load(); }}/></section>
      <section hidden={tab !== "Availability"}><div className="section-heading"><h2>Shared availability</h2><button onClick={() => setPool(null)}>New capacity pool</button></div><div className="pills">{data.resources.map(r => <button key={r.id} onClick={() => setPool(r)}>{r.name} / {r.capacity} units</button>)}</div><ResourceForm key={pool?.id ?? "new"} business={b} resource={pool} onSaved={() => { setPool(null); void load(); }}/></section>
      <section hidden={tab !== "Website content" && tab !== "Website design"}><Builder key={b.revision} business={b} offerings={data.offerings} design={tab === "Website design"}/></section>
      <section hidden={tab !== "Publish & share"} className="card stack"><h2>Preview, publish and share</h2><p>Preview your draft in the website editor before publishing. Automated readiness checks replace manual approval.</p><button onClick={async () => {
                try {
                    const result = await query<{
                        errors: string[];
                    }>("readiness");
                    setReady(result.errors);
                }
                catch (e) {
                    setError((e as Error).message);
                }
            }}>Check publication readiness</button>{ready && <div role="status">{ready.length ? <ul>{ready.map(v => <li key={v}>{v}</li>)}</ul> : <p>Your website is ready to publish.</p>}</div>}
        <div className="actions"><button className="button" onClick={() => void act("publish", { businessId: b.id })} disabled={b.status === "SUSPENDED"}>Publish current saved draft</button><button onClick={() => void act("unpublish", { businessId: b.id })}>Unpublish</button><Link href={"/sites/" + b.slug}>View published website</Link></div>
        {b.status === "SUSPENDED" && <p role="alert">Suspended: {b.suspensionReason}</p>}
        <div className="print-card"><h3>{b.name}</h3><p className="share-url">{url}</p><img src="/api/qr" width={260} height={260} alt="QR code for this business website"/><p>Rentals / Services / Quotes / Reservations</p></div>
        <div className="actions"><button onClick={async () => {
                try {
                    await navigator.clipboard.writeText(url);
                    setMessage("Website link copied.");
                }
                catch {
                    setError("Copy the website URL shown above.");
                }
            }}>Copy link</button><button onClick={async () => {
                if (navigator.share)
                    await navigator.share({ title: b.name, url }).catch(() => { });
                else
                    setMessage("Use Copy link to share this website.");
            }}>Share website</button><button onClick={() => window.print()}>Print QR presentation</button></div>
      </section>
      <section hidden={tab !== "Notifications"} className="card stack"><h2>Notifications</h2><p>Business email notifications are mandatory for new confirmed requests. The dashboard remains authoritative if delivery is delayed.</p><p>Delivery address: {data.account.email}</p><label className="check"><input type="checkbox" checked={b.pushEnabled} disabled={notificationBusy} onChange={async e => {const enabled=e.target.checked,previous=data;setNotificationBusy(true);setData({...data,business:{...b,pushEnabled:enabled}});try{await api("notification-settings",{businessId:b.id,pushEnabled:enabled});await load();}catch(error){setData(previous);setError((error as Error).message);}finally{setNotificationBusy(false);}}}/>Also queue optional PWA push notifications</label><PushControls businessId={b.id} publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}/></section>
    </>}
  </div>;
}
