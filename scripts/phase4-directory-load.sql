-- Synthetic load fixture ONLY, after the guarded Phase 4 suite creates a populated schema.
DO $$ BEGIN
 IF current_database()<>'jf_phase4_disposable' OR current_schema() !~ '^test_[a-f0-9]{32}$' OR (SELECT system_identifier::text FROM pg_control_system())<>'7711613122963596620' THEN RAISE EXCEPTION 'Wrong disposable target'; END IF;
END $$;
INSERT INTO "JfAccount" (id,email,document) SELECT 'directory-owner-'||i,'directory'||i||'@example.test',document||jsonb_build_object('id','directory-owner-'||i,'email','directory'||i||'@example.test') FROM (SELECT * FROM "JfAccount" LIMIT 1) t CROSS JOIN generate_series(1,1000) i;
INSERT INTO "JfBusiness" (id,"ownerId",slug,status,document) SELECT 'directory-business-'||i,'directory-owner-'||i,'directory-load-'||i,status,document||jsonb_build_object('id','directory-business-'||i,'ownerId','directory-owner-'||i,'slug','directory-load-'||i,'name','Directory synthetic '||i) FROM (SELECT * FROM "JfBusiness" LIMIT 1) t CROSS JOIN generate_series(1,1000) i;
INSERT INTO "JfResource" (id,"businessId",capacity,document) SELECT 'directory-resource-'||i,'directory-business-'||i,capacity,document||jsonb_build_object('id','directory-resource-'||i,'businessId','directory-business-'||i) FROM (SELECT * FROM "JfResource" LIMIT 1) t CROSS JOIN generate_series(1,1000) i;
INSERT INTO "JfOffering" (id,"businessId","resourceId",document) SELECT 'directory-offering-'||i,'directory-business-'||i,'directory-resource-'||i,document||jsonb_build_object('id','directory-offering-'||i,'businessId','directory-business-'||i,'resourceId','directory-resource-'||i) FROM (SELECT * FROM "JfOffering" LIMIT 1) t CROSS JOIN generate_series(1,1000) i;
ANALYZE "JfBusiness"; ANALYZE "JfOffering";
