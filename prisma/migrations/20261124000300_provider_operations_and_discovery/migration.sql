-- CreateTable
CREATE TABLE "JfOperation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "availableAt" TIMESTAMPTZ(3) NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfPushDevice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "endpointHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfPushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JfDirectoryBusiness" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "modes" TEXT[],
    "fulfillments" TEXT[],
    "pairs" TEXT[],
    "searchText" TEXT NOT NULL,
    "document" JSONB NOT NULL,

    CONSTRAINT "JfDirectoryBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JfOperation_kind_state_availableAt_idx" ON "JfOperation"("kind", "state", "availableAt");

-- CreateIndex
CREATE INDEX "JfOperation_businessId_idx" ON "JfOperation"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "JfPushDevice_endpointHash_key" ON "JfPushDevice"("endpointHash");

-- CreateIndex
CREATE INDEX "JfPushDevice_businessId_accountId_active_idx" ON "JfPushDevice"("businessId", "accountId", "active");

-- CreateIndex
CREATE INDEX "JfPushDevice_sessionHash_idx" ON "JfPushDevice"("sessionHash");

-- CreateIndex
CREATE UNIQUE INDEX "JfDirectoryBusiness_slug_key" ON "JfDirectoryBusiness"("slug");

-- CreateIndex
CREATE INDEX "JfDirectoryBusiness_modes_idx" ON "JfDirectoryBusiness" USING GIN ("modes");

-- CreateIndex
CREATE INDEX "JfDirectoryBusiness_fulfillments_idx" ON "JfDirectoryBusiness" USING GIN ("fulfillments");

-- CreateIndex
CREATE INDEX "JfDirectoryBusiness_pairs_idx" ON "JfDirectoryBusiness" USING GIN ("pairs");

-- AddForeignKey
ALTER TABLE "JfOperation" ADD CONSTRAINT "JfOperation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "JfBusiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfPushDevice" ADD CONSTRAINT "JfPushDevice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "JfBusiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfPushDevice" ADD CONSTRAINT "JfPushDevice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "JfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JfDirectoryBusiness" ADD CONSTRAINT "JfDirectoryBusiness_id_fkey" FOREIGN KEY ("id") REFERENCES "JfBusiness"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JfRefund" DROP CONSTRAINT "JfRefund_state_check";
ALTER TABLE "JfRefund" ADD CONSTRAINT "JfRefund_state_check" CHECK (state IN ('REQUIRED','SIMULATED_REFUNDED','PROCESSING','REFUNDED','FAILED'));
ALTER TABLE "JfOperation" ADD CONSTRAINT "JfOperation_state_check" CHECK (state IN ('PENDING','RUNNING','DONE','FAILED'));
CREATE TRIGGER jf_operation_projection BEFORE INSERT OR UPDATE ON "JfOperation" FOR EACH ROW EXECUTE FUNCTION jf_validate_projection('id','businessId','kind','state');
CREATE TRIGGER jf_operation_times BEFORE INSERT OR UPDATE ON "JfOperation" FOR EACH ROW EXECUTE FUNCTION jf_validate_time_projection('availableAt');
CREATE TRIGGER jf_push_projection BEFORE INSERT OR UPDATE ON "JfPushDevice" FOR EACH ROW EXECUTE FUNCTION jf_validate_projection('id','businessId','accountId','sessionHash','endpointHash','active');
CREATE FUNCTION jf_revoke_devices() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$ BEGIN
 UPDATE "JfPushDevice" SET active=false,document=jsonb_set(document,'{active}','false') WHERE "sessionHash"=OLD."tokenHash";
 RETURN OLD;
END $$;
CREATE TRIGGER jf_revoke_devices AFTER DELETE ON "JfSession" FOR EACH ROW EXECUTE FUNCTION jf_revoke_devices();
CREATE EXTENSION IF NOT EXISTS cube WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS earthdistance WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE OR REPLACE FUNCTION public.jf_earth(lat double precision,lon double precision) RETURNS public.earth LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,public AS $$ SELECT public.ll_to_earth(lat,lon) $$;
CREATE OR REPLACE FUNCTION public.jf_miles(a double precision,b double precision,c double precision,d double precision) RETURNS double precision LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,public AS $$ SELECT public.earth_distance(public.ll_to_earth(a,b),public.ll_to_earth(c,d))/public.earth()*3958.7613 $$;
CREATE INDEX "JfDirectory_geographic_idx" ON "JfDirectoryBusiness" USING gist (public.jf_earth(latitude,longitude)) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX "JfDirectory_text_idx" ON "JfDirectoryBusiness" USING gin ("searchText" public.gin_trgm_ops);
CREATE FUNCTION jf_refresh_directory(bid text) RETURNS void LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE b jsonb; offers jsonb; categories text[]; locations text[]; pairs text[]; searching text;
BEGIN
 DELETE FROM "JfDirectoryBusiness" WHERE id=bid;
 SELECT document INTO b FROM "JfBusiness" WHERE id=bid AND status='PUBLISHED' AND (document->>'directory')::boolean=true;
 IF b IS NULL OR b->'published'='null'::jsonb THEN RETURN; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',o.id,'name',o.document->>'name','description',o.document->>'description','configurations',c.configs,'modes',c.modes)) INTO offers FROM "JfOffering" o
 CROSS JOIN LATERAL (SELECT jsonb_agg(config) configs,jsonb_agg(config->>'mode') modes FROM jsonb_array_elements(o.document->'configurations') config WHERE b->'modes' ? (config->>'mode')) c
 WHERE o."businessId"=bid AND (o.document->>'active')::boolean AND c.configs IS NOT NULL;
 IF offers IS NULL THEN RETURN; END IF;
 SELECT array_agg(DISTINCT c->>'mode'),array_agg(DISTINCT f),array_agg(DISTINCT (c->>'mode')||':'||f) INTO categories,locations,pairs FROM jsonb_array_elements(offers) o CROSS JOIN LATERAL jsonb_array_elements(o->'configurations') c CROSS JOIN LATERAL jsonb_array_elements_text(c->'fulfillments') f;
 SELECT lower((b->>'category')||' '||string_agg((o->>'name')||' '||(o->>'description'),' ')) INTO searching FROM jsonb_array_elements(offers) o;
 INSERT INTO "JfDirectoryBusiness" (id,slug,name,category,city,latitude,longitude,modes,fulfillments,pairs,"searchText",document)
 VALUES (bid,b->>'slug',b->>'name',b->>'category',b->>'city',CASE WHEN (b->>'addressPublic')::boolean THEN (b->>'latitude')::float8 ELSE (b->'discoveryPoint'->>'latitude')::float8 END,CASE WHEN (b->>'addressPublic')::boolean THEN (b->>'longitude')::float8 ELSE (b->'discoveryPoint'->>'longitude')::float8 END,categories,locations,pairs,searching,jsonb_build_object('offerings',offers));
END $$;
CREATE FUNCTION jf_directory_business_changed() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$ BEGIN PERFORM jf_refresh_directory(NEW.id);RETURN NEW;END $$;
CREATE FUNCTION jf_directory_offering_changed() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$ BEGIN IF TG_OP='DELETE' THEN PERFORM jf_refresh_directory(OLD."businessId");RETURN OLD;END IF;PERFORM jf_refresh_directory(NEW."businessId");RETURN NEW;END $$;
CREATE TRIGGER jf_directory_business AFTER INSERT OR UPDATE ON "JfBusiness" FOR EACH ROW EXECUTE FUNCTION jf_directory_business_changed();
CREATE TRIGGER jf_directory_offering AFTER INSERT OR UPDATE OR DELETE ON "JfOffering" FOR EACH ROW EXECUTE FUNCTION jf_directory_offering_changed();
SELECT jf_refresh_directory(id) FROM "JfBusiness";

CREATE OR REPLACE FUNCTION public.jf_box(lat double precision,lon double precision,miles double precision) RETURNS public.cube LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,public AS $$ SELECT public.earth_box(public.ll_to_earth(lat,lon),miles/3958.7613*public.earth()) $$;
CREATE INDEX "JfDirectory_name_id_idx" ON "JfDirectoryBusiness" (name,id);

CREATE INDEX "JfMedia_kind_id_idx" ON "JfMedia" ((document->>'kind'),id);
