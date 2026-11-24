/** Configuration validation is pure; it never authenticates to a provider. */
export function providerConfiguration(env: Readonly<Record<string, string | undefined>> = process.env) {
    const required = (name: string) => {
        const v = env[name];
        if (!v || v.includes("PLACEHOLDER") || /[\r\n]/.test(v))
            throw new Error("Missing or invalid " + name);
        return v;
    };
    const origin = required("JOBFRAY_PUBLIC_ORIGIN");
    if (new URL(origin).protocol !== "https:" || new URL(origin).origin !== origin)
        throw new Error("HTTPS provider origin required");
    if (required("JOBFRAY_WORKER_KEY").length < 32)
        throw new Error("Invalid worker authentication key");
    const admins = required("JOBFRAY_ADMIN_EMAILS").split(",");
    if (admins.some(v => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)))
        throw new Error("Invalid administrator allowlist");
    const host = required("JOBFRAY_BASE_HOST");
    if (!/^[a-z0-9.-]+$/.test(host) || new URL(origin).hostname !== host)
        throw new Error("Canonical domain and base host must match");
    const live = env.JOBFRAY_PROVIDER_ENV === "production";
    if (!live && env.JOBFRAY_PROVIDER_ENV !== "staging")
        throw new Error("Explicit staging or production provider environment required");
    const stripeKey = required("STRIPE_SECRET_KEY");
    if (!(new RegExp("^(sk|rk)_" + (live ? "live" : "test") + "_")).test(stripeKey))
        throw new Error("Stripe environment/key mismatch");
    const webhookSecrets = required("STRIPE_WEBHOOK_SECRETS").split(",");
    if (webhookSecrets.some(v => !v.startsWith("whsec_")))
        throw new Error("Invalid Stripe webhook secret");
    if (required("MAPBOX_PERMANENT_GEOCODING") !== "1")
        throw new Error("Permanent geocoding entitlement required before persisted geocoding");
    const edge = required("JOBFRAY_EDGE_SECRET");
    if (edge.length < 32)
        throw new Error("Trusted edge secret must contain at least 32 characters");
    const vapidPublic = env.VAPID_PUBLIC_KEY, vapidPrivate = env.VAPID_PRIVATE_KEY, vapidSubject = env.VAPID_SUBJECT;
    if ([vapidPublic, vapidPrivate, vapidSubject].some(Boolean) && ![vapidPublic, vapidPrivate, vapidSubject].every(Boolean))
        throw new Error("Complete VAPID configuration required");
    if (vapidPublic && env.NEXT_PUBLIC_VAPID_PUBLIC_KEY !== vapidPublic)
        throw new Error("Public VAPID key mismatch");
    return { stripe: { key: stripeKey, webhookSecrets, account: required("STRIPE_ACCOUNT_ID"), live, origin, integrationId: required("STRIPE_INTEGRATION_IDENTIFIER") }, email: { key: required("RESEND_API_KEY"), sender: required("JOBFRAY_EMAIL_FROM") }, mapbox: required("MAPBOX_ACCESS_TOKEN"), cloudinary: { cloud: required("CLOUDINARY_CLOUD_NAME"), key: required("CLOUDINARY_API_KEY"), secret: required("CLOUDINARY_API_SECRET") }, origin, ...(vapidPublic && vapidPrivate && vapidSubject ? { vapidPublic, vapidPrivate, vapidSubject } : {}) };
}
