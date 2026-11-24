import test from "node:test";
import assert from "node:assert/strict";
import { DraftSaver } from "../lib/domain/draft-save";
test("undo during an in-flight save persists the final visible value", async () => {
    let stored = { text: "original" }, revision = 1, release!: () => void;
    const gate = new Promise<void>(r => release = r), writes: string[] = [];
    const saver = new DraftSaver(stored, revision, { async write(value, expected) { assert.equal(expected, revision); writes.push(value.text); if (value.text === "changed")
            await gate; stored = value; return ++revision; }, async read() { return { value: stored, revision }; } });
    const first = saver.save({ text: "changed" });
    await Promise.resolve();
    const second = saver.save({ text: "original" });
    release();
    await Promise.all([first, second]);
    assert.deepEqual(writes, ["changed", "original"]);
    assert.equal(stored.text, "original");
    assert.ok(saver.isSaved(stored));
});
test("queued duplicate drafts do not create duplicate writes", async () => {
    let stored = { text: "original" }, revision = 1, writes = 0;
    const saver = new DraftSaver(stored, revision, { async write(value) { writes++; stored = value; return ++revision; }, async read() { return { value: stored, revision }; } });
    await Promise.all([saver.save({ text: "A" }), saver.save({ text: "A" }), saver.save({ text: "B" })]);
    assert.equal(writes, 2);
    assert.equal(stored.text, "B");
});
test("lost acknowledgement recovers persisted revision without overwriting or repeating a committed save", async () => {
    let stored = { a: 1, b: 2 }, revision = 1, writes = 0;
    const saver = new DraftSaver(stored, revision, { async write(value) { writes++; stored = { b: value.b, a: value.a }; revision++; throw new Error("Acknowledgement lost"); }, async read() { return { value: stored, revision }; } });
    assert.equal(await saver.save({ a: 3, b: 4 }), 2);
    assert.equal(writes, 1);
    assert.ok(saver.isSaved({ b: 4, a: 3 }));
});
test("another tab's revision is a conflict and is never silently overwritten", async () => {
    let writes = 0;
    const saver = new DraftSaver({ text: "original" }, 1, { async write() { writes++; throw new Error("Conflict"); }, async read() { return { value: { text: "other tab" }, revision: 2 }; } });
    await assert.rejects(saver.save({ text: "local unsaved draft" }), /another tab/);
    assert.equal(writes, 1);
    assert.ok(!saver.isSaved({ text: "local unsaved draft" }));
});
