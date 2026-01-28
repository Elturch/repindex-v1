-- Drop the restrictive policy
DROP POLICY IF EXISTS "Authenticated users can insert triggers" ON public.cron_triggers;

-- Create it as PERMISSIVE (default)
CREATE POLICY "Authenticated users can insert triggers" 
ON public.cron_triggers 
FOR INSERT 
TO authenticated
WITH CHECK (true);