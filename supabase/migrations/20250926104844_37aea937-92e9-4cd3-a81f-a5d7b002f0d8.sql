-- Completar políticas RLS para trading_status_audit
-- Agregar las políticas faltantes para evitar warnings de seguridad

-- Política para INSERT (restringida)
CREATE POLICY "Inserción restringida audit" 
ON public.trading_status_audit 
FOR INSERT 
WITH CHECK (false); -- Solo permitir inserts vía funciones administrativas

-- Política para UPDATE (restringida)  
CREATE POLICY "Actualización restringida audit" 
ON public.trading_status_audit 
FOR UPDATE 
USING (false); -- No permitir updates

-- Política para DELETE (restringida)
CREATE POLICY "Eliminación restringida audit" 
ON public.trading_status_audit 
FOR DELETE 
USING (false); -- No permitir deletes

-- Esta tabla es solo para auditoría y transparencia, por lo que las operaciones
-- de escritura están restringidas para mantener la integridad histórica