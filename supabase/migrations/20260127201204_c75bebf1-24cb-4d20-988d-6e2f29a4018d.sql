-- ============================================
-- COMPETITOR RELATIONSHIPS TABLE
-- Stores verified competitor relationships for accurate bulletin generation
-- ============================================

-- Create competitor relationships table
CREATE TABLE IF NOT EXISTS public.competitor_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_ticker TEXT NOT NULL,
  competitor_ticker TEXT NOT NULL,
  relationship_type TEXT DEFAULT 'direct' CHECK (relationship_type IN ('direct', 'indirect', 'aspirational')),
  confidence_score DECIMAL DEFAULT 1.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  validated_by TEXT DEFAULT 'manual' CHECK (validated_by IN ('manual', 'ai_suggested', 'system')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(source_ticker, competitor_ticker)
);

-- Add subsector column to repindex_root_issuers for finer competitor matching
ALTER TABLE public.repindex_root_issuers 
ADD COLUMN IF NOT EXISTS subsector TEXT;

-- Enable RLS
ALTER TABLE public.competitor_relationships ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Public read, admin write
CREATE POLICY "Competitor relationships are publicly readable"
ON public.competitor_relationships FOR SELECT
USING (true);

CREATE POLICY "Admins can manage competitor relationships"
ON public.competitor_relationships FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_competitor_relationships_source 
ON public.competitor_relationships(source_ticker);

CREATE INDEX IF NOT EXISTS idx_competitor_relationships_competitor 
ON public.competitor_relationships(competitor_ticker);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_competitor_relationships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_competitor_relationships_timestamp
BEFORE UPDATE ON public.competitor_relationships
FOR EACH ROW
EXECUTE FUNCTION public.update_competitor_relationships_updated_at();

-- ============================================
-- SEED DATA: Initial verified competitor relationships
-- ============================================

-- Telefónica competitors (Telecom sector)
INSERT INTO public.competitor_relationships (source_ticker, competitor_ticker, relationship_type, confidence_score, validated_by, notes) VALUES
('TEF', 'CLNX', 'indirect', 0.8, 'manual', 'Infraestructura telecom, complementario'),
('TEF', 'MAS', 'direct', 0.7, 'manual', 'Operador MásMóvil - competidor directo en España')
ON CONFLICT (source_ticker, competitor_ticker) DO NOTHING;

-- Cellnex competitors (Telecom infrastructure)
INSERT INTO public.competitor_relationships (source_ticker, competitor_ticker, relationship_type, confidence_score, validated_by, notes) VALUES
('CLNX', 'TEF', 'indirect', 0.7, 'manual', 'Cliente y competidor parcial en infraestructura')
ON CONFLICT (source_ticker, competitor_ticker) DO NOTHING;

-- Banking sector relationships
INSERT INTO public.competitor_relationships (source_ticker, competitor_ticker, relationship_type, confidence_score, validated_by, notes) VALUES
('SAN', 'BBVA', 'direct', 1.0, 'manual', 'Principales bancos españoles'),
('SAN', 'CABK', 'direct', 0.95, 'manual', 'Competidor bancario nacional'),
('SAN', 'SAB', 'direct', 0.85, 'manual', 'Competidor bancario'),
('BBVA', 'SAN', 'direct', 1.0, 'manual', 'Principales bancos españoles'),
('BBVA', 'CABK', 'direct', 0.95, 'manual', 'Competidor bancario nacional'),
('CABK', 'SAN', 'direct', 0.95, 'manual', 'Competidor bancario'),
('CABK', 'BBVA', 'direct', 0.95, 'manual', 'Competidor bancario')
ON CONFLICT (source_ticker, competitor_ticker) DO NOTHING;

-- Energy sector relationships
INSERT INTO public.competitor_relationships (source_ticker, competitor_ticker, relationship_type, confidence_score, validated_by, notes) VALUES
('IBE', 'ENG', 'direct', 1.0, 'manual', 'Utilities energéticas españolas'),
('IBE', 'ELE', 'direct', 1.0, 'manual', 'Competidores energéticos'),
('IBE', 'REE', 'indirect', 0.7, 'manual', 'Infraestructura eléctrica'),
('IBE', 'NTGY', 'direct', 0.95, 'manual', 'Competidor energético'),
('ENG', 'IBE', 'direct', 1.0, 'manual', 'Competidor energético'),
('ENG', 'NTGY', 'direct', 0.95, 'manual', 'Competidor energético'),
('ELE', 'IBE', 'direct', 1.0, 'manual', 'Competidor energético'),
('ELE', 'ENG', 'direct', 0.95, 'manual', 'Competidor energético'),
('REP', 'NTGY', 'direct', 0.9, 'manual', 'Oil & Gas / energía'),
('NTGY', 'IBE', 'direct', 0.95, 'manual', 'Competidor energético'),
('NTGY', 'ENG', 'direct', 0.95, 'manual', 'Competidor energético')
ON CONFLICT (source_ticker, competitor_ticker) DO NOTHING;

-- Construction sector relationships
INSERT INTO public.competitor_relationships (source_ticker, competitor_ticker, relationship_type, confidence_score, validated_by, notes) VALUES
('ACS', 'FER', 'direct', 1.0, 'manual', 'Grandes constructoras españolas'),
('ACS', 'FCC', 'direct', 0.95, 'manual', 'Competidor construcción e infraestructuras'),
('ACS', 'SCYR', 'direct', 0.85, 'manual', 'Competidor construcción'),
('FER', 'ACS', 'direct', 1.0, 'manual', 'Competidor construcción'),
('FER', 'FCC', 'direct', 0.9, 'manual', 'Competidor construcción'),
('FCC', 'ACS', 'direct', 0.95, 'manual', 'Competidor construcción'),
('FCC', 'FER', 'direct', 0.9, 'manual', 'Competidor construcción')
ON CONFLICT (source_ticker, competitor_ticker) DO NOTHING;

-- Retail/Fashion sector
INSERT INTO public.competitor_relationships (source_ticker, competitor_ticker, relationship_type, confidence_score, validated_by, notes) VALUES
('ITX', 'TENDAM-PRIV', 'direct', 0.8, 'manual', 'Retail moda'),
('TENDAM-PRIV', 'ITX', 'direct', 0.95, 'manual', 'Retail moda - Inditex líder')
ON CONFLICT (source_ticker, competitor_ticker) DO NOTHING;

-- Insurance sector
INSERT INTO public.competitor_relationships (source_ticker, competitor_ticker, relationship_type, confidence_score, validated_by, notes) VALUES
('MAP', 'LNEG-PRIV', 'direct', 0.85, 'manual', 'Seguros'),
('MAP', 'MUT-PRIV', 'indirect', 0.7, 'manual', 'Mutuas/seguros')
ON CONFLICT (source_ticker, competitor_ticker) DO NOTHING;

-- ============================================
-- UPDATE SUBSECTORS for key companies
-- ============================================
UPDATE public.repindex_root_issuers SET subsector = 'Operadores Telecom' WHERE ticker IN ('TEF', 'MAS');
UPDATE public.repindex_root_issuers SET subsector = 'Infraestructura Telecom' WHERE ticker = 'CLNX';
UPDATE public.repindex_root_issuers SET subsector = 'Tech Viajes' WHERE ticker = 'AMS';
UPDATE public.repindex_root_issuers SET subsector = 'Comunicación y PR' WHERE ticker = 'LLYC';
UPDATE public.repindex_root_issuers SET subsector = 'Consultoría IT/Defensa' WHERE ticker = 'IDR';
UPDATE public.repindex_root_issuers SET subsector = 'Big Tech' WHERE ticker IN ('GOOGLE-PRIV', 'AMAZON-PRIV', 'META-PRIV', 'APPLE-PRIV', 'MSFT-PRIV');
UPDATE public.repindex_root_issuers SET subsector = 'Banca Comercial' WHERE ticker IN ('SAN', 'BBVA', 'CABK', 'SAB', 'BKT', 'UNI');
UPDATE public.repindex_root_issuers SET subsector = 'Utilities Eléctricas' WHERE ticker IN ('IBE', 'ENG', 'ELE', 'NTGY');
UPDATE public.repindex_root_issuers SET subsector = 'Oil & Gas' WHERE ticker IN ('REP');
UPDATE public.repindex_root_issuers SET subsector = 'Infraestructura Eléctrica' WHERE ticker = 'REE';
UPDATE public.repindex_root_issuers SET subsector = 'Construcción e Infraestructuras' WHERE ticker IN ('ACS', 'FER', 'FCC', 'SCYR');
UPDATE public.repindex_root_issuers SET subsector = 'Retail Moda' WHERE ticker = 'ITX';
UPDATE public.repindex_root_issuers SET subsector = 'Seguros' WHERE ticker = 'MAP';