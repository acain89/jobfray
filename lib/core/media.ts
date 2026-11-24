import { requestCapability } from "./request-capability";
import type { MediaStorage } from "../integrations/cloudinary";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import type { Repository } from "./repository";
import { AppError } from "./validation";
import { hash, ownerScope, rateLimit } from "./security";
let decoding = 0;
export async function uploadImage(repo: Repository, input: {
    businessId: string;
    kind: "BUSINESS" | "QUOTE";
    bytes: Buffer;
    contentType: string;
    session?: string | undefined;
    capability?: string | undefined;
    browser?: string | undefined;
}, now: Date, storage?: MediaStorage) {
    if (input.bytes.length > 5 * 1024 * 1024 || input.bytes.length < 12)
        throw new AppError("Images must be 5 MB or smaller", 413);
    const isJpeg = input.bytes[0] === 255 && input.bytes[1] === 216 && input.bytes[2] === 255;
    const isPng = input.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isWebp = input.bytes.toString("ascii", 0, 4) === "RIFF" && input.bytes.toString("ascii", 8, 12) === "WEBP";
    if (!(isJpeg && input.contentType === "image/jpeg" || isPng && input.contentType === "image/png" || isWebp && input.contentType === "image/webp"))
        throw new AppError("Upload a valid JPEG, PNG or WebP image");
    await repo.transaction(["tenant:" + input.businessId], async (tx) => {
        if (input.kind === "BUSINESS")
            await ownerScope(tx, input.session, input.businessId, now);
        else {
            await requestCapability(tx, input.capability ?? "", input.businessId, input.browser ?? "", now);
            if ((await tx.get("businesses", input.businessId))?.status !== "PUBLISHED")
                throw new AppError("Business not available", 404);
        }
    });
    if (input.kind === "QUOTE")
        await rateLimit(repo, "quote-upload-browser:" + hash(input.browser ?? ""), 12, now);
    if (decoding >= 2)
        throw new AppError("Image processing is busy. Please retry.", 429);
    decoding++;
    let bytes: Buffer;
    try {
        bytes = await sharp(input.bytes, { limitInputPixels: 24000000, animated: false }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    }
    catch {
        throw new AppError("This image cannot be safely decoded");
    }
    finally {
        decoding--;
    }
    const result = await repo.transaction(["tenant:" + input.businessId], async (tx) => {
        let ownerId: string | null = null;
        if (input.kind === "BUSINESS")
            ownerId = (await ownerScope(tx, input.session, input.businessId, now)).accountId;
        else {
            await requestCapability(tx, input.capability ?? "", input.businessId, input.browser ?? "", now);
            const business = await tx.get("businesses", input.businessId);
            if (business?.status !== "PUBLISHED")
                throw new AppError("Business not available", 404);
        }
        const current = await tx.count("media", { businessId: input.businessId, ...(input.kind === "BUSINESS" ? { ownerId } : { capabilityHash: hash(input.capability ?? "") }) });
        if (current >= (input.kind === "BUSINESS" ? 40 : 6))
            throw new AppError("Upload limit reached", 429);
        const id = randomUUID();
        await tx.put("media", { id, businessId: input.businessId, ownerId, capabilityHash: input.kind === "QUOTE" ? hash(input.capability ?? "") : null, kind: input.kind, bytes: bytes.toString("base64"), contentType: "image/webp", createdAt: now.toISOString(), expiresAt: input.kind === "QUOTE" ? new Date(now.getTime() + 86400000).toISOString() : null });
        if (storage)
            await tx.put("operations", { id: "media-orphan:" + id, businessId: input.businessId, kind: "MEDIA_DELETE", state: "PENDING", availableAt: new Date(now.getTime() + 3600000).toISOString(), attempts: 0, leaseUntil: null, payload: { mediaId: id, asset: { provider: "CLOUDINARY", publicId: "jobfray/" + input.businessId + "/" + id, version: 0 } } });
        return { id };
    });
    if (storage) {
        const asset = await storage.put(input.businessId, result.id, bytes);
        await repo.transaction(["tenant:" + input.businessId], async (tx) => {
            const image = await tx.get("media", result.id);
            if (!image)
                throw new AppError("Upload reservation expired", 409);
            await tx.put("media", { ...image, storage: asset, bytes: "" });
            const job = (await tx.get("operations", "media-orphan:" + result.id))!;
            await tx.put("operations", { ...job, state: "DONE" });
        });
    }
    return result;
}
export async function readImage(repo: Repository, id: string, sessionToken: string | undefined, confirmationToken: string | undefined, now: Date) {
    return repo.transaction([], async (tx) => {
        const image = await tx.get("media", id);
        if (!image || image.expiresAt && Date.parse(image.expiresAt) <= now.getTime())
            throw new AppError("Image not found", 404);
        const business = await tx.get("businesses", image.businessId);
        if (!business)
            throw new AppError("Image not found", 404);
        if (image.kind === "BUSINESS" && business.status === "PUBLISHED" && business.published) {
            const offerings = await tx.find("offerings", { businessId: business.id });
            if (business.published.gallery.includes(id) || offerings.some(o => o.active && o.configurations.some(c => business.modes.includes(c.mode)) && o.photos.includes(id)))
                return image;
        }
        if (sessionToken) {
            try {
                await ownerScope(tx, sessionToken, image.businessId, now);
                if (image.kind === "BUSINESS" || (await tx.find("requests", { businessId: image.businessId }, { limit: 1, containsPhoto: id, ranges: [{ field: "confirmedAt", operator: "notNull" }] })).length > 0)
                    return image;
            }
            catch { /* do not disclose existence */ }
        }
        if (confirmationToken) {
            const request = (await tx.find("requests", { confirmationHash: hash(confirmationToken) }))[0];
            if (request?.confirmedAt && request.businessId === image.businessId && request.photos.includes(id))
                return image;
        }
        throw new AppError("Image not found", 404);
    });
}
