UPDATE auth.users
SET email_confirmed_at = now()
WHERE email_confirmed_at IS NULL
  AND id IN (
    SELECT id FROM public.user_profiles WHERE is_active = true
  );