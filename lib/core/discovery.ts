import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "./validation";
import type { BusinessMode } from "./model";
export interface DirectoryRow {
    slug: string;
    name: string;
    category: string;
    city: string;
    distance: number | null;
    offerings: {
        name: string;
        modes: BusinessMode[];
    }[];
    cursor?: string;
}
export interface DirectoryQuery {
    text: string;
    mode: string;
    fulfillment: string;
    point: {
        latitude: number;
        longitude: number;
    } | null;
    after?: string;
}
export async function indexedDirectory(client: PrismaClient, q: DirectoryQuery): Promise<DirectoryRow[]> {
    let cursor: {
        rank: number;
        name: string;
        id: string;
    } | null = null;
    if (q.after) {
        try {
            if (q.after.length > 1000)
                throw new Error();
            cursor = JSON.parse(Buffer.from(q.after, "base64url").toString()) as {
                rank: number;
                name: string;
                id: string;
            };
            if (!cursor || !Number.isFinite(cursor.rank) || typeof cursor.name !== "string" || typeof cursor.id !== "string")
                throw new Error();
        }
        catch {
            throw new AppError("Invalid discovery cursor");
        }
    }
    const p = q.point, point = p ? Prisma.sql `public.jf_earth(${p.latitude}::float8,${p.longitude}::float8)` : Prisma.sql `NULL`;
    const rank = p ? Prisma.sql `public.jf_miles(${p.latitude}::float8,${p.longitude}::float8,d.latitude,d.longitude)` : Prisma.sql `0::float8`;
    const pattern = "%" + q.text.replace(/[\\%_]/g, v => "\\" + v) + "%";
    const mode = q.mode ? Prisma.sql `AND d.modes @> ARRAY[${q.mode}]::text[]` : Prisma.empty;
    const fulfillment = q.fulfillment ? Prisma.sql `AND d.fulfillments @> ARRAY[${q.fulfillment}]::text[]` : Prisma.empty;
    const pair = q.mode && q.fulfillment ? Prisma.sql `AND d.pairs @> ARRAY[${q.mode + ":" + q.fulfillment}]::text[]` : Prisma.empty;
    const geo = p ? Prisma.sql `AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL` : Prisma.empty;
    const bounding = p && q.fulfillment === "MOBILE" ? Prisma.sql `AND public.jf_earth(d.latitude,d.longitude) OPERATOR(public.<@) public.jf_box(${p.latitude}::float8,${p.longitude}::float8,1005::float8)` : Prisma.empty;
    const after = cursor ? Prisma.sql `AND (${rank},d.name,d.id)>(${cursor.rank}::float8,${cursor.name},${cursor.id})` : Prisma.empty;
    const order = p ? Prisma.sql `public.jf_earth(d.latitude,d.longitude) OPERATOR(public.<->) ${point},d.name,d.id` : Prisma.sql `d.name,d.id`;
    const rows = await client.$queryRaw<{
        id: string;
        slug: string;
        name: string;
        category: string;
        city: string;
        rank: number;
        offerings: DirectoryRow["offerings"];
    }[]>(Prisma.sql `
 SELECT d.id,d.slug,d.name,d.category,d.city,${rank} AS rank,matched.offerings
 FROM "JfDirectoryBusiness" d
 CROSS JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('name',o->>'name','modes',o->'modes')) AS offerings FROM jsonb_array_elements(d.document->'offerings') o
  WHERE (${q.text}='' OR position(lower(${q.text}) IN lower(d.category||' '||(o->>'name')||' '||(o->>'description')))>0)
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(o->'configurations') c WHERE (${q.mode}='' OR c->>'mode'=${q.mode}) AND (${q.fulfillment}='' OR c->'fulfillments' ? ${q.fulfillment}) AND (${!p || q.fulfillment !== "MOBILE"} OR ${rank} <= (c->>'radiusMiles')::float8+5))) matched
 WHERE matched.offerings IS NOT NULL ${mode} ${fulfillment} ${pair} ${geo} ${bounding} ${after}
 AND (${q.text}='' OR d."searchText" ILIKE ${pattern}) ORDER BY ${order} LIMIT 100`);
    return rows.map(row => ({ slug: row.slug, name: row.name, category: row.category, city: row.city, distance: p ? Math.round(row.rank / 5) * 5 : null, offerings: row.offerings, cursor: Buffer.from(JSON.stringify({ rank: row.rank, name: row.name, id: row.id })).toString("base64url") }));
}
