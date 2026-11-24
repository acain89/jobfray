import { writeFileSync } from "node:fs";
import { DisposableRepository, runSql, clients } from "./phase5-postgres-support";
async function main() {
    const repo = new DisposableRepository();
    try {
        await repo.transaction([], tx => tx.find("businesses", {}, { limit: 1 }));
        const schemas = runSql("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'test_%';").match(/test_[a-f0-9]{32}/g) ?? [];
        let donor = "";
        for (const schema of schemas) {
            const count = runSql(`SELECT count(*) FROM "${schema}"."JfDirectoryBusiness" WHERE modes @> ARRAY['SERVICE']::text[] AND fulfillments @> ARRAY['MOBILE']::text[];`);
            if (Number(count.match(/\n\s*(\d+)\s*\r?\n/)?.[1] ?? 0) > 0) {
                donor = schema;
                break;
            }
        }
        if (!donor)
            throw new Error("Synthetic Phase 5 template unavailable");
        const prefix = `SET search_path TO "${repo.schema}";`;
        runSql(prefix + `CREATE TABLE bench_template AS SELECT a.document AS account,b.document AS business,r.document AS resource,o.document AS offering FROM "${donor}"."JfBusiness" b JOIN "${donor}"."JfAccount" a ON a.id=b."ownerId" JOIN "${donor}"."JfResource" r ON r."businessId"=b.id JOIN "${donor}"."JfOffering" o ON o."resourceId"=r.id WHERE b.id IN (SELECT id FROM "${donor}"."JfDirectoryBusiness" WHERE modes @> ARRAY['SERVICE']::text[] AND fulfillments @> ARRAY['MOBILE']::text[]) AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.document->'configurations') c WHERE c->>'mode'='SERVICE' AND c->'fulfillments' ? 'MOBILE') LIMIT 1;`);
        const evidence: unknown[] = [];
        for (const [start, end] of [[1, 1000], [1001, 10000]]) {
            runSql(prefix + `INSERT INTO "JfAccount"(id,email,document) SELECT 'bench-account-'||i,'bench'||i||'@example.test',account||jsonb_build_object('id','bench-account-'||i,'email','bench'||i||'@example.test') FROM bench_template CROSS JOIN generate_series(${start},${end})i;
  INSERT INTO "JfBusiness"(id,"ownerId",slug,status,document) SELECT 'bench-business-'||i,'bench-account-'||i,'bench-business-'||i,'PUBLISHED',business||jsonb_build_object('id','bench-business-'||i,'ownerId','bench-account-'||i,'slug','bench-business-'||i,'name','Benchmark '||lpad(i::text,5,'0'),'discoveryPoint',jsonb_build_object('latitude',30.271+(i%100)::float8/1000,'longitude',-97.743+(i%100)::float8/1000)) FROM bench_template CROSS JOIN generate_series(${start},${end})i;
  INSERT INTO "JfResource"(id,"businessId",capacity,document) SELECT 'bench-resource-'||i,'bench-business-'||i,(resource->>'capacity')::int,resource||jsonb_build_object('id','bench-resource-'||i,'businessId','bench-business-'||i) FROM bench_template CROSS JOIN generate_series(${start},${end})i;
  INSERT INTO "JfOffering"(id,"businessId","resourceId",document) SELECT 'bench-offering-'||i,'bench-business-'||i,'bench-resource-'||i,offering||jsonb_build_object('id','bench-offering-'||i,'businessId','bench-business-'||i,'resourceId','bench-resource-'||i) FROM bench_template CROSS JOIN generate_series(${start},${end})i;ANALYZE "JfDirectoryBusiness";`);
            const samples: number[] = [];
            let first: Awaited<ReturnType<typeof repo.searchDirectory>> = [];
            const q = { text: "", mode: "SERVICE", fulfillment: "MOBILE", point: { latitude: 30.271, longitude: -97.743 } };
            for (let i = 0; i < 20; i++) {
                const before = performance.now();
                const rows = await repo.searchDirectory(q);
                samples.push(performance.now() - before);
                if (i === 0)
                    first = rows;
            }
            if (first.length !== 100)
                throw new Error("Expected bounded 100-result page");
            const next = await repo.searchDirectory({ ...q, after: first.at(-1)!.cursor! });
            if (next.some(x => first.some(y => y.slug === x.slug)))
                throw new Error("Pagination overlap");
            if (JSON.stringify(first).includes("latitude") || JSON.stringify(first).includes("address"))
                throw new Error("Private projection leak");
            samples.sort((a, b) => a - b);
            evidence.push({ businesses: end, queries: 20, p50Ms: samples[10], p95Ms: samples[18], maxMs: samples[19], returned: first.length, pagination: true, privacy: true });
            const plan = runSql(prefix + `EXPLAIN (ANALYZE,BUFFERS) SELECT id FROM "JfDirectoryBusiness" WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND modes @> ARRAY['SERVICE']::text[] AND fulfillments @> ARRAY['MOBILE']::text[] AND public.jf_earth(latitude,longitude) OPERATOR(public.<@) public.jf_box(30.271::float8,-97.743::float8,1005::float8) ORDER BY public.jf_earth(latitude,longitude) OPERATOR(public.<->) public.jf_earth(30.271::float8,-97.743::float8),name,id LIMIT 100;`);
            writeFileSync(`artifacts/phase5-directory-${end}-plan.txt`, plan);
        }
        writeFileSync("artifacts/phase5-directory.json", JSON.stringify({ measurements: evidence }, null, 2));
        console.log(JSON.stringify(evidence));
    }
    finally {
        await Promise.all(clients.map(c => c.$disconnect()));
    }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
