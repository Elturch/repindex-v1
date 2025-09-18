-- Generate sample evaluation data for RepIndex
-- Create 5 comprehensive evaluations with IBEX 35 companies

-- Clear existing data (for clean start)
DELETE FROM public.top_drivers;
DELETE FROM public.recommendations_tactical;
DELETE FROM public.executive_notes;
DELETE FROM public.contadores;
DELETE FROM public.by_metric;
DELETE FROM public.meta_weight_scheme;
DELETE FROM public.source_models;
DELETE FROM public.evaluation;

-- Insert 5 sample evaluations
INSERT INTO public.evaluation (
  id, target_name, target_type, ticker, 
  period_from, period_to, tz,
  composite_chatgpt, composite_perplexity, 
  composite_delta_abs, composite_delta_pct, composite_winner,
  metrics_won_chatgpt, metrics_won_perplexity, metrics_won_ties,
  similarity_note, ejemplo_simulado
) VALUES 
-- Repsol evaluation
(
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'Repsol S.A.', 'empresa', 'REP',
  '2024-01-01', '2024-03-31', 'Europe/Madrid',
  78, 82, 4, 4.87, 'Perplexity',
  2, 5, 1,
  'Análisis comparativo de comunicación corporativa mostrando diferencias menores pero consistentes en el tratamiento de información financiera.',
  false
),
-- Santander evaluation  
(
  '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  'Banco Santander S.A.', 'empresa', 'SAN', 
  '2024-02-01', '2024-04-30', 'Europe/Madrid',
  85, 79, 6, 7.59, 'ChatGPT',
  6, 2, 0,
  'Evaluación del sector bancario con enfoque en sostenibilidad y estrategias de transformación digital.',
  false
),
-- Telefónica evaluation
(
  '6ba7b811-9dad-11d1-80b4-00c04fd430c8', 
  'Telefónica S.A.', 'empresa', 'TEF',
  '2024-01-15', '2024-04-15', 'Europe/Madrid',
  73, 76, 3, 3.95, 'Perplexity',
  3, 4, 1,
  'Análisis del sector telecomunicaciones con énfasis en innovación tecnológica y expansión internacional.',
  false
),
-- Iberdrola evaluation
(
  '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  'Iberdrola S.A.', 'empresa', 'IBE',
  '2024-03-01', '2024-05-31', 'Europe/Madrid', 
  88, 85, 3, 3.41, 'ChatGPT',
  5, 2, 1,
  'Evaluación centrada en energías renovables y compromisos de descarbonización.',
  false
),
-- Inditex evaluation
(
  '6ba7b813-9dad-11d1-80b4-00c04fd430c8',
  'Industria de Diseño Textil S.A.', 'empresa', 'ITX',
  '2024-02-15', '2024-05-15', 'Europe/Madrid',
  81, 81, 0, 0.00, 'Tie',
  4, 4, 0,
  'Análisis del sector retail con enfoque en sostenibilidad y estrategias de omnicanalidad.',
  false
);

-- Insert metric details for each evaluation
INSERT INTO public.by_metric (
  evaluation_id, label, metric, 
  score_chatgpt, score_perplexity, score_delta_abs, score_delta_pct,
  weight, contrib_points_chatgpt, contrib_points_perplexity, contrib_points_delta,
  contrib_share_chatgpt, contrib_share_perplexity
) VALUES 
-- Repsol metrics
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Liderazgo y Narrativa Sostenible', 'LNS', 75, 80, 5, 6.25, 20, 15.0, 16.0, -1.0, 0.192, 0.195),
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Estrategia y Sostenibilidad', 'ES', 82, 85, 3, 3.53, 18, 14.76, 15.3, -0.54, 0.189, 0.187),
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Stakeholder Management', 'SAM', 76, 79, 3, 3.80, 15, 11.4, 11.85, -0.45, 0.146, 0.145),
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Risk Management', 'RM', 79, 84, 5, 5.95, 12, 9.48, 10.08, -0.6, 0.122, 0.123),
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Clarity', 'CLR', 77, 81, 4, 4.94, 10, 7.7, 8.1, -0.4, 0.099, 0.099),
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Governance Impact', 'GIP', 80, 83, 3, 3.61, 10, 8.0, 8.3, -0.3, 0.103, 0.101),
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Key Governance Issues', 'KGI', 78, 82, 4, 4.88, 8, 6.24, 6.56, -0.32, 0.080, 0.080),
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Material Performance Indicators', 'MPI', 81, 84, 3, 3.57, 7, 5.67, 5.88, -0.21, 0.073, 0.072),

-- Santander metrics
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Liderazgo y Narrativa Sostenible', 'LNS', 88, 82, 6, 7.32, 20, 17.6, 16.4, 1.2, 0.207, 0.208),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Estrategia y Sostenibilidad', 'ES', 87, 79, 8, 10.13, 18, 15.66, 14.22, 1.44, 0.184, 0.180),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Stakeholder Management', 'SAM', 83, 77, 6, 7.79, 15, 12.45, 11.55, 0.9, 0.146, 0.146),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Risk Management', 'RM', 86, 80, 6, 7.50, 12, 10.32, 9.6, 0.72, 0.121, 0.122),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Clarity', 'CLR', 84, 78, 6, 7.69, 10, 8.4, 7.8, 0.6, 0.099, 0.099),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Governance Impact', 'GIP', 85, 79, 6, 7.59, 10, 8.5, 7.9, 0.6, 0.100, 0.100),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Key Governance Issues', 'KGI', 82, 78, 4, 5.13, 8, 6.56, 6.24, 0.32, 0.077, 0.079),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Material Performance Indicators', 'MPI', 83, 77, 6, 7.79, 7, 5.81, 5.39, 0.42, 0.068, 0.068),

-- Telefónica metrics
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Liderazgo y Narrativa Sostenible', 'LNS', 71, 74, 3, 4.05, 20, 14.2, 14.8, -0.6, 0.194, 0.195),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Estrategia y Sostenibilidad', 'ES', 74, 77, 3, 3.90, 18, 13.32, 13.86, -0.54, 0.182, 0.182),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Stakeholder Management', 'SAM', 72, 75, 3, 4.00, 15, 10.8, 11.25, -0.45, 0.148, 0.148),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Risk Management', 'RM', 75, 78, 3, 3.85, 12, 9.0, 9.36, -0.36, 0.123, 0.123),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Clarity', 'CLR', 73, 76, 3, 3.95, 10, 7.3, 7.6, -0.3, 0.100, 0.100),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Governance Impact', 'GIP', 74, 77, 3, 3.90, 10, 7.4, 7.7, -0.3, 0.101, 0.101),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Key Governance Issues', 'KGI', 72, 75, 3, 4.00, 8, 5.76, 6.0, -0.24, 0.079, 0.079),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Material Performance Indicators', 'MPI', 73, 76, 3, 3.95, 7, 5.11, 5.32, -0.21, 0.070, 0.070),

-- Iberdrola metrics
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'Liderazgo y Narrativa Sostenible', 'LNS', 90, 87, 3, 3.45, 20, 18.0, 17.4, 0.6, 0.205, 0.205),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'Estrategia y Sostenibilidad', 'ES', 89, 86, 3, 3.49, 18, 16.02, 15.48, 0.54, 0.182, 0.182),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'Stakeholder Management', 'SAM', 87, 84, 3, 3.57, 15, 13.05, 12.6, 0.45, 0.148, 0.148),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'Risk Management', 'RM', 88, 85, 3, 3.53, 12, 10.56, 10.2, 0.36, 0.120, 0.120),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'Clarity', 'CLR', 86, 83, 3, 3.61, 10, 8.6, 8.3, 0.3, 0.098, 0.098),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'Governance Impact', 'GIP', 87, 84, 3, 3.57, 10, 8.7, 8.4, 0.3, 0.099, 0.099),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'Key Governance Issues', 'KGI', 89, 86, 3, 3.49, 8, 7.12, 6.88, 0.24, 0.081, 0.081),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'Material Performance Indicators', 'MPI', 88, 85, 3, 3.53, 7, 6.16, 5.95, 0.21, 0.070, 0.070),

-- Inditex metrics (tie scenario)
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Liderazgo y Narrativa Sostenible', 'LNS', 81, 81, 0, 0.00, 20, 16.2, 16.2, 0.0, 0.200, 0.200),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Estrategia y Sostenibilidad', 'ES', 80, 82, 2, 2.44, 18, 14.4, 14.76, -0.36, 0.178, 0.182),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Stakeholder Management', 'SAM', 82, 80, 2, 2.50, 15, 12.3, 12.0, 0.3, 0.152, 0.148),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Risk Management', 'RM', 79, 81, 2, 2.47, 12, 9.48, 9.72, -0.24, 0.117, 0.120),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Clarity', 'CLR', 83, 81, 2, 2.47, 10, 8.3, 8.1, 0.2, 0.102, 0.100),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Governance Impact', 'GIP', 81, 81, 0, 0.00, 10, 8.1, 8.1, 0.0, 0.100, 0.100),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Key Governance Issues', 'KGI', 80, 82, 2, 2.44, 8, 6.4, 6.56, -0.16, 0.079, 0.081),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Material Performance Indicators', 'MPI', 82, 80, 2, 2.50, 7, 5.74, 5.6, 0.14, 0.071, 0.069);

-- Insert counters (analysis metrics)
INSERT INTO public.contadores (
  evaluation_id, model_key, palabras, num_fechas, num_citas,
  temporal_alignment, citation_density, flags
) VALUES 
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'comparative', 12543, 47, 123, 0.78, 0.098, ARRAY['high_quality', 'complete_dataset']),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'comparative', 15672, 52, 156, 0.82, 0.099, ARRAY['high_quality', 'complete_dataset', 'verified_sources']),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'comparative', 11234, 38, 98, 0.75, 0.087, ARRAY['high_quality', 'partial_dataset']),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'comparative', 16789, 61, 178, 0.85, 0.106, ARRAY['high_quality', 'complete_dataset', 'verified_sources', 'esg_focus']),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'comparative', 13456, 43, 134, 0.79, 0.095, ARRAY['high_quality', 'complete_dataset', 'retail_sector']);

-- Insert executive notes
INSERT INTO public.executive_notes (evaluation_id, note, position) VALUES 
-- Repsol
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Repsol demuestra un compromiso sólido con la transición energética, destacando especialmente en estrategias de descarbonización y desarrollo de energías renovables.', 1),
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'La comunicación sobre sostenibilidad es clara y bien estructurada, aunque podría beneficiarse de mayor detalle en métricas específicas de impacto ambiental.', 2),
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'El enfoque en tecnologías limpias y la innovación en el sector energético posiciona favorablemente a la empresa para futuras regulaciones ESG.', 3),

-- Santander  
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Banco Santander sobresale en liderazgo sostenible del sector financiero, con iniciativas claras de financiación verde y exclusión de sectores controvertidos.', 1),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'La estrategia de transformación digital se integra efectivamente con objetivos ESG, creando sinergias operacionales significativas.', 2),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'La gestión de riesgos climáticos está bien documentada, aunque requiere mayor transparencia en escenarios de estrés específicos.', 3),

-- Telefónica
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Telefónica presenta un enfoque equilibrado en innovación tecnológica y responsabilidad social, con especial énfasis en conectividad inclusiva.', 1),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Las iniciativas de economía circular en infraestructura de telecomunicaciones muestran potencial de escalabilidad considerable.', 2),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'La expansión internacional requiere mayor alineación con estándares ESG locales en mercados emergentes.', 3),

-- Iberdrola
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'Iberdrola lidera el sector energético en transición hacia renovables, con una estrategia clara y métricas de seguimiento robustas.', 1),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'La integración de criterios ESG en decisiones de inversión está bien documentada y alineada con objetivos climáticos internacionales.', 2),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'El compromiso con la descarbonización es ejemplar, estableciendo estándares de referencia para el sector energético español.', 3),

-- Inditex
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Inditex demuestra liderazgo en sostenibilidad del sector textil, con iniciativas innovadoras en economía circular y materiales sostenibles.', 1),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'La estrategia omnicanal se complementa efectivamente con objetivos de reducción de huella de carbono en logística y distribución.', 2),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Las políticas laborales y de derechos humanos en la cadena de suministro requieren mayor transparencia y mecanismos de verificación independiente.', 3);

-- Insert tactical recommendations
INSERT INTO public.recommendations_tactical (evaluation_id, recommendation, position) VALUES 
-- Repsol
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Incrementar la granularidad de métricas de impacto ambiental en reportes trimestrales, incluyendo indicadores específicos por línea de negocio.', 1),
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Desarrollar un dashboard público de seguimiento de objetivos de descarbonización con actualizaciones mensuales.', 2),

-- Santander
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Ampliar la disclosure de escenarios de estrés climático, incluyendo impactos específicos por geografía y segmento de negocio.', 1),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Implementar métricas de impacto social cuantificables para iniciativas de inclusión financiera.', 2),

-- Telefónica  
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Establecer KPIs específicos de sostenibilidad para operaciones en mercados emergentes, alineados con contextos locales.', 1),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Desarrollar una estrategia de comunicación más proactiva sobre iniciativas de economía circular en infraestructura.', 2),

-- Iberdrola
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'Expandir programas de formación en sostenibilidad para empleados, incluyendo certificaciones específicas del sector energético.', 1),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'Crear alianzas estratégicas con startups de tecnología limpia para acelerar la innovación en almacenamiento de energía.', 2),

-- Inditex
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Implementar sistema de trazabilidad blockchain para verificación independiente de condiciones laborales en proveedores.', 1),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Establecer objetivos cuantitativos de reducción de residuos textiles con timeline específico y métricas de seguimiento.', 2);

-- Insert top drivers
INSERT INTO public.top_drivers (evaluation_id, label, metric, direction, delta_contrib_abs) VALUES 
-- Repsol top drivers
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Liderazgo y Narrativa Sostenible', 'LNS', 'favor_perplexity', 1.0),
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Risk Management', 'RM', 'favor_perplexity', 0.6),
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Estrategia y Sostenibilidad', 'ES', 'favor_perplexity', 0.54),

-- Santander top drivers
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Estrategia y Sostenibilidad', 'ES', 'favor_chatgpt', 1.44),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Liderazgo y Narrativa Sostenible', 'LNS', 'favor_chatgpt', 1.2),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'Stakeholder Management', 'SAM', 'favor_chatgpt', 0.9),

-- Telefónica top drivers  
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Liderazgo y Narrativa Sostenible', 'LNS', 'favor_perplexity', 0.6),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Estrategia y Sostenibilidad', 'ES', 'favor_perplexity', 0.54),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'Stakeholder Management', 'SAM', 'favor_perplexity', 0.45),

-- Iberdrola top drivers
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'Liderazgo y Narrativa Sostenible', 'LNS', 'favor_chatgpt', 0.6),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'Estrategia y Sostenibilidad', 'ES', 'favor_chatgpt', 0.54),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'Stakeholder Management', 'SAM', 'favor_chatgpt', 0.45),

-- Inditex top drivers (minimal differences due to tie)
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Estrategia y Sostenibilidad', 'ES', 'favor_perplexity', 0.36),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Stakeholder Management', 'SAM', 'favor_chatgpt', 0.3),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 'Risk Management', 'RM', 'favor_perplexity', 0.24);

-- Insert meta weight schemes (all evaluations use same weight distribution)
INSERT INTO public.meta_weight_scheme (
  evaluation_id, "LNS", "ES", "SAM", "RM", "CLR", "GIP", "KGI", "MPI", total
) VALUES 
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 20, 18, 15, 12, 10, 10, 8, 7, 100),
('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 20, 18, 15, 12, 10, 10, 8, 7, 100),
('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 20, 18, 15, 12, 10, 10, 8, 7, 100),
('6ba7b812-9dad-11d1-80b4-00c04fd430c8', 20, 18, 15, 12, 10, 10, 8, 7, 100),
('6ba7b813-9dad-11d1-80b4-00c04fd430c8', 20, 18, 15, 12, 10, 10, 8, 7, 100);