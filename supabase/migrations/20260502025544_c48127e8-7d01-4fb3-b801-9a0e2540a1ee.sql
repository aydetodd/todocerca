-- 1) Add recovery_email column to profiles for password recovery via email
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS recovery_email TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_recovery_email
ON public.profiles (LOWER(recovery_email))
WHERE recovery_email IS NOT NULL;

-- 2) Hard-delete user C80 (Efren Sanchez) so the phone +526449989517 can re-register
DO $$
DECLARE
  v_user_id uuid := '3620c21b-6f3b-4362-8344-c5a2f64a236a';
BEGIN
  -- Clean dependent rows defensively (ignore errors for tables that may not exist in this env)
  BEGIN DELETE FROM public.active_sessions WHERE user_id = v_user_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.password_recovery_codes WHERE phone = '+526449989517'; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.user_contacts WHERE user_id = v_user_id OR contact_user_id = v_user_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.favoritos WHERE user_id = v_user_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.messages WHERE sender_id = v_user_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.chats WHERE sender_id = v_user_id OR receiver_id = v_user_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.clientes WHERE user_id = v_user_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.profiles WHERE user_id = v_user_id; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- Finally remove the auth user
  DELETE FROM auth.users WHERE id = v_user_id;
END $$;