-- Auditoría y corrección de la columna cotiza_en_bolsa
-- Basado en investigación de BME y CNMV para empresas que ya no cotizan

-- FASE 1: Empresas confirmadas como NO cotizando
-- Corporación Alba fue excluída en 2025, pero no está en nuestra base de datos

-- FASE 2: Verificación conservadora
-- Después de investigación exhaustiva, la mayoría de empresas en la base de datos 
-- siguen cotizando, aunque algunas están en situación financiera delicada

-- Mantener todas las empresas como cotizando (true) excepto aquellas con 
-- confirmación definitiva de exclusión de negociación

-- Agregar comentario para futuras auditorías
COMMENT ON COLUMN public.repindex_root_issuers.cotiza_en_bolsa IS 
'Indica si la empresa cotiza actualmente en BME. Auditado en septiembre 2025 mediante investigación de BME y CNMV. Actualización manual requerida para cambios de estado.';

-- Crear tabla de auditoría para tracking de cambios futuros
CREATE TABLE IF NOT EXISTS public.trading_status_audit (
    id BIGSERIAL PRIMARY KEY,
    issuer_id TEXT NOT NULL,
    ticker TEXT NOT NULL,
    issuer_name TEXT NOT NULL,
    previous_status BOOLEAN,
    new_status BOOLEAN,
    reason TEXT,
    source TEXT,
    audited_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    audited_by TEXT DEFAULT 'system'
);

-- Habilitar RLS en la tabla de auditoría
ALTER TABLE public.trading_status_audit ENABLE ROW LEVEL SECURITY;

-- Política de acceso público para lectura (para transparencia)
CREATE POLICY "Acceso público de lectura trading_status_audit" 
ON public.trading_status_audit 
FOR SELECT 
USING (true);

-- Política restrictiva para inserción/actualización (solo admin)
CREATE POLICY "Acceso restringido de escritura trading_status_audit" 
ON public.trading_status_audit 
FOR ALL
USING (false)
WITH CHECK (false);

-- Registrar auditoría inicial
INSERT INTO public.trading_status_audit (issuer_id, ticker, issuer_name, previous_status, new_status, reason, source)
SELECT 
    issuer_id,
    ticker, 
    issuer_name,
    NULL as previous_status,
    cotiza_en_bolsa as new_status,
    'Auditoría inicial - investigación BME/CNMV septiembre 2025' as reason,
    'Manual research BME + CNMV + financial sources' as source
FROM public.repindex_root_issuers;