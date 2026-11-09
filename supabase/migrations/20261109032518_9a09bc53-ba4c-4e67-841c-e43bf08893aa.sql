DO $$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('qard_private.qard_refund_context(uuid)'::regprocedure);
 body:=replace(body,'''remaining'',remain,','''remaining'',remain,''frozen'',EXISTS(SELECT 1 FROM public.qard_refund_requests WHERE payer_movement_id=(p->>''id'')::uuid AND status=''disputed''),');
 EXECUTE body;
 body:=pg_get_functiondef('qard_private.qard_refund_list(text,uuid,integer)'::regprocedure);
 body:=replace(body,'SELECT r.*,auth.uid()=r.merchant_user_id AS can_authorize','SELECT r.*,least(public.qard_refund_remaining(r.payer_movement_id),public.qard_refund_remaining(r.merchant_movement_id)) AS remaining,auth.uid()=r.merchant_user_id AS can_authorize');
 EXECUTE body;
 body:=pg_get_functiondef('qard_private.qard_refund_action(uuid,text,text,boolean,numeric)'::regprocedure);
 body:=replace(body,E'ELSIF _action=''resolve'' THEN\n',E'ELSIF _action=''resolve'' THEN\n');
 body:=replace(body,E'  PERFORM id FROM public.qard_wallets WHERE titular_user_id=r.merchant_user_id FOR UPDATE;\n  IF _approve THEN',E'  PERFORM id FROM public.qard_wallets WHERE id IN ((public.qard_refund_original(r.payer_movement_id)->>''wallet_id'')::uuid,(public.qard_refund_original(r.merchant_movement_id)->>''wallet_id'')::uuid) ORDER BY id FOR UPDATE;\n  IF _approve THEN');
 EXECUTE body;
END $$;