-- Create user_activity_logs table for real-time activity tracking
CREATE TABLE public.user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  
  -- Event details
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  
  -- Page context
  page_path TEXT,
  page_title TEXT,
  referrer TEXT,
  
  -- Technical context
  device_type TEXT,
  browser TEXT,
  screen_width INTEGER,
  
  -- Timing
  session_start_at TIMESTAMPTZ,
  time_on_page_seconds INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for fast queries
CREATE INDEX idx_user_activity_user_id ON public.user_activity_logs(user_id);
CREATE INDEX idx_user_activity_event_type ON public.user_activity_logs(event_type);
CREATE INDEX idx_user_activity_created_at ON public.user_activity_logs(created_at DESC);
CREATE INDEX idx_user_activity_session_id ON public.user_activity_logs(session_id);
CREATE INDEX idx_user_activity_page_path ON public.user_activity_logs(page_path);

-- Enable RLS
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can insert own activity"
ON public.user_activity_logs
FOR INSERT
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can view own activity"
ON public.user_activity_logs
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all activity"
ON public.user_activity_logs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage all activity"
ON public.user_activity_logs
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Add comment
COMMENT ON TABLE public.user_activity_logs IS 'Tracks all user activity for analytics dashboard';