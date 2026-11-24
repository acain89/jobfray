import { randomUUID } from "node:crypto";
import type { Repository } from "./repository";
import { ownerScope, hash, session } from "./security";
import { AppError, string } from "./validation";
export function pushEndpoint(value: string) { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password || url.port || !["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].some(host => url.hostname === host))
    throw new AppError("Unsupported push endpoint"); return url.href; }
export async function subscribePush(repo: Repository, token: string | undefined, businessId: string, input: unknown, now: Date) {
    if (!input || typeof input !== "object")
        throw new AppError("Invalid subscription");
    const value = input as {
        endpoint: string;
        keys: {
            p256dh: string;
            auth: string;
        };
    };
    const endpoint = pushEndpoint(string(value.endpoint, 2000));
    if (!/^[A-Za-z0-9_-]{80,100}$/.test(value.keys?.p256dh ?? "") || !/^[A-Za-z0-9_-]{20,30}$/.test(value.keys?.auth ?? ""))
        throw new AppError("Invalid push keys");
    return repo.transaction(["tenant:"+businessId,"push:"+hash(endpoint)],async tx=>{
        const scope=await ownerScope(tx,token,businessId,now),previous=(await tx.find("push",{endpointHash:hash(endpoint)}))[0];
        if(previous&&(previous.accountId!==scope.accountId||previous.businessId!==businessId))throw new AppError("Push endpoint belongs to another account",403);
        if(!previous?.active&&await tx.count("push",{businessId,active:true})>=20)throw new AppError("Device limit reached",429);
        await tx.put("push",{id:previous?.id??randomUUID(),businessId,accountId:scope.accountId,sessionHash:hash(token!),endpointHash:hash(endpoint),active:true,endpoint,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth},createdAt:now.toISOString()});return {enabled:true};
    });
}
export async function unsubscribePush(repo: Repository, token: string | undefined, now: Date) { return repo.transaction(["push-session:" + hash(token ?? "")], async (tx) => { await session(tx, token, now); for (const row of await tx.find("push", { sessionHash: hash(token!) }))
    await tx.put("push", { ...row, active: false }); return { enabled: false }; }); }
