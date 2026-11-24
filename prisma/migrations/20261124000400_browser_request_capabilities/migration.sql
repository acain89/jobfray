-- Browser authorization is independent of customer phone ownership. Existing rows are preserved.
CREATE FUNCTION jf_new_request_token() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.purpose NOT IN ('VERIFY_EMAIL','RESET_PASSWORD','REQUEST_CAPABILITY') THEN RAISE EXCEPTION 'Unsupported new token purpose' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER jf_new_request_token BEFORE INSERT ON "JfToken" FOR EACH ROW EXECUTE FUNCTION jf_new_request_token();
CREATE FUNCTION jf_new_notification_channel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.document->>'channel' IN ('EMAIL','PUSH')) IS NOT TRUE THEN RAISE EXCEPTION 'Unsupported new notification channel' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER jf_new_notification_channel BEFORE INSERT ON "JfOutbox" FOR EACH ROW EXECUTE FUNCTION jf_new_notification_channel();
CREATE FUNCTION jf_snapshot_phone() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE expected_phone text; modern_request boolean;
BEGIN
 SELECT document->'contact'->>'phone',document ? 'browserHash' INTO expected_phone,modern_request FROM "JfRequest" WHERE id=NEW."requestId";
 IF (modern_request OR NEW.document ? 'customerPhone') AND (((NEW.document->>'customerPhone') ~ '^\+[1-9][0-9]{7,14}$') IS NOT TRUE OR NEW.document->>'customerPhone' IS DISTINCT FROM expected_phone) THEN RAISE EXCEPTION 'Snapshot phone must match request' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER jf_snapshot_phone BEFORE INSERT ON "JfCheckoutSnapshot" FOR EACH ROW EXECUTE FUNCTION jf_snapshot_phone();
