-- 1. Enable RLS on rix_runs_ampliada (currently disabled - critical security issue)
ALTER TABLE public.rix_runs_ampliada ENABLE ROW LEVEL SECURITY;

-- Create read-only public access policy (same pattern as rix_runs)
CREATE POLICY "Acceso público de lectura rix_runs_ampliada" 
ON public.rix_runs_ampliada 
FOR SELECT 
USING (true);

-- Restrict modifications to service role only
CREATE POLICY "Service role can manage rix_runs_ampliada" 
ON public.rix_runs_ampliada 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 2. Fix search_path in database functions to prevent schema injection
CREATE OR REPLACE FUNCTION public.normalize_batch_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.batch_execution_date := date_trunc('day', NEW.batch_execution_date);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;