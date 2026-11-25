import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { selectCliAssets } = createRequire(import.meta.url)("../scripts/stripe-sandbox-verification.cjs");
const asset = (name: string) => ({ name, browser_download_url: "https://github.com/stripe/stripe-cli/releases/download/v1.55.15/" + name });
test("Stripe CLI selects the actual platform-specific Windows checksum manifest", () => {
    const release = { assets: [asset("stripe-linux-checksums.txt"), asset("stripe-windows-checksums.txt"), asset("stripe-windows-checksums.txt.sig"), asset("stripe_1.55.15_windows_x86_64.zip"), asset("stripe_1.55.15_windows_i386.zip")] };
    const selected = selectCliAssets(release, "x64");
    assert.equal(selected.archive.name, "stripe_1.55.15_windows_x86_64.zip");
    assert.equal(selected.sums.name, "stripe-windows-checksums.txt");
    assert.equal(selectCliAssets(release, "ia32").archive.name, "stripe_1.55.15_windows_i386.zip");
    assert.throws(() => selectCliAssets(release, "arm64"), /WINDOWS_ARCHITECTURE_UNSUPPORTED/);
});
test("Stripe CLI never substitutes Linux checksums or signatures for Windows manifest", () => {
    const archive = asset("stripe_1.55.15_windows_x86_64.zip");
    assert.throws(() => selectCliAssets({ assets: [archive, asset("stripe-linux-checksums.txt"), asset("stripe-windows-checksums.txt.sig")] }, "x64"), /WINDOWS_ASSET_OR_CHECKSUM_MISSING/);
    assert.equal(selectCliAssets({ assets: [archive, asset("stripe_1.55.15_checksums.txt")] }, "x64").sums.name, "stripe_1.55.15_checksums.txt");
});
