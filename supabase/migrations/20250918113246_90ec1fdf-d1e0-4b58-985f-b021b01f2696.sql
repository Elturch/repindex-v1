-- Crear tabla pari_runs con acceso público
CREATE TABLE public.pari_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT NOT NULL,
  model_name TEXT,
  target_name TEXT NOT NULL,
  target_type TEXT,
  ticker TEXT,
  period_from DATE,
  period_to DATE,
  tz TEXT DEFAULT 'UTC',
  
  -- Puntuaciones principales
  pari_score INTEGER,
  
  -- Métricas LNS
  lns_score INTEGER,
  lns_peso INTEGER,
  lns_categoria TEXT,
  
  -- Métricas ES
  es_score INTEGER,
  es_peso INTEGER,
  es_categoria TEXT,
  
  -- Métricas SAM
  sam_score INTEGER,
  sam_peso INTEGER,
  sam_categoria TEXT,
  
  -- Métricas RM
  rm_score INTEGER,
  rm_peso INTEGER,
  rm_categoria TEXT,
  
  -- Métricas CLR
  clr_score INTEGER,
  clr_peso INTEGER,
  clr_categoria TEXT,
  
  -- Métricas GIP
  gip_score INTEGER,
  gip_peso INTEGER,
  gip_categoria TEXT,
  
  -- Métricas KGI
  kgi_score INTEGER,
  kgi_peso INTEGER,
  kgi_categoria TEXT,
  
  -- Métricas MPI
  mpi_score INTEGER,
  mpi_peso INTEGER,
  mpi_categoria TEXT,
  
  -- Análisis de contenido
  resumen TEXT,
  puntos_clave JSONB,
  palabras INTEGER,
  num_fechas INTEGER,
  num_citas INTEGER,
  temporal_alignment DECIMAL(5,4),
  citation_density DECIMAL(5,4),
  flags JSONB,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar Row Level Security
ALTER TABLE public.pari_runs ENABLE ROW LEVEL SECURITY;

-- Crear políticas públicas para acceso completo
CREATE POLICY "Acceso público de lectura" 
ON public.pari_runs 
FOR SELECT 
USING (true);

CREATE POLICY "Acceso público de inserción" 
ON public.pari_runs 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Acceso público de actualización" 
ON public.pari_runs 
FOR UPDATE 
USING (true);

CREATE POLICY "Acceso público de eliminación" 
ON public.pari_runs 
FOR DELETE 
USING (true);

-- Crear índices para optimizar consultas
CREATE INDEX idx_pari_runs_run_id ON public.pari_runs(run_id);
CREATE INDEX idx_pari_runs_target_name ON public.pari_runs(target_name);
CREATE INDEX idx_pari_runs_period ON public.pari_runs(period_from, period_to);
CREATE INDEX idx_pari_runs_created_at ON public.pari_runs(created_at DESC);
CREATE INDEX idx_pari_runs_target_period ON public.pari_runs(target_name, period_from, period_to);

-- Crear función para actualizar timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Crear trigger para actualización automática de timestamps
CREATE TRIGGER update_pari_runs_updated_at
  BEFORE UPDATE ON public.pari_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();