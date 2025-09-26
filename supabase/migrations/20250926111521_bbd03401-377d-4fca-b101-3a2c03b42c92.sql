-- Asignar números de fase a las 20 empresas privadas recién añadidas
-- Organizándolas en 4 fases nuevas (28-31) con 5 empresas cada una

-- Fase 28: Distribución y Retail
UPDATE public.repindex_root_issuers 
SET fase = 28 
WHERE issuer_id IN ('MERC-PRIV', 'ECI-PRIV', 'EROSKI-PRIV', 'CORREOS-PRIV', 'TELEPIZZA-PRIV');

-- Fase 29: Energía y Petróleo 
UPDATE public.repindex_root_issuers 
SET fase = 29 
WHERE issuer_id IN ('CEPSA-PRIV', 'EXOLUM-PRIV', 'RENFE-PRIV', 'MUTUA-PRIV', 'FCC-PRIV');

-- Fase 30: Construcción e Infraestructuras
UPDATE public.repindex_root_issuers 
SET fase = 30 
WHERE issuer_id IN ('ABERTIS-PRIV', 'COSENT-PRIV', 'ANTOLIN-PRIV', 'MASOR-PRIV', 'AGRO-PRIV');

-- Fase 31: Alimentación y Bebidas
UPDATE public.repindex_root_issuers 
SET fase = 31 
WHERE issuer_id IN ('MAHOU-PRIV', 'DAMM-PRIV', 'FREIX-PRIV', 'CAMPO-PRIV', 'PESCANOVA-PRIV');

-- Verificar la asignación
SELECT 'Verificación de fases asignadas' as resultado;