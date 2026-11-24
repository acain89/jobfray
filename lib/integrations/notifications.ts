import { randomUUID } from "node:crypto";
import * as webpush from "web-push";
import { networkTransport, type Transport } from "./http";
import type { Repository } from "../core/repository";
import type { NotificationTransport } from "../core/providers";
import type { Outbox } from "../core/model";
import { AppError } from "../core/validation";
import { hash } from "../core/security";
import { pushEndpoint } from "../core/push";
export class ProductionNotifications implements NotificationTransport {
    constructor(private repo: Repository, private email: NotificationTransport, private config: {
        origin: string;
        vapidPublic?: string;
        vapidPrivate?: string;
        vapidSubject?: string;
    }, private transport: Transport = networkTransport) { }
    async send(item: Outbox) {
        if (item.channel === "PUSH") {
            await this.push(item);
            return;
        }
        if (item.channel !== "EMAIL")
            throw new AppError("Unsupported notification channel", 400);
        const id = "notification:" + hash(item.key), now = new Date();
        const state = await this.repo.transaction([id], async (tx) => {
            const previous = await tx.get("operations", id);
            if (previous?.state === "DONE")
                return "DONE";
            if (previous && (Date.parse(String(previous.payload.startedAt)) + 86400000 < Date.now())) {
                await tx.put("operations", { ...previous, state: "FAILED" });
                return "UNCERTAIN";
            }
            await tx.put("operations", { id, businessId: item.businessId, kind: "NOTIFICATION", state: "RUNNING", availableAt: now.toISOString(), attempts: (previous?.attempts ?? 0) + 1, leaseUntil: null, payload: { startedAt: previous?.payload.startedAt ?? now.toISOString(), channel: item.channel, key: item.key } });
            return "SEND";
        });
        if (state === "DONE")
            return;
        if (state === "UNCERTAIN")
            throw new AppError("Uncertain notification requires operator reconciliation", 503);
        await this.email.send(item);
        await this.repo.transaction([id], async (tx) => { const row = (await tx.get("operations", id))!; await tx.put("operations", { ...row, state: "DONE" }); });
    }
    private async push(item: Outbox) {
        const { vapidPublic, vapidPrivate, vapidSubject } = this.config;
        if (!vapidPublic || !vapidPrivate || !vapidSubject)
            return;
        if (!item.businessId)
            throw new AppError("Push tenant required");
        const devices = await this.repo.transaction([], tx => tx.find("push", { businessId: item.businessId!, accountId: item.destination, active: true }, { limit: 100 }));
        for (const device of devices) {
            const alive = await this.repo.transaction([], async (tx) => { const sessions = await tx.find("sessions", { accountId: device.accountId, tokenHash: device.sessionHash }); return sessions.some(s => Date.parse(s.expiresAt) > Date.now()); });
            if (!alive) {
                await this.repo.transaction(["push:" + device.id], tx => tx.put("push", { ...device, active: false }));
                continue;
            }
            const key = "push:" + hash(item.key + device.id), leaseToken = randomUUID();
            const claimed = await this.repo.transaction([key], async (tx) => {
                const old = await tx.get("operations", key);
                if (old?.state === "DONE")
                    return false;
                if (old?.leaseUntil && Date.parse(old.leaseUntil) > Date.now())
                    throw new AppError("Push delivery already in progress", 503);
                await tx.put("operations", { id: key, businessId: item.businessId, kind: "PUSH", state: "RUNNING", availableAt: new Date().toISOString(), attempts: (old?.attempts ?? 0) + 1, leaseToken, leaseUntil: new Date(Date.now() + 60000).toISOString(), payload: {} });
                return true;
            });
            if (!claimed)
                continue;
            const details = await webpush.generateRequestDetails({ endpoint: pushEndpoint(device.endpoint), keys: device.keys }, JSON.stringify({ deliveryKey: hash(item.key), title: "New JobFray request", body: "Open your dashboard for details.", url: "/dashboard" }), { TTL: 60, vapidDetails: { subject: vapidSubject, publicKey: vapidPublic, privateKey: vapidPrivate } });
            const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
            try {
                const response = await this.transport(device.endpoint, { method: details.method, headers: details.headers as Record<string, string>, body: details.body ? new Uint8Array(details.body) : null, signal: controller.signal, redirect: "error" });
                if ([404, 410].includes(response.status)) {
                    await this.repo.transaction(["push:" + device.id], tx => tx.put("push", { ...device, active: false }));
                    continue;
                }
                if (!response.ok)
                    throw new AppError("Push temporarily unavailable", 503);
                await this.repo.transaction([key], async (tx) => {
                    const current = await tx.get("operations", key);
                    if (current?.leaseToken === leaseToken)
                        await tx.put("operations", { ...current, state: "DONE", leaseUntil: null });
                });
            }
            finally {
                clearTimeout(timer);
            }
        }
    }
}
