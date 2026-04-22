
-- 1. CHAT FEEDBACK: remove anonymous-readable policy, restrict to authenticated owners
DROP POLICY IF EXISTS "Users can view own feedback" ON public.chat_response_feedback;

CREATE POLICY "Authenticated users can view own feedback"
ON public.chat_response_feedback
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Tighten INSERT too: must be authenticated and writing as themselves (or anonymous null is no longer allowed)
DROP POLICY IF EXISTS "Users can insert own feedback" ON public.chat_response_feedback;

CREATE POLICY "Authenticated users can insert own feedback"
ON public.chat_response_feedback
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- 2. CORPORATE SCRAPE PROGRESS: drop public-read, restrict to authenticated
DROP POLICY IF EXISTS "Corporate scrape progress is publicly readable" ON public.corporate_scrape_progress;

CREATE POLICY "Authenticated users can view scrape progress"
ON public.corporate_scrape_progress
FOR SELECT
TO authenticated
USING (true);

-- 3. DATA QUALITY REPORTS: drop public-read, restrict to authenticated
DROP POLICY IF EXISTS "Data quality reports are publicly readable" ON public.data_quality_reports;

CREATE POLICY "Authenticated users can view data quality reports"
ON public.data_quality_reports
FOR SELECT
TO authenticated
USING (true);

-- 4. SWEEP PROGRESS: drop public-read, restrict to authenticated
DROP POLICY IF EXISTS "Lectura pública sweep_progress" ON public.sweep_progress;

CREATE POLICY "Authenticated users can view sweep progress"
ON public.sweep_progress
FOR SELECT
TO authenticated
USING (true);
