
-- =====================================================================
-- Taxonomía de subsectores (tabla de referencia)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.repindex_subsector_taxonomy (
  sector_category text NOT NULL,
  subsector text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sector_category, subsector)
);

ALTER TABLE public.repindex_subsector_taxonomy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Taxonomy publicly readable" ON public.repindex_subsector_taxonomy;
CREATE POLICY "Taxonomy publicly readable"
  ON public.repindex_subsector_taxonomy FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage taxonomy" ON public.repindex_subsector_taxonomy;
CREATE POLICY "Admins manage taxonomy"
  ON public.repindex_subsector_taxonomy FOR ALL
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- =====================================================================
-- 1) Salud y Farmacéutico
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Salud y Farmacéutico', subsector='Farmacéuticas'
  WHERE ticker IN ('ALM','FAE','ROVI','RJF');
UPDATE public.repindex_root_issuers SET sector_category='Salud y Farmacéutico', subsector='Biotecnología'
  WHERE ticker IN ('ORY','PHM','ATR');
UPDATE public.repindex_root_issuers SET sector_category='Salud y Farmacéutico', subsector='Hemoderivados'
  WHERE ticker='GRF';
UPDATE public.repindex_root_issuers SET sector_category='Salud y Farmacéutico', subsector='Grupos Hospitalarios'
  WHERE ticker IN ('HMH','QS','VIT','HLA','HOS','VIA','RS');
UPDATE public.repindex_root_issuers SET sector_category='Salud y Farmacéutico', subsector='Servicios Médicos Especializados'
  WHERE ticker='CBAV';

-- =====================================================================
-- 2) Banca y Servicios Financieros
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Banca y Servicios Financieros', subsector='Banca Comercial'
  WHERE ticker IN ('SAN','BBVA','CABK','SAB','BKT','UNI');
UPDATE public.repindex_root_issuers SET sector_category='Banca y Servicios Financieros', subsector='Banca de Inversión / Gestión'
  WHERE ticker IN ('ALTR','R4');

-- =====================================================================
-- 3) Seguros (sector independiente)
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Seguros', subsector='Aseguradoras Generalistas'
  WHERE ticker IN ('MAP','GCO.MC','MUTUA-PRIV');
UPDATE public.repindex_root_issuers SET sector_category='Seguros', subsector='Aseguradoras Directas'
  WHERE ticker='LDA';
UPDATE public.repindex_root_issuers SET sector_category='Seguros', subsector='Aseguradoras de Salud'
  WHERE ticker='SANITAS';

-- =====================================================================
-- 4) Construcción e Infraestructuras (absorbe "Construcción")
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Construcción e Infraestructuras', subsector='Constructoras'
  WHERE ticker IN ('ACS','FER','SCYR','FCC-PRIV','OHL','GSJ','AZVI','ANA','CLE');
UPDATE public.repindex_root_issuers SET sector_category='Construcción e Infraestructuras', subsector='Concesionarias de Infraestructura'
  WHERE ticker='ABE.MC';
UPDATE public.repindex_root_issuers SET sector_category='Construcción e Infraestructuras', subsector='Ingeniería y Servicios Industriales'
  WHERE ticker IN ('TRE','ENO');
UPDATE public.repindex_root_issuers SET sector_category='Construcción e Infraestructuras', subsector='Material Ferroviario'
  WHERE ticker IN ('CAF','TLG');
UPDATE public.repindex_root_issuers SET sector_category='Construcción e Infraestructuras', subsector='Promotoras Residenciales'
  WHERE ticker IN ('AED','HOME','MVC','RLIA','REN','MTB','INSUR');
UPDATE public.repindex_root_issuers SET sector_category='Construcción e Infraestructuras', subsector='SOCIMIs / Patrimonialistas'
  WHERE ticker IN ('MRL','COL','LRE','CAST','ARM','AIRON','UPH','CEVA','LIB7');
UPDATE public.repindex_root_issuers SET sector_category='Construcción e Infraestructuras', subsector='Inmobiliarias Diversificadas'
  WHERE ticker IN ('NYE','URB');
UPDATE public.repindex_root_issuers SET sector_category='Construcción e Infraestructuras', subsector='PropTech'
  WHERE ticker='IDEALISTA-PRIV';

-- =====================================================================
-- 5) Energía y Gas (absorbe "Petróleo y Energía")
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Energía y Gas', subsector='Utilities Eléctricas'
  WHERE ticker IN ('IBE','ELE','NTGY');
UPDATE public.repindex_root_issuers SET sector_category='Energía y Gas', subsector='Transmisión y Distribución'
  WHERE ticker IN ('RED','ENG');
UPDATE public.repindex_root_issuers SET sector_category='Energía y Gas', subsector='Oil & Gas'
  WHERE ticker IN ('REP','MOE.MC');
UPDATE public.repindex_root_issuers SET sector_category='Energía y Gas', subsector='Logística Energética'
  WHERE ticker='EXOLUM-PRIV';
UPDATE public.repindex_root_issuers SET sector_category='Energía y Gas', subsector='Renovables'
  WHERE ticker IN ('ANE.MC','SLR','GRE','ADX','ECR','EIDF','ENS','HLZ','SOL','BKY');
UPDATE public.repindex_root_issuers SET sector_category='Energía y Gas', subsector='Biomasa y Celulosa'
  WHERE ticker='ENC';

-- =====================================================================
-- 6) Materias Primas y Siderurgia
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Materias Primas y Siderurgia', subsector='Acero Inoxidable' WHERE ticker='ACX';
UPDATE public.repindex_root_issuers SET sector_category='Materias Primas y Siderurgia', subsector='Siderurgia Integral' WHERE ticker='MTS';
UPDATE public.repindex_root_issuers SET sector_category='Materias Primas y Siderurgia', subsector='Tubos de Acero' WHERE ticker IN ('TUB','TRG');
UPDATE public.repindex_root_issuers SET sector_category='Materias Primas y Siderurgia', subsector='Química' WHERE ticker='ECR2';
UPDATE public.repindex_root_issuers SET sector_category='Materias Primas y Siderurgia', subsector='Papel y Celulosa' WHERE ticker IN ('IBG','MCM');
UPDATE public.repindex_root_issuers SET sector_category='Materias Primas y Siderurgia', subsector='Envases' WHERE ticker IN ('VID','VIS');
UPDATE public.repindex_root_issuers SET sector_category='Materias Primas y Siderurgia', subsector='Componentes Metálicos' WHERE ticker='LES';

-- =====================================================================
-- 7) Telecomunicaciones y Tecnología (absorbe "Telecomunicaciones")
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Telecomunicaciones y Tecnología', subsector='Operadores Telecom'
  WHERE ticker IN ('TEF','MASOR-PRIV');
UPDATE public.repindex_root_issuers SET sector_category='Telecomunicaciones y Tecnología', subsector='Telecom Alternativos'
  WHERE ticker IN ('PAR','AMP');
UPDATE public.repindex_root_issuers SET sector_category='Telecomunicaciones y Tecnología', subsector='Infraestructura Telecom'
  WHERE ticker IN ('CLNX','ART2');
UPDATE public.repindex_root_issuers SET sector_category='Telecomunicaciones y Tecnología', subsector='Tech Viajes'
  WHERE ticker='AMS';
UPDATE public.repindex_root_issuers SET sector_category='Telecomunicaciones y Tecnología', subsector='Consultoría IT / Defensa'
  WHERE ticker='IDR';
UPDATE public.repindex_root_issuers SET sector_category='Telecomunicaciones y Tecnología', subsector='Big Tech'
  WHERE ticker IN ('GOOGLE-PRIV','AMAZON-PRIV','META-PRIV');
UPDATE public.repindex_root_issuers SET sector_category='Telecomunicaciones y Tecnología', subsector='Comunicación y PR'
  WHERE ticker='LLYC';
UPDATE public.repindex_root_issuers SET sector_category='Telecomunicaciones y Tecnología', subsector='Software y Servicios IT'
  WHERE ticker IN ('ALT','IZE','MAKS','SER','GIGA','AGIL.MC','NET','SUB','ROBOT');
UPDATE public.repindex_root_issuers SET sector_category='Telecomunicaciones y Tecnología', subsector='EdTech'
  WHERE ticker='PRO';
UPDATE public.repindex_root_issuers SET sector_category='Telecomunicaciones y Tecnología', subsector='Media Digital'
  WHERE ticker IN ('FEVER-PRIV','SQM','SEC');

-- =====================================================================
-- 8) Hoteles y Turismo
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Hoteles y Turismo', subsector='Hoteles' WHERE ticker='MEL';
UPDATE public.repindex_root_issuers SET sector_category='Hoteles y Turismo', subsector='OTAs / Marketplaces Viaje'
  WHERE ticker IN ('BOOKING-PRIV','AIRBNB-PRIV','EDR');
UPDATE public.repindex_root_issuers SET sector_category='Hoteles y Turismo', subsector='Aerolíneas' WHERE ticker='IAG';
UPDATE public.repindex_root_issuers SET sector_category='Hoteles y Turismo', subsector='Aeropuertos' WHERE ticker='AENA';

-- =====================================================================
-- 9) Alimentación y Bebidas (renombre)
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Alimentación y Bebidas', subsector='Cerveceras'
  WHERE ticker IN ('DAMM-PRIV','MAHOU-PRIV');
UPDATE public.repindex_root_issuers SET sector_category='Alimentación y Bebidas', subsector='Bebidas Espumosas'
  WHERE ticker='FREIX-PRIV';
UPDATE public.repindex_root_issuers SET sector_category='Alimentación y Bebidas', subsector='Refrescos'
  WHERE ticker='CCEP';
UPDATE public.repindex_root_issuers SET sector_category='Alimentación y Bebidas', subsector='Vinos'
  WHERE ticker IN ('BIL','RIO');
UPDATE public.repindex_root_issuers SET sector_category='Alimentación y Bebidas', subsector='Cárnicas'
  WHERE ticker='CAMPO-PRIV';
UPDATE public.repindex_root_issuers SET sector_category='Alimentación y Bebidas', subsector='Pesca'
  WHERE ticker IN ('PESCANOVA-PRIV','PVA');
UPDATE public.repindex_root_issuers SET sector_category='Alimentación y Bebidas', subsector='Aceite'
  WHERE ticker='OLE';
UPDATE public.repindex_root_issuers SET sector_category='Alimentación y Bebidas', subsector='Holdings Alimentarios'
  WHERE ticker IN ('AGRO-PRIV','EBR');
UPDATE public.repindex_root_issuers SET sector_category='Alimentación y Bebidas', subsector='Nutrición'
  WHERE ticker='NHS';

-- =====================================================================
-- 10) Consumo y Distribución (fusiona Distribución + Moda y Distribución)
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Consumo y Distribución', subsector='Retail Moda'
  WHERE ticker IN ('ITX','ADZ');
UPDATE public.repindex_root_issuers SET sector_category='Consumo y Distribución', subsector='Gran Distribución'
  WHERE ticker IN ('MERC-PRIV','EROSKI-PRIV','ECI-PRIV','DIA');
UPDATE public.repindex_root_issuers SET sector_category='Consumo y Distribución', subsector='Cosmética y Perfumería'
  WHERE ticker='PUIG';
UPDATE public.repindex_root_issuers SET sector_category='Consumo y Distribución', subsector='Material Sanitario Retail'
  WHERE ticker='PRIM';

-- =====================================================================
-- 11) Consultoría y Auditoría
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Consultoría y Auditoría', subsector='Big Four / Consultoría'
  WHERE ticker IN ('DELOITTE-PRIV','PWC-PRIV','EY-PRIV','KPMG-PRIV','ACCENTURE-PRIV');

-- =====================================================================
-- 12) Defensa e Ingeniería
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Defensa e Ingeniería', subsector='Defensa'
  WHERE ticker IN ('EME-PRIV','AIR');
UPDATE public.repindex_root_issuers SET sector_category='Defensa e Ingeniería', subsector='Ingeniería Avanzada / Robótica'
  WHERE ticker='ART';

-- =====================================================================
-- 13) Automoción
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Automoción', subsector='Componentes Auto'
  WHERE ticker IN ('GEST','CIE','ANTOLIN-PRIV');

-- =====================================================================
-- 14) Logística y Transporte (fusiona Logística + Transporte)
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Logística y Transporte', subsector='Logística Postal'
  WHERE ticker='CORREOS-PRIV';
UPDATE public.repindex_root_issuers SET sector_category='Logística y Transporte', subsector='Distribución Tabacos'
  WHERE ticker='LOG';
UPDATE public.repindex_root_issuers SET sector_category='Logística y Transporte', subsector='Transporte Ferroviario'
  WHERE ticker='RENFE-PRIV';

-- =====================================================================
-- 15) Industria
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Industria', subsector='Materiales de Construcción'
  WHERE ticker='CSN.MC';
UPDATE public.repindex_root_issuers SET sector_category='Industria', subsector='Equipos Piscinas'
  WHERE ticker='FDR';
UPDATE public.repindex_root_issuers SET sector_category='Industria', subsector='Maquinaria'
  WHERE ticker IN ('NEA','MDF','GAM','AZK');
UPDATE public.repindex_root_issuers SET sector_category='Industria', subsector='Componentes Industriales'
  WHERE ticker IN ('DOM','EZE');
UPDATE public.repindex_root_issuers SET sector_category='Industria', subsector='Textil Técnico'
  WHERE ticker='NXT';

-- =====================================================================
-- 16) Medios y Comunicación (nuevo)
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Medios y Comunicación', subsector='TV / Audiovisual'
  WHERE ticker IN ('A3M','MFEB');
UPDATE public.repindex_root_issuers SET sector_category='Medios y Comunicación', subsector='Prensa'
  WHERE ticker IN ('PRS','VOC');

-- =====================================================================
-- 17) Seguridad
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Seguridad', subsector='Seguridad Privada'
  WHERE ticker IN ('PSG','CASH');

-- =====================================================================
-- 18) Restauración (consolida duplicados Telepizza)
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Restauración', subsector='Comida Rápida'
  WHERE ticker IN ('TPZ','TELEPIZZA-PRIV');

-- =====================================================================
-- 19) Servicios B2B
-- =====================================================================
UPDATE public.repindex_root_issuers SET sector_category='Servicios B2B', subsector='Inspección y Certificación'
  WHERE ticker='AS';

-- =====================================================================
-- Poblar tabla taxonomía
-- =====================================================================
INSERT INTO public.repindex_subsector_taxonomy (sector_category, subsector)
SELECT DISTINCT sector_category, subsector
  FROM public.repindex_root_issuers
  WHERE sector_category IS NOT NULL AND subsector IS NOT NULL
ON CONFLICT DO NOTHING;
