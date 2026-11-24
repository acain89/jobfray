import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
// Never inherit provider/database credentials into the smoke-test application.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    [
      "PATH",
      "SYSTEMROOT",
      "WINDIR",
      "COMSPEC",
      "PATHEXT",
      "TEMP",
      "TMP",
      "USERPROFILE",
      "APPDATA",
      "LOCALAPPDATA",
    ].includes(key.toUpperCase()),
  ),
);
const probe = net.createServer();
await new Promise((done) => probe.listen(0, "127.0.0.1", done));
const port = probe.address().port;
await new Promise((done) => probe.close(done));
const origin = `http://127.0.0.1:${port}`;
const configuredOrigin = process.env.JOBFRAY_PUBLIC_ORIGIN ?? "http://localhost:3000";
let log = "";
const server = spawn(
  process.execPath,
  [
    "--import",
    pathToFileURL(resolve("scripts/verification-network-guard.mjs")).href,
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    env: {
      ...env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      JOBFRAY_PUBLIC_ORIGIN: configuredOrigin,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stdout.on("data", (data) => {
  log += data;
});
server.stderr.on("data", (data) => {
  log += data;
});
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null)
      throw Error("Local server exited before readiness: " + log);
    try {
      const r = await fetch(origin + "/api/health");
      if (r.status === 200) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for local server only. */
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  assert.ok(ready, "Local server ready");
  const titles = new Set();
  for (const route of ["/", "/find", "/for-businesses", "/how-it-works", "/login", "/register", "/terms"]) {
    const r = await fetch(origin + route);
    assert.equal(r.status, 200, route);
    assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    const html = await r.text();
    const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/);
    assert.equal(canonical?.[1] ? new URL(canonical[1]).toString() : undefined, new URL(route, configuredOrigin).toString(), route + " configured canonical");
    assert.match(html, /<h1/);
    assert.match(html, /Skip to content/);
    const title = html.match(/<title>(.*?)<\/title>/)?.[1];
    assert.ok(title);
    assert.ok(!titles.has(title));
    titles.add(title);
    for (const match of html.matchAll(/<a[^>]*href="(\/[^"#?]*)"/g)) {
      const link = await fetch(origin + match[1]);
      assert.equal(link.status, 200, "working link " + match[1]);
    }
  }
  for (const route of [
    "/sites/synthetic-business",
    "/worker/dashboard",
    "/api/post/create",
    "/api/worker/billing/setup-intent",
  ]) {
    const r = await fetch(origin + route, {
      redirect: "manual",
      headers: { "x-forwarded-host": "forged.jobfray.com" },
    });
    assert.equal(r.status, 404, route);
  }
  assert.equal(
    (await fetch(origin + "/api/health", { method: "POST" })).status,
    405,
  );
  const health = await (await fetch(origin + "/api/health")).json();
  assert.deepEqual(health, {
    status: "ok",
    service: "jobfray",
    stage: "foundation",
  });
  const robots = await (await fetch(origin + "/robots.txt")).text();
  assert.match(robots, /Disallow: \/$/m);
  const search = await (
    await fetch(
      origin +
        "/find?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E&mode=RENTAL&fulfillment=MOBILE",
    )
  ).text();
  assert.ok(search.includes("&lt;script&gt;"));
  assert.ok(!search.includes("<script>alert(1)</script>"));
  assert.ok(search.includes("Mobile"));
  assert.ok(search.includes("RENTAL"));
  const how = await (await fetch(origin + "/how-it-works")).text();
  for (const fee of [2, 3, 4, 5]) assert.ok(how.replace(/<[^>]+>/g, "").includes("$" + fee));
  for (const band of ["$0.00 to $30.00", "$30.01 to $75.00", "$75.01 to $150.99", "$151.00 and above"]) assert.ok(how.includes(band));
  assert.ok(how.includes("genuinely unknown offering price"));
  for (const mode of ["RENTAL", "SERVICE", "QUOTE", "RESERVATION"]) assert.ok(search.includes('value="' + mode + '"'));
  assert.ok(search.includes("Fulfillment"));
  assert.match(how.replace(/<[^>]+>/g, ""), /\$5/);
  assert.match(
    how,
    /pay businesses directly|pay you directly|pay the provider directly|pay service providers directly|arrange payment.*directly/i,
  );
  console.log(
    "PASS: public HTML, navigation, fees, escaped filters, fail-closed owner/tenant routes, old-route removal, health, indexing headers and robots; no provider or DB access.",
  );
} finally {
  if (server.exitCode === null) {
    const exited = new Promise((done) => server.once("exit", done));
    server.kill();
    await exited;
  }
}
