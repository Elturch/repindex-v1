-- Tabla para Lead Scoring y Fatigue Management del sistema Inbound Marketing
CREATE TABLE public.user_engagement_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  
  -- Lead Scoring Components (0-100 each)
  recency_score INTEGER DEFAULT 0,
  frequency_score INTEGER DEFAULT 0,
  depth_score INTEGER DEFAULT 0,
  response_score INTEGER DEFAULT 0,
  engagement_score INTEGER DEFAULT 0,
  
  -- Lifecycle Stage
  lifecycle_stage TEXT DEFAULT 'new' CHECK (lifecycle_stage IN ('new', 'active', 'engaged', 'power_user', 'at_risk', 'churned')),
  
  -- Fatigue Tracking
  notifications_sent_24h INTEGER DEFAULT 0,
  notifications_sent_7d INTEGER DEFAULT 0,
  notifications_sent_30d INTEGER DEFAULT 0,
  last_notification_at TIMESTAMPTZ,
  last_notification_type TEXT,
  ignored_count_30d INTEGER DEFAULT 0,
  
  -- Notification Weights per Type (calculated daily)
  weight_newsroom NUMERIC DEFAULT 0,
  weight_persona_tip NUMERIC DEFAULT 0,
  weight_data_refresh NUMERIC DEFAULT 0,
  weight_inactivity NUMERIC DEFAULT 0,
  weight_company_alert NUMERIC DEFAULT 0,
  weight_feature_discovery NUMERIC DEFAULT 0,
  weight_engagement NUMERIC DEFAULT 0,
  
  -- Recent notification types (last 7 days) to avoid repetition
  recent_notification_types TEXT[] DEFAULT '{}',
  
  -- Best Time to Contact (calculated from activity patterns)
  preferred_hour INTEGER,
  preferred_days TEXT[] DEFAULT '{}',
  
  -- Persona Assignment
  current_persona_id UUID REFERENCES public.user_personas(id),
  persona_confidence NUMERIC DEFAULT 0,
  
  -- Timestamps
  calculated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_engagement_scores ENABLE ROW LEVEL SECURITY;

-- Admins can manage all engagement scores
CREATE POLICY "Admins can manage engagement scores"
ON public.user_engagement_scores
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Users can view their own engagement score
CREATE POLICY "Users can view own engagement score"
ON public.user_engagement_scores
FOR SELECT
USING (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX idx_engagement_scores_user_id ON public.user_engagement_scores(user_id);
CREATE INDEX idx_engagement_scores_lifecycle ON public.user_engagement_scores(lifecycle_stage);
CREATE INDEX idx_engagement_scores_calculated ON public.user_engagement_scores(calculated_at);

-- Function to reset daily fatigue counters (called by CRON)
CREATE OR REPLACE FUNCTION public.reset_daily_fatigue_counters()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reset 24h counters
  UPDATE public.user_engagement_scores
  SET notifications_sent_24h = 0
  WHERE notifications_sent_24h > 0;
  
  -- Update 7d counter (subtract what was sent 7 days ago - approximation)
  UPDATE public.user_engagement_scores
  SET notifications_sent_7d = GREATEST(0, notifications_sent_7d - COALESCE(notifications_sent_24h, 0))
  WHERE notifications_sent_7d > 0;
  
  -- Update 30d counter similarly
  UPDATE public.user_engagement_scores
  SET notifications_sent_30d = GREATEST(0, notifications_sent_30d - COALESCE(notifications_sent_24h, 0))
  WHERE notifications_sent_30d > 0;
  
  -- Clean recent_notification_types older than 7 days (simplified: just keep last 5)
  UPDATE public.user_engagement_scores
  SET recent_notification_types = COALESCE(recent_notification_types[array_length(recent_notification_types, 1) - 4:], '{}')
  WHERE array_length(recent_notification_types, 1) > 5;
END;
$$;