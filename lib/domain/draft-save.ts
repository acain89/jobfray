/** Serialized optimistic autosave, independent of React so interruption/replay can be tested. */
function signature(value: unknown): string {
    if (Array.isArray(value))
        return "[" + value.map(signature).join(",") + "]";
    if (value !== null && typeof value === "object")
        return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => JSON.stringify(key) + ":" + signature(v)).join(",") + "}";
    return JSON.stringify(value) ?? "null";
}
export class DraftSaver<T> {
    private queue: Promise<unknown> = Promise.resolve();
    private saved: string;
    private pending = 0;
    constructor(initial: T, private revision: number, private adapter: {
        write: (value: T, revision: number) => Promise<number>;
        read: () => Promise<{
            value: T;
            revision: number;
        }>;
    }) { this.saved = signature(initial); }
    isSaved(value: T): boolean { return this.pending === 0 && this.saved === signature(value); }
    save(value: T): Promise<number> {
        const snapshot = structuredClone(value), desired = signature(snapshot);
        this.pending++;
        const result = this.queue.catch(() => { }).then(async () => {
            if (this.saved === desired)
                return this.revision;
            let last: unknown;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    this.revision = await this.adapter.write(snapshot, this.revision);
                    this.saved = desired;
                    return this.revision;
                }
                catch (error) {
                    last = error;
                    let latest: {
                        value: T;
                        revision: number;
                    } | null = null;
                    try {
                        latest = await this.adapter.read();
                    }
                    catch { }
                    if (latest && signature(latest.value) === desired) {
                        this.revision = latest.revision;
                        this.saved = desired;
                        return this.revision;
                    }
                    if (latest && latest.revision !== this.revision && signature(latest.value) === this.saved) {
                        this.revision = latest.revision;
                        continue;
                    }
                    if (latest && latest.revision !== this.revision)
                        throw new Error("The website changed in another tab. Reload before saving; your unsaved draft remains visible.");
                    if (attempt < 2)
                        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                }
            }
            throw last;
        }).finally(() => { this.pending--; });
        this.queue = result;
        return result;
    }
}
