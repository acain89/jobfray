import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { X509Certificate } from "node:crypto";
import baseline from "../../scripts/phase6b/baseline.json";
import { aclChecks } from "../../scripts/phase6b/initialize";
const externalHost = "dpg-dc2u9qmtlv9c738ork2g-a.oregon-postgres.render.com";
export function verifiedDatabaseURL(raw: string): string {
    const url = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== externalHost || url.pathname !== "/jobfray" || url.username !== "jobfray_app" || !url.password || (url.port && url.port !== "5432") || url.hash) throw new Error("Restricted database identity mismatch");
    const allowed: Record<string, readonly string[]> = { sslmode: ["require"], sslaccept: ["strict"], schema: ["public"], connection_limit: ["2"], pool_timeout: ["10"], connect_timeout: ["10"] };
    const seen = new Set<string>();
    for (const [name, value] of url.searchParams) { if (seen.has(name) || !allowed[name]?.includes(value)) throw new Error("Unsafe database connection override"); seen.add(name); }
    for (const [name, values] of Object.entries(allowed)) url.searchParams.set(name, values[0]!);
    const certificate = resolve("prisma/certs/isrg-root-x1.pem"), cert = new X509Certificate(readFileSync(certificate));
    if (!cert.ca || cert.fingerprint256 !== "96:BC:EC:06:26:49:76:F3:74:60:77:9A:CF:28:C5:A7:CF:E8:A3:C0:AA:E1:1A:8F:FC:EE:05:C0:BD:DF:08:C6" || Date.now() >= Date.parse(cert.validTo)) throw new Error("Database trust anchor invalid");
    url.searchParams.set("sslcert", certificate.replaceAll("\\", "/"));
    return url.href;
}
const canonical = (value: unknown): string => JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
export async function acceptDatabase(raw: string) {
    const url = verifiedDatabaseURL(raw);
    const client = new PrismaClient({ datasources: { db: { url } }, log: [] });
    try {
        return await client.$transaction(async tx => {
            await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
            const rows = await tx.$queryRawUnsafe<Array<{ database: string; role: string; ssl: boolean; protocol: string; bits: number; role_limit: number; max_connections: number }>>("SELECT current_database() AS database,current_user AS role,s.ssl,s.version AS protocol,s.bits,r.rolconnlimit AS role_limit,current_setting('max_connections')::integer AS max_connections FROM pg_stat_ssl s JOIN pg_roles r ON r.rolname=current_user WHERE s.pid=pg_backend_pid()");
            const identity = rows[0];
            if (!identity || identity.database !== "jobfray" || identity.role !== "jobfray_app" || !identity.ssl || !["TLSv1.2", "TLSv1.3"].includes(identity.protocol) || identity.bits < 128 || identity.role_limit !== 2) throw new Error("Database role or TLS mismatch");
            const sql = readFileSync("scripts/phase6b/catalog.sql", "utf8").trim().replace(/;$/, "");
            const catalog = await tx.$queryRawUnsafe<Array<{ catalog: unknown }>>("SELECT (" + sql + ") AS catalog");
            if (canonical(catalog[0]?.catalog) !== canonical(baseline.snapshots[7])) throw new Error("Database catalog mismatch");
            await tx.$executeRawUnsafe(aclChecks(baseline));
            return { accepted: true, ...identity, schemaMatches: true, privilegesVerified: true, connectionLimit: 2, poolTimeout: 10, connectTimeout: 10, certificateVerification: "strict", hostnameVerification: true, transport: "external_verified_tls", migrationsRun: 0 };
        }, { maxWait: 10000, timeout: 30000 });
    } finally { await client.$disconnect(); }
}
