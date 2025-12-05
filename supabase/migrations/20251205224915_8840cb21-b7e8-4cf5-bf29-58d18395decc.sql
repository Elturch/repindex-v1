-- Tabla para analytics de uso de roles de enriquecimiento
CREATE TABLE public.role_enrichment_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  role_id text NOT NULL,
  role_name text NOT NULL,
  original_question text NOT NULL,
  enrichment_timestamp timestamp with time zone NOT NULL DEFAULT now(),
  response_time_ms integer,
  tokens_used integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Tabla para preferencias de rol por usuario
CREATE TABLE public.user_role_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  default_role_id text,
  favorite_roles text[] DEFAULT ARRAY[]::text[],
  auto_enrich boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Habilitar RLS
ALTER TABLE public.role_enrichment_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_role_preferences ENABLE ROW LEVEL SECURITY;

-- Políticas para role_enrichment_analytics
CREATE POLICY "Users can view own analytics"
ON public.role_enrichment_analytics
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own analytics"
ON public.role_enrichment_analytics
FOR INSERT
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Admins can view all analytics"
ON public.role_enrichment_analytics
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Políticas para user_role_preferences
CREATE POLICY "Users can view own preferences"
ON public.user_role_preferences
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own preferences"
ON public.user_role_preferences
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own preferences"
ON public.user_role_preferences
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Trigger para actualizar updated_at
CREATE TRIGGER update_user_role_preferences_updated_at
BEFORE UPDATE ON public.user_role_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para optimización
CREATE INDEX idx_role_enrichment_analytics_user_id ON public.role_enrichment_analytics(user_id);
CREATE INDEX idx_role_enrichment_analytics_role_id ON public.role_enrichment_analytics(role_id);
CREATE INDEX idx_role_enrichment_analytics_timestamp ON public.role_enrichment_analytics(enrichment_timestamp DESC);