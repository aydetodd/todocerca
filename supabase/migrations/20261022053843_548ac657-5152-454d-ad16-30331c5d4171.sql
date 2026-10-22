CREATE OR REPLACE FUNCTION public.terminal_validate_records() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_TABLE_NAME='terminal_agent_requests' THEN
 IF NEW.status NOT IN ('pending','approved','rejected','suspended') OR NEW.curp_status NOT IN ('pending','valid','invalid') OR NEW.rfc_status NOT IN ('pending','valid','invalid') OR NEW.biometric_status NOT IN ('pending','valid','invalid') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
 IF NEW.status='approved' AND (NEW.curp_status<>'valid' OR NEW.rfc_status<>'valid' OR NEW.biometric_status<>'valid') THEN RAISE EXCEPTION 'Falta verificación real'; END IF;
 IF length(btrim(NEW.business_name)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Nombre inválido'; END IF;
 ELSIF TG_TABLE_NAME='terminal_permissions' THEN
 IF NEW.status NOT IN ('pending','accepted','revoked') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
 ELSIF TG_TABLE_NAME='terminal_operations' THEN
 IF NEW.amount_mxn<=0 OR NEW.amount_mxn::text IN ('NaN','Infinity','-Infinity') OR NEW.merchant_commission_mxn<0 OR NEW.platform_commission_mxn<0 THEN RAISE EXCEPTION 'Importes inválidos'; END IF;
 IF NEW.terminal_code='reload' AND (NEW.merchant_commission_mxn<>5 OR NEW.platform_commission_mxn<>10 OR NEW.opening_fee_mxn NOT IN (0,150)) THEN RAISE EXCEPTION 'Reparto inválido'; END IF;
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER terminal_requests_validate BEFORE INSERT OR UPDATE ON public.terminal_agent_requests FOR EACH ROW EXECUTE FUNCTION public.terminal_validate_records();
CREATE TRIGGER terminal_permissions_validate BEFORE INSERT OR UPDATE ON public.terminal_permissions FOR EACH ROW EXECUTE FUNCTION public.terminal_validate_records();
CREATE TRIGGER terminal_operations_validate BEFORE INSERT ON public.terminal_operations FOR EACH ROW EXECUTE FUNCTION public.terminal_validate_records();
CREATE FUNCTION public.qard_protect_sub_verification() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF auth.role()='authenticated' THEN
 IF TG_OP='INSERT' THEN
 IF COALESCE(NEW.curp_verificada,false) OR NEW.curp_enc IS NOT NULL OR NEW.curp_hash IS NOT NULL OR NEW.verificada_at IS NOT NULL THEN RAISE EXCEPTION 'Valida CURP mediante activación'; END IF;
 ELSE
 IF NEW.curp_verificada IS DISTINCT FROM OLD.curp_verificada OR NEW.curp_enc IS DISTINCT FROM OLD.curp_enc OR NEW.curp_hash IS DISTINCT FROM OLD.curp_hash OR NEW.verificada_at IS DISTINCT FROM OLD.verificada_at OR NEW.verificacion_costo IS DISTINCT FROM OLD.verificacion_costo OR NEW.titular_user_id IS DISTINCT FROM OLD.titular_user_id OR NEW.wallet_id IS DISTINCT FROM OLD.wallet_id OR NEW.sub_index IS DISTINCT FROM OLD.sub_index OR NEW.qard_number IS DISTINCT FROM OLD.qard_number THEN RAISE EXCEPTION 'Identidad protegida'; END IF;
 END IF;
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER qard_protect_sub_verification BEFORE INSERT OR UPDATE ON public.qard_sub_qr FOR EACH ROW EXECUTE FUNCTION public.qard_protect_sub_verification();
REVOKE ALL ON FUNCTION public.qard_protect_sub_verification() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.terminal_validate_records() FROM PUBLIC,anon,authenticated;