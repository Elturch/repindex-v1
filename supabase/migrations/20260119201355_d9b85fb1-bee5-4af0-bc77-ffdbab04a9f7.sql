-- Drop existing conflicting policies
DROP POLICY IF EXISTS "Admins can view api usage logs" ON api_usage_logs;
DROP POLICY IF EXISTS "Authenticated users can view api usage logs" ON api_usage_logs;

-- Create a single admin-only SELECT policy using the has_role function
CREATE POLICY "Admins can view api usage logs"
ON api_usage_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Also fix api_cost_config table if needed
DROP POLICY IF EXISTS "Admins can view api cost config" ON api_cost_config;
DROP POLICY IF EXISTS "Authenticated users can view api cost config" ON api_cost_config;

CREATE POLICY "Admins can view api cost config"
ON api_cost_config
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update api cost config" ON api_cost_config;

CREATE POLICY "Admins can update api cost config"
ON api_cost_config
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));