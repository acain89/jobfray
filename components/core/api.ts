"use client";
let currentCsrf = "";
let draftFlush: (() => Promise<void>) | undefined;
export function registerDraftFlush(callback: (() => Promise<void>) | undefined) { draftFlush = callback; }
export async function appSession(): Promise<{
    available: boolean;
    signedIn?: boolean;
    sandbox: boolean;
    csrf: string;
}> {
    const r = await fetch("/api/core?op=session", { cache: "no-store" }), data = await r.json();
    if (!r.ok)
        throw new Error(data.error ?? "Unable to connect");
    currentCsrf = data.csrf;
    return data;
}
export async function api<T = Record<string, unknown>>(op: string, data: unknown = {}): Promise<T> {
    if (op !== "autosave" && draftFlush)
        await draftFlush();
    if (!currentCsrf)
        await appSession();
    const r = await fetch("/api/core", { method: "POST", keepalive:op==="autosave", headers: { "Content-Type": "application/json", "x-csrf-token": currentCsrf }, body: JSON.stringify({ op, data }) });
    const result = await r.json();
    if (!r.ok)
        throw new Error(result.error ?? "Unable to complete this request");
    if (result.csrf)
        currentCsrf = result.csrf;
    return result as T;
}
export async function query<T>(op: string): Promise<T> {
    const r = await fetch("/api/core?op=" + encodeURIComponent(op), { cache: "no-store" }), v = await r.json();
    if (!r.ok)
        throw new Error(v.error ?? "Unable to load");
    return v as T;
}
export async function imageUpload(file: File, businessId: string, kind: "BUSINESS" | "QUOTE", proof = "", phone = ""): Promise<string> {
    if (file.size > 5 * 1024 * 1024)
        throw new Error("Images must be 5 MB or smaller");
    if (!currentCsrf)
        await appSession();
    const bytes = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(new Error("Could not read this image")); reader.readAsDataURL(file); });
    const r = await fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": currentCsrf }, body: JSON.stringify({ businessId, kind, bytes, contentType: file.type, proof, phone }) }), v = await r.json();
    if (!r.ok)
        throw new Error(v.error ?? "Upload failed");
    return v.id;
}
export const money = (cents: number | null) => cents === null ? "Price arranged directly" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
