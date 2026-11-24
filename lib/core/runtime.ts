import { providerConfiguration } from "../integrations/configuration";
import { StripeAdapter } from "../integrations/stripe";
import { ResendAdapter } from "../integrations/email";
import { MapboxAdapter } from "../integrations/mapbox";
import { CloudinaryAdapter, type MediaStorage } from "../integrations/cloudinary";
import { ProductionNotifications } from "../integrations/notifications";
import { PaymentOperations } from "./payment-operations";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { FileRepository } from "./repository";
import { PrismaRepository } from "./prisma-repository";
import type { Repository } from "./repository";
import { BookingService } from "./booking";
import { MockGeocoder, MockNotificationTransport, MockPaymentAdapter } from "./providers";
import type { Geocoder, NotificationTransport, PaymentAdapter } from "./providers";
import { secret } from "./security";
import { AppError } from "./validation";
export interface Runtime {
    repo: Repository;
    booking: BookingService;
    geocoder: Geocoder;
    payments: PaymentAdapter;
    notifications: NotificationTransport;
    sandbox: boolean;
    storage?: MediaStorage;
    paymentOperations?: PaymentOperations;
}
const globalRuntime = globalThis as typeof globalThis & {
    jobfrayRuntime?: Promise<Runtime>;
};
import { localSandboxAllowed, validateConfiguration, previousConfirmationKeys, assertLocalTestBinding } from "./configuration";
export function sandboxEnabled() { return localSandboxAllowed(); }
export function applicationEnabled() { return sandboxEnabled() || process.env.JOBFRAY_DATABASE_ENABLED === "1" && process.env.JOBFRAY_RELEASE_DB_VERIFIED === "1"; }
async function createRuntime(): Promise<Runtime> {
    validateConfiguration();
    assertLocalTestBinding();
    if (!applicationEnabled())
        throw new AppError("The application is not connected to verified persistence. Local sandbox setup is described in the project README.", 503);
    const sandbox = sandboxEnabled();
    let repo: Repository, key: string;
    if (sandbox) {
        const path = resolve(process.cwd(), "artifacts", "phase3-runtime");
        repo = new FileRepository(path);
        await mkdir(path, { recursive: true });
        const keyFile = resolve(path, "keys.json");
        try {
            await writeFile(keyFile, JSON.stringify({ key: secret() }), { flag: "wx", mode: 0o600 });
        }
        catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "EEXIST")
                throw e;
        }
        key = (JSON.parse(await readFile(keyFile, "utf8")) as {
            key: string;
        }).key;
    }
    else {
        repo = new PrismaRepository(new PrismaClient());
        key = process.env.JOBFRAY_CONFIRMATION_KEY ?? "";
        if (key.length < 32)
            throw new AppError("Confirmation signing configuration is required", 503);
    }
    // No live provider is selected or called in Phase 3. Production adapters deliberately fail closed.
    const disabled = () => { throw new AppError("The production provider has not been authorized or connected", 503); };
    const geocoder: Geocoder = sandbox ? new MockGeocoder() : { zip: async () => disabled(), address: async () => disabled() };
    const payments: PaymentAdapter = sandbox ? new MockPaymentAdapter(key) : { create: async () => disabled(), verify: () => disabled() };
    const notifications: NotificationTransport = sandbox ? new MockNotificationTransport() : { send: async () => disabled() };
    if (!sandbox && process.env.JOBFRAY_PRODUCTION_PROVIDERS === "1") {
        const c = providerConfiguration(), stripe = new StripeAdapter(c.stripe), geocoder = new MapboxAdapter(c.mapbox, true);
        const booking = new BookingService(repo, geocoder, stripe, key, process.env.JOBFRAY_CONFIRMATION_KEY_VERSION ?? "v1", previousConfirmationKeys(), true);
        return { repo, booking, geocoder, payments: stripe, notifications: new ProductionNotifications(repo, new ResendAdapter(c.email.key, c.email.sender, c.origin), { origin: c.origin, ...(c.vapidPublic && c.vapidPrivate && c.vapidSubject ? { vapidPublic: c.vapidPublic, vapidPrivate: c.vapidPrivate, vapidSubject: c.vapidSubject } : {}) }), sandbox: false, storage: new CloudinaryAdapter(c.cloudinary.cloud, c.cloudinary.key, c.cloudinary.secret), paymentOperations: new PaymentOperations(repo, stripe, booking) };
    }
    return { repo, booking: new BookingService(repo, geocoder, payments, key, sandbox ? "v1" : process.env.JOBFRAY_CONFIRMATION_KEY_VERSION ?? "v1", sandbox ? {} : previousConfirmationKeys()), geocoder, payments, notifications, sandbox };
}
export function runtime(): Promise<Runtime> { globalRuntime.jobfrayRuntime ??= createRuntime(); return globalRuntime.jobfrayRuntime; }
export function checkoutEnabled() { return process.env.JOBFRAY_CHECKOUT_ENABLED === "1" && process.env.JOBFRAY_PROVIDER_OPERATIONS_ENABLED === "1" && process.env.JOBFRAY_RELEASE_PROVIDERS_VERIFIED === "1"; }
export function requireCheckout() {
    if (!checkoutEnabled())
        throw new AppError("Financial checkout is not enabled", 503);
}
export function requireSandbox(request: Request) {
    const url = new URL(request.url);
    if (!sandboxEnabled() || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || (request.headers.get("x-forwarded-for") ?? "").split(",").filter(Boolean).some(ip => !["localhost", "127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip.trim())))
        throw new AppError("Not found", 404);
}
