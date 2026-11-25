import { providerConfiguration } from "../integrations/configuration";
/** Pure validation: never opens a database or calls a provider. */
export function localSandboxAllowed(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
    if(env.JOBFRAY_PUBLIC_INDEXING_ENABLED==="1"&&(env.JOBFRAY_PROVIDER_ENV!=="production"||env.JOBFRAY_RELEASE_PROVIDERS_VERIFIED!=="1"||env.JOBFRAY_RELEASE_DB_VERIFIED!=="1"))throw new Error("Indexing requires an approved verified production release");
    if (env.JOBFRAY_SANDBOX !== "1")
        return false;
    let origin: URL;
    try {
        origin = new URL(env.JOBFRAY_PUBLIC_ORIGIN ?? "http://localhost:3000");
    }
    catch {
        return false;
    }
    return ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
        && (env.NODE_ENV !== "production" || env.JOBFRAY_LOCAL_TEST === "1");
}
export function validateConfiguration(env: Readonly<Record<string, string | undefined>> = process.env): void {
    if (env.JOBFRAY_WORKER_MODE !== undefined && !["read_only", "nonfinancial", "financial", "full"].includes(env.JOBFRAY_WORKER_MODE))
        throw new Error("Invalid worker mode");
    if (env.JOBFRAY_REFUND_PROCESSING_ENABLED !== undefined && !["0", "1"].includes(env.JOBFRAY_REFUND_PROCESSING_ENABLED)) throw new Error("Invalid refund processing gate");
    if (env.JOBFRAY_REFUND_PROCESSING_ENABLED === "1" && (env.JOBFRAY_WORKER_MODE !== "financial" || env.JOBFRAY_PROVIDER_OPERATIONS_ENABLED !== "1" || env.JOBFRAY_RELEASE_PROVIDERS_VERIFIED !== "1")) throw new Error("Refund processing requires the authorized financial worker");
    if (env.JOBFRAY_SANDBOX === "1" && !localSandboxAllowed(env))
        throw new Error("Sandbox requires explicit local test configuration and a loopback public origin");
    if (env.JOBFRAY_PRODUCTION_PROVIDERS === "1") {
        if (env.JOBFRAY_DATABASE_ENABLED !== "1" || env.JOBFRAY_SANDBOX === "1")
            throw new Error("Production providers require verified database persistence");
        providerConfiguration(env);
    }
    if (env.JOBFRAY_PROVIDER_OPERATIONS_ENABLED === "1" && (env.JOBFRAY_PRODUCTION_PROVIDERS !== "1" || env.JOBFRAY_RELEASE_PROVIDERS_VERIFIED !== "1"))
        throw new Error("Provider operations require explicit release verification");
    if (env.JOBFRAY_CHECKOUT_ENABLED === "1" && (env.JOBFRAY_PROVIDER_OPERATIONS_ENABLED !== "1" || env.JOBFRAY_RELEASE_PROVIDERS_VERIFIED !== "1"))
        throw new Error("Checkout requires separately verified providers");
    if (env.JOBFRAY_DATABASE_ENABLED === "1") {
        if (env.JOBFRAY_SANDBOX === "1")
            throw new Error("Sandbox and database production configuration cannot be combined");
        if (env.JOBFRAY_RELEASE_DB_VERIFIED !== "1")
            throw new Error("Persistence release verification is required");
        if (!env.DATABASE_URL || (env.JOBFRAY_CONFIRMATION_KEY?.length ?? 0) < 32)
            throw new Error("Persistence and confirmation signing configuration are required");
        previousConfirmationKeys(env);
        if (!/^[a-z0-9-]{1,40}$/.test(env.JOBFRAY_CONFIRMATION_KEY_VERSION ?? "v1"))
            throw new Error("Invalid confirmation key version");
        const origin = new URL(env.JOBFRAY_PUBLIC_ORIGIN ?? "");
        if (origin.protocol !== "https:" || origin.username || origin.password)
            throw new Error("Production public origin must use HTTPS");
    }
}
export function previousConfirmationKeys(env: Readonly<Record<string, string | undefined>> = process.env): Readonly<Record<string, string>> {
    const value: unknown = JSON.parse(env.JOBFRAY_CONFIRMATION_PREVIOUS_KEYS ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 8 || Object.entries(value).some(([id, key]) => !(/^[a-z0-9-]{1,40}$/.test(id)) || typeof key !== "string" || key.length < 32))
        throw new Error("Invalid previous confirmation key configuration");
    return value as Record<string, string>;
}
/** Production-build mock verification is supported only by the explicitly loopback-bound Next CLI. */
export function assertLocalTestBinding(env: Readonly<Record<string, string | undefined>> = process.env, args: readonly string[] = process.argv): void {
    if (env.NODE_ENV !== "production" || env.JOBFRAY_SANDBOX !== "1")
        return;
    const index = args.findIndex(value => value === "--hostname" || value === "-H");
    if (index < 0 || !["127.0.0.1", "localhost", "::1"].includes(args[index + 1] ?? ""))
        throw new Error("Local mock verification requires an explicit loopback listener");
}
