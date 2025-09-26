-- Añadir empresas privadas (no cotizadas) a Repindex
-- Insertar las 20 empresas que no cotizan en bolsa con todos los campos requeridos

INSERT INTO public.repindex_root_issuers (
  issuer_id,
  issuer_name,
  ticker,
  sample_query,
  ibex_status,
  languages,
  geography,
  sector_category,
  cotiza_en_bolsa,
  status,
  prueba,
  include_terms,
  exclude_terms
) VALUES
  ('MERC-PRIV', 'Mercadona', 'MERC-PRIV', 'Mercadona supermercados distribución alimentación', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Distribución', false, 'active', 'no', '["Mercadona"]'::jsonb, '[]'::jsonb),
  ('ECI-PRIV', 'El Corte Inglés', 'ECI-PRIV', 'El Corte Inglés grandes almacenes retail moda', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Moda y Distribución', false, 'active', 'no', '["El Corte Inglés", "ECI"]'::jsonb, '[]'::jsonb),
  ('CEPSA-PRIV', 'Cepsa', 'CEPSA-PRIV', 'Cepsa petróleo refinería hidrocarburos energía', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Petróleo y Energía', false, 'active', 'no', '["Cepsa"]'::jsonb, '[]'::jsonb),
  ('MUTUA-PRIV', 'Mutua Madrileña', 'MUTUA-PRIV', 'Mutua Madrileña seguros automóviles', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Seguros', false, 'active', 'no', '["Mutua Madrileña", "Mutua"]'::jsonb, '[]'::jsonb),
  ('FCC-PRIV', 'FCC', 'FCC-PRIV', 'FCC construcción servicios concesiones infraestructuras', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Construcción', false, 'active', 'no', '["FCC"]'::jsonb, '[]'::jsonb),
  ('ABERTIS-PRIV', 'Abertis', 'ABERTIS-PRIV', 'Abertis concesiones autopistas infraestructuras transporte', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Construcción', false, 'active', 'no', '["Abertis"]'::jsonb, '[]'::jsonb),
  ('MAHOU-PRIV', 'Mahou San Miguel', 'MAHOU-PRIV', 'Mahou San Miguel cerveza bebidas alimentación', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Alimentación', false, 'active', 'no', '["Mahou", "San Miguel"]'::jsonb, '[]'::jsonb),
  ('DAMM-PRIV', 'Damm', 'DAMM-PRIV', 'Damm cerveza bebidas Estrella Damm alimentación', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Alimentación', false, 'active', 'no', '["Damm", "Estrella Damm"]'::jsonb, '[]'::jsonb),
  ('FREIX-PRIV', 'Freixenet', 'FREIX-PRIV', 'Freixenet cava champán bebidas vino alimentación', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Alimentación', false, 'active', 'no', '["Freixenet"]'::jsonb, '[]'::jsonb),
  ('CAMPO-PRIV', 'Campofrío (Sigma Food Group)', 'CAMPO-PRIV', 'Campofrío embutidos cárnicos alimentación', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Alimentación', false, 'active', 'no', '["Campofrío", "Sigma Food Group"]'::jsonb, '[]'::jsonb),
  ('COSENT-PRIV', 'Cosentino', 'COSENT-PRIV', 'Cosentino materiales cuarzo encimeras industria', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Industria', false, 'active', 'no', '["Cosentino"]'::jsonb, '[]'::jsonb),
  ('ANTOLIN-PRIV', 'Grupo Antolín', 'ANTOLIN-PRIV', 'Grupo Antolín automoción componentes interior vehículos', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Automoción', false, 'active', 'no', '["Grupo Antolín", "Antolín"]'::jsonb, '[]'::jsonb),
  ('AGRO-PRIV', 'Agrolimen', 'AGRO-PRIV', 'Agrolimen holding alimentación galletas', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Alimentación', false, 'active', 'no', '["Agrolimen"]'::jsonb, '[]'::jsonb),
  ('MASOR-PRIV', 'Grupo MASORANGE', 'MASOR-PRIV', 'MASORANGE telecomunicaciones móvil Orange MásMóvil', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Telecomunicaciones', false, 'active', 'no', '["MASORANGE", "Orange", "MásMóvil"]'::jsonb, '[]'::jsonb),
  ('EXOLUM-PRIV', 'Exolum (antes CLH)', 'EXOLUM-PRIV', 'Exolum CLH logística hidrocarburos energía almacenamiento', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Petróleo y Energía', false, 'active', 'no', '["Exolum", "CLH"]'::jsonb, '[]'::jsonb),
  ('RENFE-PRIV', 'Renfe', 'RENFE-PRIV', 'Renfe transporte ferroviario trenes AVE', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Transporte', false, 'active', 'no', '["Renfe"]'::jsonb, '[]'::jsonb),
  ('CORREOS-PRIV', 'Correos', 'CORREOS-PRIV', 'Correos logística paquetería postal envíos', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Logística', false, 'active', 'no', '["Correos"]'::jsonb, '[]'::jsonb),
  ('EROSKI-PRIV', 'Eroski', 'EROSKI-PRIV', 'Eroski supermercados distribución alimentación', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Distribución', false, 'active', 'no', '["Eroski"]'::jsonb, '[]'::jsonb),
  ('PESCANOVA-PRIV', 'Nueva Pescanova', 'PESCANOVA-PRIV', 'Nueva Pescanova pesca congelados mariscos alimentación', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Alimentación', false, 'active', 'no', '["Nueva Pescanova", "Pescanova"]'::jsonb, '[]'::jsonb),
  ('TELEPIZZA-PRIV', 'Telepizza Brands', 'TELEPIZZA-PRIV', 'Telepizza pizza delivery restauración comida rápida', 'private', ARRAY['es', 'en'], ARRAY['ES'], 'Restauración', false, 'active', 'no', '["Telepizza"]'::jsonb, '[]'::jsonb);

-- Comentario actualizado sobre el contenido de la tabla
COMMENT ON TABLE public.repindex_root_issuers IS 'Tabla de emisores del índice reputacional. Contiene 133 empresas cotizadas + 20 empresas privadas = 153 empresas totales';