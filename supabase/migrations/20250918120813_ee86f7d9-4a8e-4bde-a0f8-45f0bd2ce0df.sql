-- Clear existing data and insert all brands from JSON
DELETE FROM public.repindex_root_issuers;

-- Insert all 35 companies from the JSON file
INSERT INTO public.repindex_root_issuers (
  issuer_id, issuer_name, ticker, include_terms, exclude_terms, 
  sample_query, ibex_status, languages, geography, notes
) VALUES
  ('acciona', 'Acciona', 'ANA.MC', '["Acciona"]'::jsonb, '[]'::jsonb, '(Acciona)', 'active_now', array['es','en'], array['ES'], null),
  ('acciona-energ-a', 'Acciona Energía', 'ANE.MC', '["Acciona Energía", "Acciona Energia"]'::jsonb, '[]'::jsonb, '("Acciona Energía" OR "Acciona Energia")', 'active_now', array['es','en'], array['ES'], null),
  ('acerinox', 'Acerinox', 'ACX.MC', '["Acerinox"]'::jsonb, '[]'::jsonb, '(Acerinox)', 'active_now', array['es','en'], array['ES'], null),
  ('acs', 'ACS', 'ACS.MC', '["ACS", "Grupo ACS", "ACS S.A."]'::jsonb, '["American Chemical Society", "Acute Coronary Syndrome", "American College of Surgeons", "Applied Cryptography Standard", "Australian Computer Society"]'::jsonb, '("ACS" OR "Grupo ACS" OR "ACS S.A.") AND NOT ("American Chemical Society" OR "Acute Coronary Syndrome" OR "American College of Surgeons" OR "Applied Cryptography Standard" OR "Australian Computer Society")', 'active_now', array['es','en'], array['ES'], null),
  ('aena', 'AENA', 'AENA.MC', '["Aena", "AENA S.M.E.", "Aena Aeropuertos"]'::jsonb, '[]'::jsonb, '(Aena OR "AENA S.M.E." OR "Aena Aeropuertos")', 'active_now', array['es','en'], array['ES'], null),
  ('amadeus-it-group', 'Amadeus IT Group', 'AMS.MC', '["Amadeus IT Group", "Amadeus IT", "Amadeus"]'::jsonb, '["Mozart", "película Amadeus", "banda sonora Amadeus", "música clásica"]'::jsonb, '("Amadeus IT Group" OR "Amadeus IT" OR Amadeus) AND NOT (Mozart OR "película Amadeus" OR "banda sonora Amadeus" OR "música clásica")', 'active_now', array['es','en'], array['ES'], null),
  ('arcelormittal', 'ArcelorMittal', 'MTS.MC', '["ArcelorMittal"]'::jsonb, '[]'::jsonb, '(ArcelorMittal)', 'active_now', array['es','en'], array['ES'], null),
  ('banco-sabadell', 'Banco Sabadell', 'SAB.MC', '["Banco Sabadell", "Sabadell"]'::jsonb, '[]'::jsonb, '("Banco Sabadell" OR Sabadell)', 'active_now', array['es','en'], array['ES'], null),
  ('banco-santander', 'Banco Santander', 'SAN.MC', '["Banco Santander", "Santander S.A.", "Santander"]'::jsonb, '["Santander (ciudad)", "Ayuntamiento de Santander", "Universidad de Santander"]'::jsonb, '("Banco Santander" OR "Santander S.A." OR Santander) AND NOT ("Santander (ciudad)" OR "Ayuntamiento de Santander" OR "Universidad de Santander")', 'active_now', array['es','en'], array['ES'], null),
  ('bankinter', 'Bankinter', 'BKT.MC', '["Bankinter"]'::jsonb, '[]'::jsonb, '(Bankinter)', 'active_now', array['es','en'], array['ES'], null),
  ('bbva', 'BBVA', 'BBVA.MC', '["BBVA"]'::jsonb, '[]'::jsonb, '("BBVA")', 'active_now', array['es','en'], array['ES'], null),
  ('caixabank', 'CaixaBank', 'CABK.MC', '["CaixaBank", "Caixabank"]'::jsonb, '["Fundación La Caixa", "La Caixa (fundación)"]'::jsonb, '(CaixaBank OR Caixabank) AND NOT ("Fundación La Caixa" OR "La Caixa (fundación)")', 'active_now', array['es','en'], array['ES'], null),
  ('cellnex-telecom', 'Cellnex Telecom', 'CLNX.MC', '["Cellnex", "Cellnex Telecom"]'::jsonb, '[]'::jsonb, '(Cellnex OR "Cellnex Telecom")', 'active_now', array['es','en'], array['ES'], null),
  ('inmobiliaria-colonial', 'Inmobiliaria Colonial', 'COL.MC', '["Inmobiliaria Colonial", "Colonial SOCIMI", "Colonial"]'::jsonb, '["colonial (adjetivo)", "estilo colonial"]'::jsonb, '("Inmobiliaria Colonial" OR "Colonial SOCIMI" OR Colonial) AND NOT ("colonial (adjetivo)" OR "estilo colonial")', 'active_now', array['es','en'], array['ES'], null),
  ('enag-s', 'Enagás', 'ENG.MC', '["Enagás", "Enagas"]'::jsonb, '[]'::jsonb, '(Enagás OR Enagas)', 'active_now', array['es','en'], array['ES'], null),
  ('endesa', 'Endesa', 'ELE.MC', '["Endesa"]'::jsonb, '[]'::jsonb, '(Endesa)', 'active_now', array['es','en'], array['ES'], null),
  ('ferrovial', 'Ferrovial', 'FER.MC', '["Ferrovial"]'::jsonb, '[]'::jsonb, '(Ferrovial)', 'active_now', array['es','en'], array['ES'], null),
  ('fluidra', 'Fluidra', 'FDR.MC', '["Fluidra"]'::jsonb, '[]'::jsonb, '(Fluidra)', 'active_now', array['es','en'], array['ES'], null),
  ('grifols', 'Grifols', 'GRF.MC', '["Grifols"]'::jsonb, '[]'::jsonb, '(Grifols)', 'active_now', array['es','en'], array['ES'], null),
  ('iag', 'IAG', 'IAG.MC', '["IAG", "International Airlines Group"]'::jsonb, '["Insurance Australia Group", "IAG (Australia)", "ASX:IAG"]'::jsonb, '("IAG" OR "International Airlines Group") AND NOT ("Insurance Australia Group" OR "IAG (Australia)" OR ASX:IAG)', 'active_now', array['es','en'], array['ES'], null),
  ('iberdrola', 'Iberdrola', 'IBE.MC', '["Iberdrola"]'::jsonb, '[]'::jsonb, '(Iberdrola)', 'active_now', array['es','en'], array['ES'], null),
  ('inditex', 'Inditex', 'ITX.MC', '["Inditex"]'::jsonb, '[]'::jsonb, '(Inditex)', 'active_now', array['es','en'], array['ES'], null),
  ('indra', 'Indra', 'IDR.MC', '["Indra", "Indra Sistemas"]'::jsonb, '["dios Indra", "mitología hindú", "hinduismo"]'::jsonb, '(Indra OR "Indra Sistemas") AND NOT ("dios Indra" OR "mitología hindú" OR hinduismo)', 'active_now', array['es','en'], array['ES'], null),
  ('logista', 'Logista', 'LOG.MC', '["Logista", "Logista Holdings"]'::jsonb, '[]'::jsonb, '(Logista OR "Logista Holdings")', 'active_now', array['es','en'], array['ES'], null),
  ('mapfre', 'Mapfre', 'MAP.MC', '["Mapfre", "MAPFRE"]'::jsonb, '[]'::jsonb, '(Mapfre OR "MAPFRE")', 'active_now', array['es','en'], array['ES'], null),
  ('merlin-properties', 'Merlin Properties', 'MRL.MC', '["Merlin Properties", "MERLIN Properties"]'::jsonb, '["mago Merlín", "personaje Merlín", "Arthurian legend"]'::jsonb, '("Merlin Properties" OR "MERLIN Properties") AND NOT ("mago Merlín" OR "personaje Merlín" OR "Arthurian legend")', 'active_now', array['es','en'], array['ES'], null),
  ('naturgy', 'Naturgy', 'NTGY.MC', '["Naturgy", "Naturgy Energy Group"]'::jsonb, '[]'::jsonb, '(Naturgy OR "Naturgy Energy Group")', 'active_now', array['es','en'], array['ES'], null),
  ('puig', 'Puig', 'PUIG.MC', '["Puig", "Puig Brands"]'::jsonb, '["apellido Puig", "Puigdemont"]'::jsonb, '(Puig OR "Puig Brands") AND NOT ("apellido Puig" OR Puigdemont)', 'active_now', array['es','en'], array['ES'], null),
  ('redeia-corporaci-n', 'Redeia Corporación', 'RED.MC', '["Redeia", "Redeia Corporación", "REE"]'::jsonb, '[]'::jsonb, '(Redeia OR "Redeia Corporación" OR "REE")', 'active_now', array['es','en'], array['ES'], null),
  ('repsol', 'Repsol', 'REP.MC', '["Repsol"]'::jsonb, '[]'::jsonb, '(Repsol)', 'active_now', array['es','en'], array['ES'], null),
  ('laboratorios-rovi', 'Laboratorios Rovi', 'ROVI.MC', '["Laboratorios Rovi", "ROVI"]'::jsonb, '["apellido Rovi"]'::jsonb, '("Laboratorios Rovi" OR "ROVI") AND NOT ("apellido Rovi")', 'active_now', array['es','en'], array['ES'], null),
  ('sacyr', 'Sacyr', 'SCYR.MC', '["Sacyr"]'::jsonb, '[]'::jsonb, '(Sacyr)', 'active_now', array['es','en'], array['ES'], null),
  ('solaria', 'Solaria', 'SLR.MC', '["Solaria", "Solaria Energía y Medio Ambiente"]'::jsonb, '["solarium", "solaria (plural)"]'::jsonb, '(Solaria OR "Solaria Energía y Medio Ambiente") AND NOT (solarium OR "solaria (plural)")', 'active_now', array['es','en'], array['ES'], null),
  ('telef-nica', 'Telefónica', 'TEF.MC', '["Telefónica", "Telefonica"]'::jsonb, '[]'::jsonb, '(Telefónica OR Telefonica)', 'active_now', array['es','en'], array['ES'], null),
  ('unicaja-banco', 'Unicaja Banco', 'UNI.MC', '["Unicaja Banco", "Unicaja"]'::jsonb, '["Unicaja Baloncesto", "ACB", "Club Baloncesto Málaga"]'::jsonb, '("Unicaja Banco" OR Unicaja) AND NOT ("Unicaja Baloncesto" OR ACB OR "Club Baloncesto Málaga")', 'active_now', array['es','en'], array['ES'], null);