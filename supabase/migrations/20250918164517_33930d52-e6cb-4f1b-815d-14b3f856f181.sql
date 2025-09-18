-- Drop existing table and recreate with complete structure
DROP TABLE IF EXISTS public.repindex_root_issuers;

-- Create the updated table with all new columns
CREATE TABLE public.repindex_root_issuers (
    issuer_id TEXT NOT NULL PRIMARY KEY,
    issuer_name TEXT NOT NULL,
    ticker TEXT NOT NULL,
    include_terms JSONB NOT NULL,
    exclude_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
    sample_query TEXT NOT NULL,
    ibex_status TEXT NOT NULL,
    languages TEXT[] NOT NULL DEFAULT ARRAY['es'::text, 'en'::text],
    geography TEXT[] NOT NULL DEFAULT ARRAY['ES'::text],
    notes TEXT,
    prueba TEXT DEFAULT 'no' CHECK (prueba IN ('sí', 'no')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    -- New columns from CSV
    ibex_family_category TEXT,
    ibex_family_code TEXT,
    source_segment_detail TEXT,
    status TEXT,
    source_hint TEXT,
    sector_category TEXT
);

-- Enable RLS
ALTER TABLE public.repindex_root_issuers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Acceso público de lectura" ON public.repindex_root_issuers FOR SELECT USING (true);
CREATE POLICY "Acceso público de inserción" ON public.repindex_root_issuers FOR INSERT WITH CHECK (true);
CREATE POLICY "Acceso público de actualización" ON public.repindex_root_issuers FOR UPDATE USING (true);
CREATE POLICY "Acceso público de eliminación" ON public.repindex_root_issuers FOR DELETE USING (true);

-- Insert all 98 companies from the CSV data
INSERT INTO public.repindex_root_issuers (
    issuer_id, issuer_name, ticker, include_terms, exclude_terms, sample_query, 
    ibex_status, ibex_family_category, ibex_family_code, source_segment_detail, 
    status, source_hint, sector_category, prueba
) VALUES 
('ALM', 'Almirall', 'ALM', '["Almirall"]', '[]', 'Almirall noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('A3M', 'Atresmedia', 'A3M', '["Atresmedia"]', '[]', 'Atresmedia noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('CAF', 'CAF (Construcciones y Auxiliar de Ferrocarriles)', 'CAF', '["CAF", "Construcciones y Auxiliar de Ferrocarriles"]', '[]', 'CAF ferrocarriles noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('CIE', 'CIE Automotive', 'CIE', '["CIE Automotive"]', '[]', 'CIE Automotive noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('EBR', 'Ebro Foods', 'EBR', '["Ebro Foods"]', '[]', 'Ebro Foods noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('EDR', 'eDreams ODIGEO', 'EDR', '["eDreams", "ODIGEO"]', '[]', 'eDreams ODIGEO noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Hoteles y Turismo', 'no'),
('ENC', 'Ence Energía y Celulosa', 'ENC', '["Ence", "Energía y Celulosa"]', '[]', 'Ence Energía Celulosa noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Energía y Gas', 'sí'),
('ENO', 'Elecnor', 'ENO', '["Elecnor"]', '[]', 'Elecnor noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('FAE', 'Faes Farma', 'FAE', '["Faes Farma"]', '[]', 'Faes Farma noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Salud y Farmacéutico', 'no'),
('GEST', 'Gestamp', 'GEST', '["Gestamp"]', '[]', 'Gestamp noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('DOM', 'Global Dominion', 'DOM', '["Global Dominion"]', '[]', 'Global Dominion noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('LRE', 'Lar España Real Estate', 'LRE', '["Lar España", "Real Estate"]', '[]', 'Lar España Real Estate noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('LDA', 'Línea Directa Aseguradora', 'LDA', '["Línea Directa", "Aseguradora"]', '[]', 'Línea Directa Aseguradora noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Banca y Servicios Financieros', 'no'),
('MEL', 'Meliá Hotels International', 'MEL', '["Meliá Hotels", "International"]', '[]', 'Meliá Hotels International noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Hoteles y Turismo', 'no'),
('HOME', 'Neinor Homes', 'HOME', '["Neinor Homes"]', '[]', 'Neinor Homes noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('PHM', 'PharmaMar', 'PHM', '["PharmaMar"]', '[]', 'PharmaMar noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Salud y Farmacéutico', 'no'),
('TRE', 'Técnicas Reunidas', 'TRE', '["Técnicas Reunidas"]', '[]', 'Técnicas Reunidas noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('TUB', 'Tubacex', 'TUB', '["Tubacex"]', '[]', 'Tubacex noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Materias Primas y Siderurgia', 'no'),
('VID', 'Vidrala', 'VID', '["Vidrala"]', '[]', 'Vidrala noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Materias Primas y Siderurgia', 'no'),
('VIS', 'Viscofan', 'VIS', '["Viscofan"]', '[]', 'Viscofan noticias', 'active', 'IBEX Medium Cap', 'IBEX-MC', 'IBEX Medium Cap (componente)', 'active', 'BME Exchange / Indices family', 'Materias Primas y Siderurgia', 'no'),
('AED', 'AEDAS Homes', 'AED', '["AEDAS Homes"]', '[]', 'AEDAS Homes noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('ART', 'Airtificial', 'ART', '["Airtificial"]', '[]', 'Airtificial noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Telecomunicaciones y Tecnología', 'no'),
('AMP', 'Amper', 'AMP', '["Amper"]', '[]', 'Amper noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Telecomunicaciones y Tecnología', 'no'),
('ARM', 'Árima Real Estate', 'ARM', '["Árima", "Real Estate"]', '[]', 'Árima Real Estate noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('ATR', 'Atrys Health', 'ATR', '["Atrys Health"]', '[]', 'Atrys Health noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Salud y Farmacéutico', 'no'),
('ADX', 'Audax Renovables', 'ADX', '["Audax Renovables"]', '[]', 'Audax Renovables noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Energía y Gas', 'sí'),
('AZK', 'Azkoyen', 'AZK', '["Azkoyen"]', '[]', 'Azkoyen noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('BKY', 'Berkeley Energía', 'BKY', '["Berkeley Energía"]', '[]', 'Berkeley Energía noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Energía y Gas', 'sí'),
('MDF', 'Duro Felguera', 'MDF', '["Duro Felguera"]', '[]', 'Duro Felguera noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('OLE', 'Deoleo', 'OLE', '["Deoleo"]', '[]', 'Deoleo noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('DIA', 'DIA', 'DIA', '["DIA"]', '[]', 'DIA noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('ECR', 'Ecoener', 'ECR', '["Ecoener"]', '[]', 'Ecoener noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Energía y Gas', 'sí'),
('ECR2', 'Ercros', 'ECR2', '["Ercros"]', '[]', 'Ercros noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Materias Primas y Siderurgia', 'no'),
('EZE', 'Ezentis', 'EZE', '["Ezentis"]', '[]', 'Ezentis noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('GRE', 'Grenergy Renovables', 'GRE', '["Grenergy Renovables"]', '[]', 'Grenergy Renovables noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Energía y Gas', 'sí'),
('GSJ', 'Grupo Empresarial San José', 'GSJ', '["Grupo Empresarial San José"]', '[]', 'Grupo Empresarial San José noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('GAM', 'GAM (General de Alquiler de Maquinaria)', 'GAM', '["GAM", "General de Alquiler de Maquinaria"]', '[]', 'GAM alquiler maquinaria noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('NHS', 'Naturhouse', 'NHS', '["Naturhouse"]', '[]', 'Naturhouse noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('NXT', 'Nextil', 'NXT', '["Nextil"]', '[]', 'Nextil noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('NEA', 'Nicolás Correa', 'NEA', '["Nicolás Correa"]', '[]', 'Nicolás Correa noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('OHL', 'OHLA', 'OHL', '["OHLA"]', '[]', 'OHLA noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('ORY', 'Oryzon Genomics', 'ORY', '["Oryzon Genomics"]', '[]', 'Oryzon Genomics noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Salud y Farmacéutico', 'no'),
('PSG', 'Prosegur', 'PSG', '["Prosegur"]', '[]', 'Prosegur noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('CASH', 'Prosegur Cash', 'CASH', '["Prosegur Cash"]', '[]', 'Prosegur Cash noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('RJF', 'Reig Jofre', 'RJF', '["Reig Jofre"]', '[]', 'Reig Jofre noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Salud y Farmacéutico', 'no'),
('SOL', 'Soltec', 'SOL', '["Soltec"]', '[]', 'Soltec noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('TLG', 'Talgo', 'TLG', '["Talgo"]', '[]', 'Talgo noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('TRG', 'Tubos Reunidos', 'TRG', '["Tubos Reunidos"]', '[]', 'Tubos Reunidos noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Materias Primas y Siderurgia', 'no'),
('URB', 'Urbas', 'URB', '["Urbas"]', '[]', 'Urbas noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('VOC', 'Vocento', 'VOC', '["Vocento"]', '[]', 'Vocento noticias', 'active', 'IBEX Small Cap', 'IBEX-SC', 'IBEX Small Cap (componente)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('AIR', 'Airbus', 'AIR', '["Airbus"]', '[]', 'Airbus noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('CCEP', 'Coca-Cola Europacific Partners', 'CCEP', '["Coca-Cola Europacific Partners"]', '[]', 'Coca-Cola Europacific Partners noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('IBG', 'Iberpapel Gestión', 'IBG', '["Iberpapel Gestión"]', '[]', 'Iberpapel Gestión noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Materias Primas y Siderurgia', 'no'),
('MCM', 'Miquel y Costas & Miquel', 'MCM', '["Miquel y Costas", "Miquel"]', '[]', 'Miquel y Costas Miquel noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Materias Primas y Siderurgia', 'no'),
('LES', 'Lingotes Especiales', 'LES', '["Lingotes Especiales"]', '[]', 'Lingotes Especiales noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Materias Primas y Siderurgia', 'no'),
('PRIM', 'Prim', 'PRIM', '["Prim"]', '[]', 'Prim noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Moda y Distribución', 'no'),
('R4', 'Renta 4 Banco', 'R4', '["Renta 4 Banco"]', '[]', 'Renta 4 Banco noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Banca y Servicios Financieros', 'no'),
('REN', 'Renta Corporación', 'REN', '["Renta Corporación"]', '[]', 'Renta Corporación noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('RLIA', 'Realia Business', 'RLIA', '["Realia Business"]', '[]', 'Realia Business noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('MVC', 'Metrovacesa', 'MVC', '["Metrovacesa"]', '[]', 'Metrovacesa noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('INSUR', 'Inmobiliaria del Sur (INSUR)', 'INSUR', '["Inmobiliaria del Sur", "INSUR"]', '[]', 'Inmobiliaria del Sur INSUR noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('RIO', 'Bodegas Riojanas', 'RIO', '["Bodegas Riojanas"]', '[]', 'Bodegas Riojanas noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('BIL', 'Bodegas Bilbaínas', 'BIL', '["Bodegas Bilbaínas"]', '[]', 'Bodegas Bilbaínas noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('MTB', 'Montebalito', 'MTB', '["Montebalito"]', '[]', 'Montebalito noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('ADZ', 'Adolfo Domínguez', 'ADZ', '["Adolfo Domínguez"]', '[]', 'Adolfo Domínguez noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Moda y Distribución', 'no'),
('ALTR', 'Alantra Partners', 'ALTR', '["Alantra Partners"]', '[]', 'Alantra Partners noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Banca y Servicios Financieros', 'no'),
('CBAV', 'Clínica Baviera', 'CBAV', '["Clínica Baviera"]', '[]', 'Clínica Baviera noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Salud y Farmacéutico', 'no'),
('CEVA', 'CEVASA', 'CEVA', '["CEVASA"]', '[]', 'CEVASA noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('UPH', 'Uro Property Holdings', 'UPH', '["Uro Property Holdings"]', '[]', 'Uro Property Holdings noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('NYE', 'Nyesa Valores', 'NYE', '["Nyesa Valores"]', '[]', 'Nyesa Valores noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('APPS', 'Applus Services', 'APPS', '["Applus Services"]', '[]', 'Applus Services noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('MFEB', 'MFE-MediaForEurope', 'MFEB', '["MFE-MediaForEurope"]', '[]', 'MFE-MediaForEurope noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('PRS', 'PRISA (Promotora de Informaciones)', 'PRS', '["PRISA", "Promotora de Informaciones"]', '[]', 'PRISA Promotora Informaciones noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('SQM', 'Squirrel Media', 'SQM', '["Squirrel Media"]', '[]', 'Squirrel Media noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('CAT', 'Catalana Occidente', 'CAT', '["Catalana Occidente"]', '[]', 'Catalana Occidente noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Banca y Servicios Financieros', 'no'),
('TPZ', 'Telepizza Brands (Food Delivery Brands)', 'TPZ', '["Telepizza Brands", "Food Delivery Brands"]', '[]', 'Telepizza Brands Food Delivery noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('PVA', 'Pescanova (Nueva Pescanova)', 'PVA', '["Pescanova", "Nueva Pescanova"]', '[]', 'Pescanova Nueva Pescanova noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('LIB7', 'Libertas 7', 'LIB7', '["Libertas 7"]', '[]', 'Libertas 7 noticias', 'active', 'Fuera de familia IBEX (Mercado Continuo)', 'MC-OTHER', 'Mercado Continuo (no IBEX family)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('ART2', 'Arteche', 'ART2', '["Arteche"]', '[]', 'Arteche noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Telecomunicaciones y Tecnología', 'no'),
('ALT', 'Altia Consultores', 'ALT', '["Altia Consultores"]', '[]', 'Altia Consultores noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Telecomunicaciones y Tecnología', 'no'),
('AIRON', 'All Iron RE I SOCIMI', 'AIRON', '["All Iron RE I SOCIMI"]', '[]', 'All Iron RE I SOCIMI noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('LLYC', 'LLYC (Llorente & Cuenca)', 'LLYC', '["LLYC", "Llorente & Cuenca"]', '[]', 'LLYC Llorente Cuenca noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Telecomunicaciones y Tecnología', 'no'),
('SEC', 'Secuoya Content Group', 'SEC', '["Secuoya Content Group"]', '[]', 'Secuoya Content Group noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Telecomunicaciones y Tecnología', 'no'),
('GIGA', 'Gigas Hosting', 'GIGA', '["Gigas Hosting"]', '[]', 'Gigas Hosting noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Telecomunicaciones y Tecnología', 'no'),
('AGIL', 'Agile Content', 'AGIL', '["Agile Content"]', '[]', 'Agile Content noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Telecomunicaciones y Tecnología', 'no'),
('MAKS', 'Making Science Group', 'MAKS', '["Making Science Group"]', '[]', 'Making Science Group noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Telecomunicaciones y Tecnología', 'no'),
('SER', 'Seresco', 'SER', '["Seresco"]', '[]', 'Seresco noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('IZE', 'Izertis', 'IZE', '["Izertis"]', '[]', 'Izertis noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Telecomunicaciones y Tecnología', 'no'),
('PRO', 'Proeduca Altus', 'PRO', '["Proeduca Altus"]', '[]', 'Proeduca Altus noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Telecomunicaciones y Tecnología', 'no'),
('CLE', 'Clerhp Estructuras', 'CLE', '["Clerhp Estructuras"]', '[]', 'Clerhp Estructuras noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('NET', 'Netex Learning', 'NET', '["Netex Learning"]', '[]', 'Netex Learning noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Telecomunicaciones y Tecnología', 'no'),
('PAR', 'Parlem Telecom', 'PAR', '["Parlem Telecom"]', '[]', 'Parlem Telecom noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Telecomunicaciones y Tecnología', 'no'),
('EIDF', 'EiDF Solar', 'EIDF', '["EiDF Solar"]', '[]', 'EiDF Solar noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Energía y Gas', 'sí'),
('ENS', 'Enerside Energy', 'ENS', '["Enerside Energy"]', '[]', 'Enerside Energy noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Energía y Gas', 'sí'),
('HLZ', 'Holaluz', 'HLZ', '["Holaluz"]', '[]', 'Holaluz noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no'),
('SUB', 'Substrate AI', 'SUB', '["Substrate AI"]', '[]', 'Substrate AI noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Telecomunicaciones y Tecnología', 'no'),
('CAST', 'Castellana Properties SOCIMI', 'CAST', '["Castellana Properties SOCIMI"]', '[]', 'Castellana Properties SOCIMI noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Construcción e Infraestructuras', 'no'),
('ROBOT', 'Robot S.A.', 'ROBOT', '["Robot S.A."]', '[]', 'Robot S.A. noticias', 'active', 'Fuera de familia IBEX (BME Growth)', 'BME-GROWTH', 'BME Growth (watchlist)', 'active', 'BME Exchange / Indices family', 'Otros Sectores', 'no');

-- Create trigger for updating timestamps
CREATE TRIGGER update_repindex_root_issuers_updated_at
    BEFORE UPDATE ON public.repindex_root_issuers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();