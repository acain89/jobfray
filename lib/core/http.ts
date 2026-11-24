import { randomUUID } from "node:crypto";
import { InputError } from "../domain/validation";
import { NextResponse } from "next/server";
import { AppError } from "./validation";
import { secret } from "./security";
import { localSandboxAllowed } from "./configuration";
const prefix = localSandboxAllowed() ? "" : "__Host-";
export const COOKIE = prefix + "jf_session", CSRF = prefix + "jf_csrf", CONFIRMATION = prefix + "jf_confirmation";
export const secure = () => !localSandboxAllowed();
export function response(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } }); }
export async function body(request: Request, max = 256000): Promise<Record<string, unknown>> {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
        throw new AppError("Use application/json", 415);
    const reader = request.body?.getReader();
    if (!reader)
        throw new AppError("Missing request body");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
        const next = await reader.read();
        if (next.done)
            break;
        size += next.value.byteLength;
        if (size > max) {
            await reader.cancel();
            throw new AppError("Request too large", 413);
        }
        chunks.push(next.value);
    }
    try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw new Error();
        return value as Record<string, unknown>;
    }
    catch {
        throw new AppError("Invalid JSON request");
    }
}
export function cookieValue(request: Request, name: string) { return request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="))?.slice(name.length + 1); }
export function csrf(request: Request) {
    const origin = process.env.JOBFRAY_PUBLIC_ORIGIN ?? "https://jobfray.com";
    if (request.headers.get("origin") !== new URL(origin).origin || request.headers.get("sec-fetch-site") === "cross-site")
        throw new AppError("Cross-origin request rejected", 403);
    const value = cookieValue(request, CSRF);
    if (!value || value !== request.headers.get("x-csrf-token"))
        throw new AppError("Refresh this page and retry", 403);
}
export function csrfResponse(value: unknown, existing?: string) { const token = existing ?? secret(), r = response({ ...value as object, csrf: token }); r.cookies.set(CSRF, token, { httpOnly: true, secure: secure(), sameSite: "strict", path: "/", maxAge: 7 * 86400 }); return r; }
export function failure(error: unknown) {
    if (error instanceof AppError || error instanceof InputError) return response({error:error.message},error instanceof AppError ? error.status : 400);
    const reference=randomUUID();
    console.error(JSON.stringify({event:"request_failed",reference,kind:"internal"}));
    return response({error:"The request could not be completed. Please retry.",reference},500);
}
