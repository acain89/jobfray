import type { Repository } from "./repository";
import type { MediaStorage, Asset } from "../integrations/cloudinary";
import { randomUUID } from "node:crypto";
export async function cleanStoredMedia(repo: Repository, storage: MediaStorage, now: Date) {
    const began=performance.now();
    const rows = await repo.transaction(["media-worker-claim"], async (tx) => {
        const batch = [...await tx.find("operations", { kind: "MEDIA_DELETE", state: "PENDING" }, { limit: 50, ranges: [{ field: "availableAt", operator: "lte", value: now.toISOString() }] }), ...await tx.find("operations", { kind: "MEDIA_DELETE", state: "RUNNING" }, { limit: 50, ranges: [{ field: "leaseUntil", operator: "lte", value: now.toISOString() }] })].slice(0, 50);
        const claimed = batch.map(x => ({ ...x, state: "RUNNING" as const, attempts: x.attempts + 1, leaseToken: randomUUID(), leaseUntil: new Date(now.getTime() + 60000).toISOString() }));
        for (const x of claimed)
            await tx.put("operations", x);
        return claimed;
    });
    for (const row of rows) {
        const owned=await repo.transaction([row.id],async tx=>{const current=await tx.get("operations",row.id);if(!current||current.leaseToken!==row.leaseToken||current.state!=="RUNNING")return false;await tx.put("operations",{...current,leaseUntil:new Date(now.getTime()+performance.now()-began+60000).toISOString()});return true;});
        if(!owned)continue;
        let done = false;
        try {
            await storage.remove(row.payload.asset as unknown as Asset);
            done = true;
        }
        catch { }
        await repo.transaction([row.id], async (tx) => { const current = await tx.get("operations", row.id); if (!current || current.leaseToken !== row.leaseToken)
            return; if (done && typeof row.payload.mediaId === "string")
            await tx.remove("media", row.payload.mediaId); await tx.put("operations", { ...current, state: done ? "DONE" : "PENDING", leaseUntil: null, availableAt: new Date(now.getTime() + Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 7))).toISOString() }); });
    }
    return rows.length;
}
