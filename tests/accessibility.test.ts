import test from "node:test";
import assert from "node:assert/strict";
import { PAGE_COLORS, COMPONENT_COLORS, TRIM_COLORS } from "../components/core/SiteView";
function luminance(hex: string) { const parts = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return parts[0]! * 0.2126 + parts[1]! * 0.7152 + parts[2]! * 0.0722; }
function ratio(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
test("every curated website color combination meets 4.5:1 text contrast", () => {
    assert.equal(PAGE_COLORS.length, 10);
    assert.equal(COMPONENT_COLORS.length, 10);
    assert.equal(TRIM_COLORS.length, 10);
    for (const background of [...PAGE_COLORS, ...COMPONENT_COLORS]) {
        assert.ok(ratio("#20332a", background) >= 4.5);
        for (const trim of TRIM_COLORS)
            assert.ok(ratio(trim, background) >= 4.5);
    }
    for (const trim of TRIM_COLORS)
        assert.ok(ratio("#ffffff", trim) >= 4.5);
});
