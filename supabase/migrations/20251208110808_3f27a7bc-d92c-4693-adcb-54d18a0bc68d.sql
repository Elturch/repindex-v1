-- Tabla para almacenar los estereotipos/personas generados
CREATE TABLE public.user_personas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '👤',
  description text NOT NULL,
  characteristics text[] NOT NULL DEFAULT '{}',
  avg_conversations numeric DEFAULT 0,
  avg_enrichments numeric DEFAULT 0,
  avg_documents numeric DEFAULT 0,
  avg_session_frequency numeric DEFAULT 0,
  user_count integer DEFAULT 0,
  analysis_batch_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Tabla para almacenar snapshots de actividad de usuario
CREATE TABLE public.user_activity_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  user_name text,
  total_conversations integer DEFAULT 0,
  total_messages integer DEFAULT 0,
  total_enrichments integer DEFAULT 0,
  total_documents integer DEFAULT 0,
  favorite_roles text[] DEFAULT '{}',
  mentioned_companies text[] DEFAULT '{}',
  question_patterns text[] DEFAULT '{}',
  first_activity timestamp with time zone,
  last_activity timestamp with time zone,
  activity_days integer DEFAULT 0,
  persona_id uuid REFERENCES public.user_personas(id) ON DELETE SET NULL,
  analysis_batch_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Tabla para almacenar el historial de análisis (batches)
CREATE TABLE public.profile_analysis_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  analyzed_at timestamp with time zone NOT NULL DEFAULT now(),
  total_users_analyzed integer DEFAULT 0,
  total_personas_generated integer DEFAULT 0,
  ai_provider text DEFAULT 'openai',
  analysis_duration_ms integer,
  notes text
);

-- Índices para optimizar consultas
CREATE INDEX idx_user_personas_batch ON public.user_personas(analysis_batch_id);
CREATE INDEX idx_user_activity_snapshots_user ON public.user_activity_snapshots(user_id);
CREATE INDEX idx_user_activity_snapshots_batch ON public.user_activity_snapshots(analysis_batch_id);
CREATE INDEX idx_user_activity_snapshots_persona ON public.user_activity_snapshots(persona_id);
CREATE INDEX idx_profile_analysis_batches_date ON public.profile_analysis_batches(analyzed_at DESC);

-- Habilitar RLS
ALTER TABLE public.user_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_analysis_batches ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - Solo admins pueden ver/modificar
CREATE POLICY "Admins can view personas" ON public.user_personas
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert personas" ON public.user_personas
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view activity snapshots" ON public.user_activity_snapshots
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert activity snapshots" ON public.user_activity_snapshots
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view analysis batches" ON public.profile_analysis_batches
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert analysis batches" ON public.profile_analysis_batches
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

-- Vista para comparar evolución de perfiles entre análisis
CREATE OR REPLACE VIEW public.v_persona_evolution AS
SELECT 
  p.name as persona_name,
  p.emoji,
  p.user_count,
  b.analyzed_at,
  b.id as batch_id,
  LAG(p.user_count) OVER (PARTITION BY p.name ORDER BY b.analyzed_at) as previous_count,
  p.user_count - COALESCE(LAG(p.user_count) OVER (PARTITION BY p.name ORDER BY b.analyzed_at), p.user_count) as count_change
FROM public.user_personas p
JOIN public.profile_analysis_batches b ON p.analysis_batch_id = b.id
ORDER BY b.analyzed_at DESC, p.user_count DESC;