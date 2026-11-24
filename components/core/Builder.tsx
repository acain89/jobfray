/* eslint-disable @next/next/no-img-element -- Private media requires same-origin session cookies and bypasses image optimization. */
"use client";
import { useEffect, useRef, useState } from "react";
import type { Business, Offering, WebsiteContent } from "@/lib/core/model";
import { api, imageUpload, registerDraftFlush, query } from "./api";
import { DraftSaver } from "@/lib/domain/draft-save";
import { SiteView, PAGE_COLORS, COMPONENT_COLORS, TRIM_COLORS } from "./SiteView";
export function Builder({ business, offerings, design }: {
    business: Business;
    offerings: Offering[];
    design: boolean;
}) {
    const [value, setValue] = useState<WebsiteContent>(business.draft), [state, setState] = useState("Saved"), [error, setError] = useState(""), [retry, setRetry] = useState(0);
    const generation = useRef(0), dirty = useRef(false), latest = useRef(value);
    const [saver] = useState(() => new DraftSaver(business.draft, business.revision, {
        write: async (next, revision) => (await api<{
            revision: number;
        }>("autosave", { businessId: business.id, revision, content: next, design: true })).revision,
        read: async () => {
            const current = await query<{
                business: Business | null;
            }>("workspace");
            if (current.business?.id !== business.id)
                throw new Error("Business session changed");
            return { value: current.business.draft, revision: current.business.revision };
        }
    }));
    useEffect(() => {
        latest.current = value;
        const current = ++generation.current, changed = !saver.isSaved(value);
        dirty.current = changed;
        const save = async () => {
            try {
                await saver.save(value);
                if (current === generation.current) {
                    dirty.current = false;
                    setState("Saved");
                    setError("");
                }
            }
            catch (e) {
                if (current === generation.current) {
                    dirty.current = true;
                    setState("Unsaved changes");
                    setError((e as Error).message);
                }
                throw e;
            }
        };
        const timer = changed ? setTimeout(() => { void save().catch(() => { }); }, 700) : undefined;
        if (!changed)
            queueMicrotask(() => {
                if (current === generation.current)
                    setState("Saved");
            });
        registerDraftFlush(async () => { clearTimeout(timer); await save(); });
        return () => { clearTimeout(timer); registerDraftFlush(undefined); };
    }, [value, saver, retry]);
    useEffect(() => () => {
        if (dirty.current)
            void saver.save(latest.current).catch(() => { });
    }, [saver]);
    useEffect(() => {
        const warn = (e: BeforeUnloadEvent) => {
            if (dirty.current) {
                e.preventDefault();
            }
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, []);
    const change = (update: Partial<WebsiteContent>) => (setState("Saving..."), setValue(current => ({ ...current, ...update })));
    return <div className="builder-layout"><section className="editor-panel stack"><div className="section-heading"><h2>{design ? "Website design" : "Website content"}</h2><span aria-live="polite" className="save-state">{state}</span></div>
    <p>{design ? "Three curated color reels and professional letter styles. Preview every change live." : "Edit everyday website content here. Design customization has its own tab."}</p>
    <label>Headline<input value={value.headline} maxLength={120} onChange={e => change({ headline: e.target.value })}/></label>
    <label>Business story<textarea value={value.description} maxLength={3000} rows={5} onChange={e => change({ description: e.target.value })}/></label>
    {design && <>
      {([["page", PAGE_COLORS, "Page"], ["components", COMPONENT_COLORS, "Components"], ["trim", TRIM_COLORS, "Headers and trim"]] as const).map(([key, colors, label]) => <fieldset key={key}><legend>{label} color reel</legend><div className="color-reel">{colors.map((color, index) => <button key={color} type="button" aria-label={`${label} color ${index + 1}`} aria-pressed={value.theme[key] === index} style={{ backgroundColor: color }} onClick={() => change({ theme: { ...value.theme, [key]: index } })}/>)}</div></fieldset>)}
      <label>Button style<select value={value.theme.button} onChange={e => change({ theme: { ...value.theme, button: e.target.value as WebsiteContent["theme"]["button"] } })}><option value="SOFT">Soft corners</option><option value="ROUND">Rounded</option><option value="SQUARE">Square</option></select></label>
      <label>Letter style<select value={value.theme.letters} onChange={e => change({ theme: { ...value.theme, letters: Number(e.target.value) } })}>{["Modern", "Editorial", "Clear", "Friendly", "Classic"].map((v, i) => <option value={i} key={v}>{v}</option>)}</select></label>
    </>}
    <label>Add gallery photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={async (e) => {
            setError("");
            try {
                const ids: string[] = [];
                for (const file of Array.from(e.target.files ?? []).slice(0, 12 - value.gallery.length))
                    ids.push(await imageUpload(file, business.id, "BUSINESS"));
                setValue(v => ({ ...v, gallery: [...v.gallery, ...ids] }));
            }
            catch (err) {
                setError((err as Error).message);
            }
        }}/><small>JPEG, PNG or WebP; 5 MB per photo. Metadata is removed.</small></label>
    <div className="photo-grid">{value.gallery.map(id => <div key={id}><img src={"/media/" + id} alt="Gallery preview" width={160} height={110}/><button type="button" onClick={() => change({ gallery: value.gallery.filter(v => v !== id) })}>Remove photo</button></div>)}</div>
    <details><summary>Genuine testimonials (optional)</summary>{value.testimonials.map((t, i) => <fieldset key={i}><label>Customer name<input value={t.name} maxLength={80} onChange={e => change({ testimonials: value.testimonials.map((v, n) => n === i ? { ...v, name: e.target.value } : v) })}/></label><label>Testimonial<textarea value={t.text} maxLength={500} onChange={e => change({ testimonials: value.testimonials.map((v, n) => n === i ? { ...v, text: e.target.value } : v) })}/></label><button type="button" onClick={() => change({ testimonials: value.testimonials.filter((_, n) => n !== i) })}>Remove testimonial</button></fieldset>)}<button type="button" disabled={value.testimonials.length >= 6} onClick={() => {
            if (window.confirm("I confirm this is a genuine testimonial shared with permission."))
                change({ testimonials: [...value.testimonials, { name: "Customer", text: "Add the genuine testimonial", genuine: true }] });
        }}>Add genuine testimonial</button></details>
    {error && <div role="alert"><p className="error-text">{error}</p><button type="button" onClick={() => setRetry(v => v + 1)}>Retry save</button></div>}
  </section><section className="preview-panel" tabIndex={0} aria-label="Live website preview"><div className="preview-label">Live preview / unpublished changes</div><SiteView preview site={{ id: business.id, slug: business.slug, name: business.name, category: business.category, city: business.city, timeZone: business.timeZone, address: business.addressPublic ? business.address : null, content: value, offerings: offerings.filter(o => o.active).map(o => ({ ...o, configurations: o.configurations.filter(c => business.modes.includes(c.mode)) })) }}/></section></div>;
}
