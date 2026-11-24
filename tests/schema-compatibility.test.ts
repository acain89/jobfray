import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
const baseline = "83acd16460239747f732523faddc3d65511cace2";
const historical = (file: string): Buffer => execFileSync("git", ["show", `${baseline}:${file}`]);
test("all historical migrations and repository instructions are byte-for-byte retained", () => {
    const files = execFileSync("git", ["ls-tree", "-r", "--name-only", baseline, "prisma/migrations"], { encoding: "utf8" })
        .trim()
        .split("\n");
    assert.equal(files.filter((f) => f.endsWith("migration.sql")).length, 3);
    for (const file of [...files, "AGENTS.md", "CLAUDE.md"])
        assert.deepEqual(readFileSync(file), historical(file), file);
    assert.equal(readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).length, 6);
});
test("legacy models and enums are unchanged; Prisma 5 only adds the datasource URL", () => {
    const actual = readFileSync("prisma/schema.prisma", "utf8").split("// PHASE 3 ADDITIVE MODELS.")[0]!.trimEnd().replace('\n  url      = env("DATABASE_URL")', "");
    assert.equal(actual, historical("prisma/schema.prisma").toString("utf8").trimEnd());
    const proposed = readFileSync("prisma/proposals/rebuild.prisma", "utf8");
    assert.ok(proposed.includes("PROPOSAL ONLY"));
    const models = [...proposed.matchAll(/^model (\w+)/gm)].map((m) => m[1]);
    assert.ok(models.length > 0 && models.every((m) => m?.startsWith("Jf")));
    assert.doesNotMatch(proposed, /onDelete:\s*Cascade|stripeAccountId|transferDestination/);
});
test("application has no live provider SDKs, seed hooks or ungated financial checkout", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
        dependencies: Record<string, string>;
        scripts: Record<string, string>;
        prisma?: unknown;
    };
    for (const name of [
        "stripe",
        "twilio",
        "cloudinary",
        "mapbox-gl",
        "pg",
        "@prisma/adapter-pg",
    ])
        assert.equal(pkg.dependencies[name], undefined);
    assert.equal(pkg.prisma, undefined);
    assert.equal(existsSync("prisma.config.ts"), false);
    assert.equal(existsSync("prisma/seed.ts"), false);
    // Application writes and the gated Prisma adapter are now explicitly authorized.
    // Live provider SDKs and seed hooks remain absent.
    const route = readFileSync("app/api/core/route.ts", "utf8");
    assert.match(route, /requireSandbox\(request\)/);
    assert.match(readFileSync("lib/core/runtime.ts", "utf8"), /JOBFRAY_RELEASE_DB_VERIFIED/);
});
test("proposed mode/fulfillment enums and tenant-owned relations match Phase 2 contracts", async () => {
    const { BUSINESS_MODES, FULFILLMENTS } = await import("../lib/domain/validation");
    const proposed = readFileSync("prisma/proposals/rebuild.prisma", "utf8");
    const values = (name: string) => proposed.match(new RegExp(`enum ${name} \\{([^}]+)\\}`))?.[1]?.trim().split(/\s+/);
    assert.deepEqual(values("JfBusinessMode"), [...BUSINESS_MODES]);
    assert.deepEqual(values("JfFulfillment"), [...FULFILLMENTS]);
    assert.match(proposed, /underlyingSubtotalCents\s+BigInt\?/);
    assert.match(proposed, /@@unique\(\[businessId,\s*idempotencyKey\]\)/);
    assert.match(proposed, /references:\s*\[businessId,\s*id\]/);
    assert.doesNotMatch(proposed, /JfServiceMode|AWAITING_PAYMENT|QUOTE_REQUEST|CONFIRMED_APPOINTMENT/);
});
test("offline additive SQL touches only new Jf tables and preserves immutable-history guards", () => {
    const ddl = readFileSync("prisma/review/phase3-additive.sql", "utf8"), checks = readFileSync("prisma/review/phase3-constraints.sql", "utf8");
    assert.doesNotMatch(ddl, /DROP (TABLE|INDEX|TYPE)|ALTER TABLE "(?!Jf)/);
    assert.match(ddl, /CREATE TABLE "JfRefund"/);
    assert.match(checks, /jf_snapshot_immutable/);
    assert.match(checks, /jf_event_immutable/);
    assert.match(checks, /jf_request_no_delete/);
    assert.match(checks, /9007199254740991/);
});
test("Phase 4 migration content preserves the original Git line-ending normalization", () => {
    const revision = "afba51cd1575f29da2aa222a0d28365a038ab0ee";
    const files = execFileSync("git", ["ls-tree", "-r", "--name-only", revision, "prisma/migrations"], { encoding: "utf8" }).trim().split("\n");
    assert.equal(files.filter(f => f.endsWith("migration.sql")).length, 5);
    for (const file of files)
        assert.equal(execFileSync("git",["hash-object",file],{encoding:"utf8"}).trim(),execFileSync("git",["rev-parse",revision+":"+file],{encoding:"utf8"}).trim(),file);
});
