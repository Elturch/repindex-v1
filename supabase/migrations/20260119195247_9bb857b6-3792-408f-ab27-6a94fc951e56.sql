-- Add policy to allow reading api_usage_logs and api_cost_config for authenticated users
-- This is admin dashboard data, not sensitive user data

-- Policy for api_usage_logs - allow authenticated users to read
CREATE POLICY "Authenticated users can view api usage logs"
ON public.api_usage_logs
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Also ensure api_cost_config is readable
CREATE POLICY "Authenticated users can view api cost config"
ON public.api_cost_config
FOR SELECT
USING (auth.uid() IS NOT NULL);