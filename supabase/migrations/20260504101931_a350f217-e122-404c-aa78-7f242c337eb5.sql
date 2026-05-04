DROP FUNCTION IF EXISTS public.list_admin_users();

CREATE OR REPLACE FUNCTION public.list_admin_users()
 RETURNS TABLE(id uuid, email text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, email_confirmed_at timestamp with time zone, full_name text, company_id uuid, role text, is_active boolean, is_individual boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin(caller) THEN
    RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.id,
           u.email::text,
           u.created_at,
           u.last_sign_in_at,
           u.email_confirmed_at,
           p.full_name,
           p.company_id,
           COALESCE((SELECT r.role::text FROM public.user_roles r WHERE r.user_id = u.id ORDER BY r.created_at DESC LIMIT 1), 'user') AS role,
           COALESCE(p.is_active, false) AS is_active,
           COALESCE(p.is_individual, p.company_id IS NULL) AS is_individual
    FROM auth.users u
    LEFT JOIN public.user_profiles p ON p.id = u.id
    ORDER BY u.created_at DESC;
END; $function$;