-- Create repindex_root_issuers table
CREATE TABLE public.repindex_root_issuers (
  issuer_id        text PRIMARY KEY,                  -- slug: 'acs', 'iberdrola', etc.
  issuer_name      text NOT NULL,                     -- nombre IBEX (raíz)
  ticker           text NOT NULL,                     -- p. ej. 'ACS.MC'
  include_terms    jsonb NOT NULL,                    -- ["ACS","Grupo ACS",...]
  exclude_terms    jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_query     text NOT NULL,                     -- ( "ACS" OR "Grupo ACS" ) AND NOT (...)
  ibex_status      text NOT NULL CHECK (ibex_status IN ('active_now','past_member','candidate')),
  languages        text[] NOT NULL DEFAULT array['es','en'],
  geography        text[] NOT NULL DEFAULT array['ES'],
  notes            text,
  created_at       timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX ON public.repindex_root_issuers (ticker);
CREATE INDEX ON public.repindex_root_issuers (ibex_status);

-- Enable Row Level Security
ALTER TABLE public.repindex_root_issuers ENABLE ROW LEVEL SECURITY;

-- Create public access policies
CREATE POLICY "Acceso público de lectura" 
ON public.repindex_root_issuers 
FOR SELECT 
USING (true);

CREATE POLICY "Acceso público de inserción" 
ON public.repindex_root_issuers 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Acceso público de actualización" 
ON public.repindex_root_issuers 
FOR UPDATE 
USING (true);

CREATE POLICY "Acceso público de eliminación" 
ON public.repindex_root_issuers 
FOR DELETE 
USING (true);

-- Insert data from JSON
INSERT INTO public.repindex_root_issuers (
  issuer_id, issuer_name, ticker, include_terms, exclude_terms, 
  sample_query, ibex_status, languages, geography, notes
) VALUES
  ('santander', 'Banco Santander', 'SAN.MC', '["Santander", "Banco Santander", "BSCH"]'::jsonb, '[]'::jsonb, '( "Santander" OR "Banco Santander" OR "BSCH" )', 'active_now', array['es','en'], array['ES'], null),
  ('bbva', 'BBVA', 'BBVA.MC', '["BBVA", "Banco Bilbao Vizcaya Argentaria"]'::jsonb, '[]'::jsonb, '( "BBVA" OR "Banco Bilbao Vizcaya Argentaria" )', 'active_now', array['es','en'], array['ES'], null),
  ('caixabank', 'CaixaBank', 'CABK.MC', '["CaixaBank", "La Caixa"]'::jsonb, '[]'::jsonb, '( "CaixaBank" OR "La Caixa" )', 'active_now', array['es','en'], array['ES'], null),
  ('sabadell', 'Banco Sabadell', 'SAB.MC', '["Sabadell", "Banco Sabadell"]'::jsonb, '[]'::jsonb, '( "Sabadell" OR "Banco Sabadell" )', 'active_now', array['es','en'], array['ES'], null),
  ('bankinter', 'Bankinter', 'BKT.MC', '["Bankinter"]'::jsonb, '[]'::jsonb, '( "Bankinter" )', 'active_now', array['es','en'], array['ES'], null),
  ('telefonica', 'Telefónica', 'TEF.MC', '["Telefónica", "Telefonica", "Movistar"]'::jsonb, '[]'::jsonb, '( "Telefónica" OR "Telefonica" OR "Movistar" )', 'active_now', array['es','en'], array['ES'], null),
  ('iberdrola', 'Iberdrola', 'IBE.MC', '["Iberdrola"]'::jsonb, '[]'::jsonb, '( "Iberdrola" )', 'active_now', array['es','en'], array['ES'], null),
  ('endesa', 'Endesa', 'ELE.MC', '["Endesa"]'::jsonb, '[]'::jsonb, '( "Endesa" )', 'active_now', array['es','en'], array['ES'], null),
  ('naturgy', 'Naturgy Energy Group', 'NTGY.MC', '["Naturgy", "Gas Natural Fenosa"]'::jsonb, '[]'::jsonb, '( "Naturgy" OR "Gas Natural Fenosa" )', 'active_now', array['es','en'], array['ES'], null),
  ('repsol', 'Repsol', 'REP.MC', '["Repsol"]'::jsonb, '[]'::jsonb, '( "Repsol" )', 'active_now', array['es','en'], array['ES'], null),
  ('acs', 'ACS', 'ACS.MC', '["ACS", "Grupo ACS", "Actividades de Construcción y Servicios"]'::jsonb, '[]'::jsonb, '( "ACS" OR "Grupo ACS" OR "Actividades de Construcción y Servicios" )', 'active_now', array['es','en'], array['ES'], null),
  ('ferrovial', 'Ferrovial', 'FER.MC', '["Ferrovial"]'::jsonb, '[]'::jsonb, '( "Ferrovial" )', 'active_now', array['es','en'], array['ES'], null),
  ('acciona', 'Acciona', 'ANA.MC', '["Acciona"]'::jsonb, '[]'::jsonb, '( "Acciona" )', 'active_now', array['es','en'], array['ES'], null),
  ('sacyr', 'Sacyr', 'SCYR.MC', '["Sacyr"]'::jsonb, '[]'::jsonb, '( "Sacyr" )', 'active_now', array['es','en'], array['ES'], null),
  ('inditex', 'Inditex', 'ITX.MC', '["Inditex", "Zara", "Pull&Bear", "Massimo Dutti"]'::jsonb, '[]'::jsonb, '( "Inditex" OR "Zara" OR "Pull&Bear" OR "Massimo Dutti" )', 'active_now', array['es','en'], array['ES'], null),
  ('amadeus', 'Amadeus IT Group', 'AMS.MC', '["Amadeus"]'::jsonb, '[]'::jsonb, '( "Amadeus" )', 'active_now', array['es','en'], array['ES'], null),
  ('iag', 'International Airlines Group', 'IAG.MC', '["IAG", "Iberia", "British Airways", "Vueling"]'::jsonb, '[]'::jsonb, '( "IAG" OR "Iberia" OR "British Airways" OR "Vueling" )', 'active_now', array['es','en'], array['ES'], null),
  ('aena', 'Aena', 'AENA.MC', '["Aena"]'::jsonb, '[]'::jsonb, '( "Aena" )', 'active_now', array['es','en'], array['ES'], null),
  ('melia', 'Meliá Hotels International', 'MEL.MC', '["Meliá", "Melia"]'::jsonb, '[]'::jsonb, '( "Meliá" OR "Melia" )', 'active_now', array['es','en'], array['ES'], null),
  ('mapfre', 'Mapfre', 'MAP.MC', '["Mapfre"]'::jsonb, '[]'::jsonb, '( "Mapfre" )', 'active_now', array['es','en'], array['ES'], null);