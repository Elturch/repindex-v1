-- 1. Añadir campo website a repindex_root_issuers (si no existe ya)
ALTER TABLE public.repindex_root_issuers 
ADD COLUMN IF NOT EXISTS website TEXT;

-- 2. Crear tabla corporate_snapshots
CREATE TABLE IF NOT EXISTS public.corporate_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  snapshot_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot_date_only DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Datos de liderazgo
  ceo_name TEXT,
  president_name TEXT,
  chairman_name TEXT,
  other_executives JSONB DEFAULT '[]'::jsonb,
  
  -- Datos corporativos
  headquarters_city TEXT,
  headquarters_country TEXT,
  employees_approx INTEGER,
  founded_year INTEGER,
  
  -- Misión y visión
  mission_statement TEXT,
  vision_statement TEXT,
  company_description TEXT,
  
  -- Datos financieros básicos
  last_reported_revenue TEXT,
  fiscal_year TEXT,
  
  -- Metadatos del scrape
  raw_markdown TEXT,
  source_urls TEXT[],
  pages_scraped INTEGER DEFAULT 0,
  scrape_status TEXT DEFAULT 'success',
  error_message TEXT,
  extraction_confidence JSONB DEFAULT '{}'::jsonb,
  
  -- Control
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Evitar duplicados del mismo día
  CONSTRAINT unique_ticker_snapshot_day UNIQUE (ticker, snapshot_date_only)
);

-- 3. Crear índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_corporate_snapshots_ticker ON public.corporate_snapshots(ticker);
CREATE INDEX IF NOT EXISTS idx_corporate_snapshots_date ON public.corporate_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_corporate_snapshots_status ON public.corporate_snapshots(scrape_status);

-- 4. Habilitar RLS
ALTER TABLE public.corporate_snapshots ENABLE ROW LEVEL SECURITY;

-- 5. Política para lectura pública
CREATE POLICY "Corporate snapshots are publicly readable"
ON public.corporate_snapshots
FOR SELECT
USING (true);

-- 6. Políticas para inserción/actualización desde service role
CREATE POLICY "Service role can insert corporate snapshots"
ON public.corporate_snapshots
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update corporate snapshots"
ON public.corporate_snapshots
FOR UPDATE
USING (true);

-- 7. Crear tabla de progreso para el orquestador de scraping
CREATE TABLE IF NOT EXISTS public.corporate_scrape_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sweep_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  issuer_name TEXT,
  website TEXT,
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT unique_corp_sweep_ticker UNIQUE (sweep_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_corp_scrape_progress_sweep ON public.corporate_scrape_progress(sweep_id);
CREATE INDEX IF NOT EXISTS idx_corp_scrape_progress_status ON public.corporate_scrape_progress(status);

-- 8. Trigger para updated_at
CREATE TRIGGER update_corp_scrape_progress_updated_at
  BEFORE UPDATE ON public.corporate_scrape_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 9. RLS para progress table
ALTER TABLE public.corporate_scrape_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Corporate scrape progress is publicly readable"
ON public.corporate_scrape_progress
FOR SELECT
USING (true);

CREATE POLICY "Service role can modify scrape progress"
ON public.corporate_scrape_progress
FOR ALL
USING (true);