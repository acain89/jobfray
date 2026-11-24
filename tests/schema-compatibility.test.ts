import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
const baseline = "83acd16460239747f732523faddc3d65511cace2";
const historical = (file: string): Buffer =>
  execFileSync("git", ["show", `${baseline}:${file}`]);
test("all historical migrations and repository instructions are byte-for-byte retained", () => {
  const files = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", baseline, "prisma/migrations"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n");
  assert.equal(files.filter((f) => f.endsWith("migration.sql")).length, 3);
  for (const file of [...files, "AGENTS.md", "CLAUDE.md"])
    assert.deepEqual(readFileSync(file), historical(file), file);
  assert.equal(
    readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) =>
      d.isDirectory(),
    ).length,
    3,
  );
});
test("legacy models and enums are unchanged; Prisma 5 only adds the datasource URL", () => {
  const actual = readFileSync("prisma/schema.prisma", "utf8").replace(
    '\n  url      = env("DATABASE_URL")',
    "",
  );
  assert.equal(actual, historical("prisma/schema.prisma").toString("utf8"));
  const proposed = readFileSync("prisma/proposals/rebuild.prisma", "utf8");
  assert.ok(proposed.includes("PROPOSAL ONLY"));
  const models = [...proposed.matchAll(/^model (\w+)/gm)].map((m) => m[1]);
  assert.ok(models.length > 0 && models.every((m) => m?.startsWith("Jf")));
  assert.doesNotMatch(
    proposed,
    /onDelete:\s*Cascade|stripeAccountId|transferDestination/,
  );
});
test("foundation has no production write adapters, old provider dependencies or seed hooks", () => {
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
  for (const dir of ["app", "lib", "components"]) {
    const walk = (folder: string): string[] =>
      readdirSync(folder, { withFileTypes: true }).flatMap((f) =>
        f.isDirectory()
          ? walk(path.join(folder, f.name))
          : [path.join(folder, f.name)],
      );
    for (const file of walk(dir).filter((f) => /\.tsx?$/.test(f))) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /from ["'](@prisma\/client|stripe|twilio|cloudinary|pg)["']/,
        file,
      );
      assert.doesNotMatch(
        source,
        /export (async )?function (POST|PUT|PATCH|DELETE)\b/,
        file,
      );
    }
  }
});

test("proposed mode/fulfillment enums and tenant-owned relations match Phase 2 contracts", async () => {
  const { BUSINESS_MODES, FULFILLMENTS } = await import("../lib/domain/validation");
  const proposed = readFileSync("prisma/proposals/rebuild.prisma", "utf8");
  const values = (name: string) => proposed.match(new RegExp(`enum ${name} \\{([^}]+)\\}`))?.[1]?.trim().split(/\s+/);
  assert.deepEqual(values("JfBusinessMode"), [...BUSINESS_MODES]);
  assert.deepEqual(values("JfFulfillment"), [...FULFILLMENTS]);
  assert.match(proposed, /unitAmountCents\s+BigInt\?/);
  assert.match(proposed, /underlyingSubtotalCents\s+BigInt\?/);
  assert.match(proposed, /@@unique\(\[businessId, idempotencyKey\]\)/);
  assert.match(proposed, /references: \[businessId, offeringId, mode\]/);
  assert.doesNotMatch(proposed, /JfServiceMode|AWAITING_PAYMENT|QUOTE_REQUEST|CONFIRMED_APPOINTMENT/);
});
