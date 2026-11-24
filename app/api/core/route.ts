import { cookies } from "next/headers";
import { runtime, applicationEnabled, requireSandbox } from "@/lib/core/runtime";
import { body, response, failure, csrf, csrfResponse, COOKIE, CONFIRMATION, secure, cookieValue } from "@/lib/core/http";
import { AppError, string, whole, phone } from "@/lib/core/validation";
import { register, login, recover, consumeAccountToken, startContact, verifyContact, session, ownerScope, rateLimit, hash } from "@/lib/core/security";
import { saveProfile, workspace, saveOffering, saveResource, autosave, publish, unpublish, suspend, readiness } from "@/lib/core/business";
import { deliverNotifications } from "@/lib/core/booking";
import { MockPaymentAdapter } from "@/lib/core/providers";
import { adminOverview, requestRefund, simulateRefund, cleanup } from "@/lib/core/administration";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
    try {
        const op = new URL(request.url).searchParams.get("op") ?? "session", jar = await cookies(), token = jar.get(COOKIE)?.value;
        if (op === "session") {
            if (!applicationEnabled())
                return csrfResponse({ available: false, sandbox: false });
            const app = await runtime();
            let signedIn = false;
            let currentCsrf: string | undefined;
            if (token)
                try {
                    const current = await app.repo.transaction(["session"], tx => session(tx, token, new Date()));
                    signedIn = true;
                    currentCsrf = current.session.csrf;
                }
                catch { }
            return csrfResponse({ available: true, signedIn, sandbox: app.sandbox }, currentCsrf);
        }
        const app = await runtime();
        if (app.sandbox)
            requireSandbox(request);
        if (op === "slots") {
            const p = new URL(request.url).searchParams;
            return response(await app.booking.slots(string(p.get("businessId"), 80), string(p.get("offeringId"), 80), string(p.get("mode"), 20), string(p.get("fulfillment"), 20), string(p.get("date"), 10), new Date(), p.has("partySize") ? whole(Number(p.get("partySize")), 1, 10000) : undefined));
        }
        if (op === "workspace")
            return response(await workspace(app.repo, token, new Date()));
        if (op === "confirmation")
            return response(await app.booking.confirmation(jar.get(CONFIRMATION)?.value ?? ""));
        if (op === "admin")
            return response(await adminOverview(app.repo, token, (process.env.JOBFRAY_ADMIN_EMAILS ?? "").split(","), new Date()));
        if (op === "readiness") {
            const w = await workspace(app.repo, token, new Date());
            return response({ errors: w.business ? await app.repo.transaction(["tenant:" + w.business.id], tx => readiness(tx, w.business!)) : ["Create your business first."] });
        }
        if (op === "sandbox-inbox") {
            requireSandbox(request);
            return response({ items: await app.repo.transaction(["sandbox-inbox"], tx => tx.find("outbox", {})) });
        }
        return response({ error: "Not found" }, 404);
    }
    catch (error) {
        return failure(error);
    }
}
export async function POST(request: Request) {
    try {
        csrf(request);
        const input = await body(request), op = string(input.op, 60), data = input.data ?? {}, v = data as Record<string, unknown>, app = await runtime();
        if (app.sandbox)
            requireSandbox(request);
        const now = new Date(), token = cookieValue(request, COOKIE);
        // Do not trust forwarded IP. Global + normalized subject limits supplement provider edge limits.
        await rateLimit(app.repo, "http:" + op, 200, now, 1);
        if (op === "register")
            return response(await register(app.repo, data, now));
        if (op === "login") {
            const result = await login(app.repo, v.email, v.password, now), r = csrfResponse({ signedIn: true }, result.csrf);
            r.cookies.set(COOKIE, result.token, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: 7 * 86400 });
            return r;
        }
        if (op === "recover")
            return response(await recover(app.repo, v.email, now));
        if (op === "verify-email" || op === "reset-password")
            return response(await consumeAccountToken(app.repo, v.token, op === "verify-email" ? "VERIFY_EMAIL" : "RESET_PASSWORD", v.password, now));
        if (op === "logout") {
            if (token)
                await app.repo.transaction(["logout"], async (tx) => { for (const s of await tx.find("sessions", { tokenHash: hash(token) }))
                    await tx.remove("sessions", s.id); });
            const r = response({ signedOut: true });
            r.cookies.set(COOKIE, "", { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: 0 });
            return r;
        }
        if (op === "save-profile") {
            await app.repo.transaction(["session"], tx => session(tx, token, now));
            const point = await app.geocoder.address(string(v.address, 250));
            return response(await saveProfile(app.repo, token, { ...v, ...point }, now));
        }
        if (op === "save-resource")
            return response(await saveResource(app.repo, token, string(v.businessId, 80), v.id ? string(v.id, 80) : null, v.resource, now));
        if (op === "save-offering")
            return response(await saveOffering(app.repo, token, string(v.businessId, 80), v.id ? string(v.id, 80) : null, v.offering, now));
        if (op === "autosave")
            return response(await autosave(app.repo, token, string(v.businessId, 80), whole(v.revision, 0, 2147483647), v.content, now, v.design !== false));
        if (op === "publish")
            return response(await publish(app.repo, token, string(v.businessId, 80), now));
        if (op === "unpublish")
            return response(await unpublish(app.repo, token, string(v.businessId, 80), now));
        if (op === "suspend")
            return response(await suspend(app.repo, token, string(v.businessId, 80), string(v.reason, 300), (process.env.JOBFRAY_ADMIN_EMAILS ?? "").split(",").filter(Boolean), now));
        if (op === "notification-settings")
            return response(await app.repo.transaction(["tenant:" + string(v.businessId, 80)], async (tx) => { await ownerScope(tx, token, string(v.businessId, 80), now); const b = (await tx.get("businesses", string(v.businessId, 80)))!; if (typeof v.pushEnabled !== "boolean")
                throw new AppError("Invalid notification preference"); b.pushEnabled = v.pushEnabled; await tx.put("businesses", b); return { saved: true }; }));
        if (op === "request-refund")
            return response(await requestRefund(app.repo, token, (process.env.JOBFRAY_ADMIN_EMAILS ?? "").split(","), string(v.businessId, 80), string(v.requestId, 80), string(v.reason, 50), now));
        if (op === "simulate-refund") {
            requireSandbox(request);
            return response(await simulateRefund(app.repo, token, (process.env.JOBFRAY_ADMIN_EMAILS ?? "").split(","), string(v.refundId, 80), now));
        }
        if (op === "release")
            return response(await app.booking.release(token, string(v.businessId, 80), string(v.requestId, 80), now));
        if (op === "contact-start")
            return response(await startContact(app.repo, phone(v.phone), now));
        if (op === "contact-verify")
            return response(await verifyContact(app.repo, string(v.challengeId, 80), string(v.code, 6), now));
        if (op === "checkout") {
            // A public financial adapter is intentionally NOT exposed. Only isolated mock simulation.
            requireSandbox(request);
            const result = await app.booking.checkout(v.selection, string(v.proof, 100), string(v.idempotencyKey, 100), now), r = response(result);
            r.cookies.set(CONFIRMATION, result.confirmationToken, { httpOnly: true, secure: secure(), sameSite: "strict", path: "/", maxAge: 180 * 86400 });
            return r;
        }
        if (op === "mock-pay") {
            requireSandbox(request);
            if (!(app.payments instanceof MockPaymentAdapter))
                throw new AppError("Mock adapter unavailable", 503);
            const intent = await app.booking.intent(string(v.requestId, 80), cookieValue(request, CONFIRMATION) ?? ""), event = app.payments.event(intent);
            return response(await app.booking.paymentEvent(event.payload, event.signature, now));
        }
        if (op === "confirmation-open") {
            const raw = string(v.token, 100);
            await rateLimit(app.repo, "confirmation-open", 60, now);
            await app.booking.confirmation(raw);
            const r = response({ opened: true });
            r.cookies.set(CONFIRMATION, raw, { httpOnly: true, secure: secure(), sameSite: "strict", path: "/", maxAge: 180 * 86400 });
            return r;
        }
        if (op === "sandbox-reconcile") {
            requireSandbox(request);
            await app.booking.reconcile(now);
            await cleanup(app.repo, now);
            return response({ processed: await deliverNotifications(app.repo, app.notifications, now) });
        }
        throw new AppError("Not found", 404);
    }
    catch (error) {
        return failure(error);
    }
}
