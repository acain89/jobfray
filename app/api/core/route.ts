import { createRequestCapability } from "@/lib/core/request-capability";
import { trustedPrincipal } from "@/lib/core/edge";
import { subscribePush, unsubscribePush } from "@/lib/core/push";
import { cookies } from "next/headers";
import { runtime, applicationEnabled, requireSandbox, requireCheckout } from "@/lib/core/runtime";
import { body, response, failure, csrf, csrfResponse, COOKIE, CONFIRMATION, REQUEST_BROWSER, secure, cookieValue } from "@/lib/core/http";
import { AppError, string, whole, phone } from "@/lib/core/validation";
import { register, login, recover, consumeAccountToken, session, ownerScope, rateLimit, hash, secret } from "@/lib/core/security";
import { saveProfile, workspace, saveOffering, saveResource, autosave, publish, unpublish, suspend, readiness, ownerBusiness } from "@/lib/core/business";
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
            if (app.sandbox)
                requireSandbox(request);
            let signedIn = false;
            let currentCsrf: string | undefined;
            if (token)
                try {
                    const current = await app.repo.transaction([], tx => session(tx, token, new Date()));
                    signedIn = true;
                    currentCsrf = current.session.csrf;
                }
                catch { }
            const r = csrfResponse({ available: true, signedIn, sandbox: app.sandbox }, currentCsrf);
            if (!jar.get(REQUEST_BROWSER))
                r.cookies.set(REQUEST_BROWSER, secret(), { httpOnly: true, secure: secure(), sameSite: "strict", path: "/", maxAge: 86400 });
            return r;
        }
        const app = await runtime();
        if (app.sandbox)
            requireSandbox(request);
        if (op === "slots") {
            if (!app.sandbox)
                await rateLimit(app.repo, "slots-edge:" + trustedPrincipal(request), 120, new Date(), 1);
            const p = new URL(request.url).searchParams;
            return response(await app.booking.slots(string(p.get("businessId"), 80), string(p.get("offeringId"), 80), string(p.get("mode"), 20), string(p.get("fulfillment"), 20), string(p.get("date"), 10), new Date(), p.has("partySize") ? whole(Number(p.get("partySize")), 1, 10000) : undefined));
        }
        if (op === "workspace")
            return response(await workspace(app.repo, token, new Date(), new URL(request.url).searchParams.get("after") ?? undefined));
        if (op === "confirmation")
            return response(await app.booking.confirmation(jar.get(CONFIRMATION)?.value ?? ""));
        if (op === "admin")
            return response(await adminOverview(app.repo, token, (process.env.JOBFRAY_ADMIN_EMAILS ?? "").split(","), new Date(), { business: new URL(request.url).searchParams.get("businessAfter") ?? undefined, refund: new URL(request.url).searchParams.get("refundAfter") ?? undefined }));
        if (op === "readiness") {
            const business = await ownerBusiness(app.repo, token, new Date());
            return response({ errors: business ? await app.repo.transaction([], tx => readiness(tx, business)) : ["Create your business first."] });
        }
        if (op === "sandbox-inbox") {
            requireSandbox(request);
            return response({ items: await app.repo.transaction(["sandbox-inbox"], tx => tx.find("outbox", {}, { oneOf: { field: "channel", values: ["EMAIL", "PUSH"] } })) });
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
        const principal = app.sandbox ? "local-sandbox" : trustedPrincipal(request);
        if (!app.sandbox)
            await rateLimit(app.repo, "edge:" + principal + ":" + op, 60, now, 1);
        if (op === "push-subscribe")
            return response(await subscribePush(app.repo, token, string(v.businessId, 80), v.subscription, now));
        if (op === "push-unsubscribe")
            return response(await unsubscribePush(app.repo, token, now));
        // Do not trust forwarded IP. Global + normalized subject limits supplement provider edge limits.
        await rateLimit(app.repo, "http:" + op + ":" + hash(token ?? cookieValue(request, "__Host-jf_csrf") ?? cookieValue(request, "jf_csrf") ?? "anonymous"), 200, now, 1);
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
            if (token) {
                await unsubscribePush(app.repo, token, now);
            }
            if (token)
                await app.repo.transaction(["session:" + hash(token)], async (tx) => {
                    for (const s of await tx.find("sessions", { tokenHash: hash(token) }))
                        await tx.remove("sessions", s.id);
                });
            const r = response({ signedOut: true });
            r.cookies.set(COOKIE, "", { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: 0 });
            return r;
        }
        if (op === "save-profile") {
            await app.repo.transaction([], tx => session(tx, token, now));
            const point = await app.geocoder.address(string(v.address, 250));
            const discoveryPoint = await app.geocoder.zip(string(v.zip, 5));
            return response(await saveProfile(app.repo, token, { ...v, ...point }, now, discoveryPoint));
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
            return response(await app.repo.transaction(["tenant:" + string(v.businessId, 80)], async (tx) => {
                await ownerScope(tx, token, string(v.businessId, 80), now);
                const b = (await tx.get("businesses", string(v.businessId, 80)))!;
                if (typeof v.pushEnabled !== "boolean")
                    throw new AppError("Invalid notification preference");
                b.pushEnabled = v.pushEnabled;
                await tx.put("businesses", b);
                return { saved: true };
            }));
        if (op === "request-refund")
            return response(await requestRefund(app.repo, token, (process.env.JOBFRAY_ADMIN_EMAILS ?? "").split(","), string(v.businessId, 80), string(v.requestId, 80), string(v.reason, 50), now));
        if (op === "simulate-refund") {
            requireSandbox(request);
            return response(await simulateRefund(app.repo, token, (process.env.JOBFRAY_ADMIN_EMAILS ?? "").split(","), string(v.refundId, 80), now));
        }
        if (op === "release")
            return response(await app.booking.release(token, string(v.businessId, 80), string(v.requestId, 80), now));
        if (op === "request-capability") {
            const browser = cookieValue(request, REQUEST_BROWSER) ?? secret(), r = response(await createRequestCapability(app.repo, string(v.businessId, 80), browser, now));
            r.cookies.set(REQUEST_BROWSER, browser, { httpOnly: true, secure: secure(), sameSite: "strict", path: "/", maxAge: 86400 });
            return r;
        }
        if (op === "review")
            return response({ snapshot: await app.booking.preview(v.selection, now) });
        if (op === "checkout") {
            if (app.sandbox)
                requireSandbox(request);
            else
                requireCheckout();
            if(!v.review||typeof v.review!=="object"||Array.isArray(v.review))throw new AppError("Review the current price before checkout");
            const selected = v.selection as {
                contact?: {
                    phone?: unknown;
                };
            };
            if (phone(v.confirmedPhone) !== phone(selected?.contact?.phone))
                throw new AppError("Confirm the current phone number");
            const result = await app.booking.checkout(v.selection, string(v.capability, 100), string(v.idempotencyKey, 100), now, cookieValue(request, REQUEST_BROWSER) ?? "",v.review), r = response(result);
            r.cookies.set(CONFIRMATION, result.confirmationToken, { httpOnly: true, secure: secure(), sameSite: "strict", path: "/", maxAge: 180 * 86400 });
            return r;
        }
        if (op === "payment-start") {
            requireCheckout();
            if (!app.paymentOperations)
                throw new AppError("Payments unavailable", 503);
            const requestId = string(v.requestId, 80), intent = await app.booking.intent(requestId, cookieValue(request, CONFIRMATION) ?? "");
            const row = await app.repo.transaction([], tx => tx.get("requests", requestId));
            if (!row)
                throw new AppError("Not found", 404);
            await app.paymentOperations.track(intent.id, row.businessId, row.expiresAt, now);
            return response({ checkoutUrl: intent.checkoutUrl });
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
