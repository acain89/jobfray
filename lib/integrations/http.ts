import { AppError } from "../core/validation";
export type Transport = (url: string, init: RequestInit) => Promise<Response>;
export const networkTransport: Transport = async (url, init) => {
    if (process.env.JOBFRAY_PROVIDER_OPERATIONS_ENABLED !== "1")
        throw new AppError("Provider operations are disabled", 503);
    return fetch(url, { ...init, redirect: "error" });
};
export async function request(transport: Transport, url: string, init: RequestInit, timeout = 8000): Promise<unknown> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await transport(url, { ...init, signal: controller.signal, redirect: "error" });
        if (!response.ok)
            throw new AppError(response.status === 429 || response.status >= 500 ? "Provider temporarily unavailable" : "Provider rejected operation", response.status === 429 || response.status >= 500 ? 503 : 502);
        const reader = response.body?.getReader();
        let size = 0;
        const chunks: Uint8Array[] = [];
        if (!reader)
            throw new AppError("Empty provider response", 502);
        try {
            for (;;) {
                const part = await reader.read();
                if (part.done)
                    break;
                size += part.value.byteLength;
                if (size > 2000000)
                    throw new AppError("Provider response too large", 502);
                chunks.push(part.value);
            }
        }
        finally {
            await reader.cancel();
        }
        const text = Buffer.concat(chunks).toString("utf8");
        try {
            return JSON.parse(text) as unknown;
        }
        catch {
            throw new AppError("Invalid provider response", 502);
        }
    }
    catch (error) {
        if (error instanceof AppError)
            throw error;
        throw new AppError("Provider transport failed", 503);
    }
    finally {
        clearTimeout(timer);
    }
}
export function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError("Invalid provider response", 502); return value as Record<string, unknown>; }
export function text(value: unknown, max = 500): string { if (typeof value !== "string" || !value || value.length > max)
    throw new AppError("Invalid provider response", 502); return value; }
export const form = (value: Record<string, string>) => new URLSearchParams(value).toString();
