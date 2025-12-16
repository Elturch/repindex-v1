-- Add policy to allow reading anonymous activity logs (for admin analytics in preview)
-- This is safe because anonymous logs don't contain PII, just session IDs and page paths

CREATE POLICY "Allow reading anonymous activity logs"
ON public.user_activity_logs
FOR SELECT
USING (user_id IS NULL);