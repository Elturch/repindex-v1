-- Tabla para almacenar notificaciones de usuarios
CREATE TABLE public.user_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  notification_type text NOT NULL, -- 'welcome', 'newsroom', 'data_refresh', 'inactivity', 'company_alert', 'survey', 'persona_tip'
  title text NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_read boolean DEFAULT false,
  read_at timestamp with time zone,
  is_dismissed boolean DEFAULT false,
  dismissed_at timestamp with time zone,
  priority text DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  persona_id text, -- perfil de usuario objetivo
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Tabla para preferencias de notificación por usuario
CREATE TABLE public.user_notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  enable_newsroom_alerts boolean DEFAULT true,
  enable_data_refresh_alerts boolean DEFAULT true,
  enable_inactivity_reminders boolean DEFAULT true,
  enable_company_alerts boolean DEFAULT true,
  enable_surveys boolean DEFAULT true,
  enable_persona_tips boolean DEFAULT true,
  enable_email_notifications boolean DEFAULT true,
  email_frequency text DEFAULT 'weekly', -- 'immediate', 'daily', 'weekly', 'never'
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Tabla para campañas de marketing
CREATE TABLE public.marketing_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  target_personas text[] DEFAULT '{}', -- IDs de personas objetivo
  notification_type text NOT NULL,
  title_template text NOT NULL,
  content_template text NOT NULL,
  priority text DEFAULT 'normal',
  is_active boolean DEFAULT true,
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  total_sent integer DEFAULT 0,
  total_read integer DEFAULT 0,
  total_clicked integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Tabla para tracking de interacciones con notificaciones
CREATE TABLE public.notification_analytics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id uuid REFERENCES public.user_notifications(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  event_type text NOT NULL, -- 'delivered', 'read', 'clicked', 'dismissed', 'converted'
  event_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_user_notifications_user ON public.user_notifications(user_id);
CREATE INDEX idx_user_notifications_unread ON public.user_notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_user_notifications_type ON public.user_notifications(notification_type);
CREATE INDEX idx_notification_analytics_campaign ON public.notification_analytics(campaign_id);
CREATE INDEX idx_marketing_campaigns_active ON public.marketing_campaigns(is_active) WHERE is_active = true;

-- Habilitar RLS
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_analytics ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para user_notifications
CREATE POLICY "Users can view own notifications" ON public.user_notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.user_notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all notifications" ON public.user_notifications
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Políticas RLS para notification_preferences
CREATE POLICY "Users can view own preferences" ON public.user_notification_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own preferences" ON public.user_notification_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own preferences" ON public.user_notification_preferences
  FOR UPDATE USING (user_id = auth.uid());

-- Políticas para marketing_campaigns (solo admins)
CREATE POLICY "Admins can manage campaigns" ON public.marketing_campaigns
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Políticas para notification_analytics (solo admins pueden ver todo)
CREATE POLICY "Admins can view all analytics" ON public.notification_analytics
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert analytics" ON public.notification_analytics
  FOR INSERT WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_campaigns_updated_at
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();