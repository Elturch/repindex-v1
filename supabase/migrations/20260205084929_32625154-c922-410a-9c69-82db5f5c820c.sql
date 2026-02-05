-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Public can insert leads" ON public.interested_leads;

-- Recreate with explicit anon and authenticated roles
CREATE POLICY "Public can insert leads" ON public.interested_leads
  AS PERMISSIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);