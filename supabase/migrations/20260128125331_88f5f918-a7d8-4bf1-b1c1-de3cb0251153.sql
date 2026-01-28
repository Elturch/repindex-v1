-- Drop the restrictive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert triggers" ON public.cron_triggers;

-- Create a more permissive policy for authenticated users
-- The admin panel itself controls access, so we allow any authenticated user
CREATE POLICY "Authenticated users can insert triggers" 
  ON public.cron_triggers 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- Also update the SELECT policy to be less restrictive
DROP POLICY IF EXISTS "Authenticated users can view triggers" ON public.cron_triggers;

CREATE POLICY "Authenticated users can view triggers" 
  ON public.cron_triggers 
  FOR SELECT 
  TO authenticated 
  USING (true);