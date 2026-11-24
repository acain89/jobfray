import { createHash } from "node:crypto";
import { AppError } from "../core/validation";
import { request, object, text, networkTransport, type Transport } from "./http";
export interface Asset {
    provider: "CLOUDINARY";
    publicId: string;
    version: number;
}
export interface MediaStorage {
    put(businessId: string, id: string, bytes: Buffer): Promise<Asset>;
    url(asset: Asset): string;
    remove(asset: Asset): Promise<void>;
    read(asset: Asset): Promise<Buffer>;
}
export class CloudinaryAdapter implements MediaStorage {
    constructor(private cloud: string, private key: string, private secret: string, private transport: Transport = networkTransport, private clock: () => number = Date.now) { if (!/^[a-z0-9-]+$/.test(cloud))
        throw new Error("Invalid Cloudinary configuration"); }
    private signature(params: Record<string, string>) { return createHash("sha256").update(Object.keys(params).sort().map(k => k + "=" + params[k]).join("&") + this.secret).digest("hex"); }
    private params(params: Record<string, string>) { return { ...params, signature: this.signature(params), api_key: this.key }; }
    private validate(asset: Asset) { if (!/^jobfray\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(asset.publicId))
        throw new AppError("Invalid tenant asset"); }
    async put(businessId: string, id: string, bytes: Buffer): Promise<Asset> {
        const publicId = "jobfray/" + businessId + "/" + id;
        this.validate({ provider: "CLOUDINARY", publicId, version: 0 });
        const params = this.params({ public_id: publicId, type: "authenticated", overwrite: "false", timestamp: String(Math.floor(this.clock() / 1000)) });
        const body = new FormData();
        for (const [key, value] of Object.entries(params))
            body.set(key, value);
        body.set("file", new Blob([new Uint8Array(bytes)], { type: "image/webp" }), id + ".webp");
        const value = object(await request(this.transport, "https://api.cloudinary.com/v1_1/" + this.cloud + "/image/upload", { method: "POST", body }));
        if (value.public_id !== publicId || value.type !== "authenticated" || value.format !== "webp" || typeof value.version !== "number")
            throw new AppError("Storage ownership mismatch", 502);
        return { provider: "CLOUDINARY", publicId, version: value.version };
    }
    url(asset: Asset) { this.validate(asset); const params = this.params({ public_id: asset.publicId, format: "webp", type: "authenticated", expires_at: String(Math.floor(this.clock() / 1000) + 60), timestamp: String(Math.floor(this.clock() / 1000)) }); return "https://api.cloudinary.com/v1_1/" + this.cloud + "/image/download?" + new URLSearchParams(params); }
    async read(asset: Asset) { const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000); try {
        const response = await this.transport(this.url(asset), { method: "GET", signal: controller.signal, redirect: "error" });
        if (!response.ok)
            throw new AppError("Image unavailable", 503);
        const reader = response.body?.getReader();
        if (!reader)
            throw new AppError("Image unavailable", 503);
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            size += value.length;
            if (size > 5242880) {
                await reader.cancel();
                throw new AppError("Stored image exceeds limit", 502);
            }
            chunks.push(value);
        }
        return Buffer.concat(chunks);
    }
    catch (error) {
        if (error instanceof AppError)
            throw error;
        throw new AppError("Image transport failed", 503);
    }
    finally {
        clearTimeout(timer);
    } }
    async remove(asset: Asset) { this.validate(asset); const result = object(await request(this.transport, "https://api.cloudinary.com/v1_1/" + this.cloud + "/image/destroy", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(this.params({ public_id: asset.publicId, type: "authenticated", invalidate: "true", timestamp: String(Math.floor(this.clock() / 1000)) })).toString() })); if (!["ok", "not found"].includes(text(result.result)))
        throw new AppError("Image deletion not acknowledged", 503); }
}
