-- Agregar políticas RLS faltantes para la tabla documents
-- Esta tabla tenía RLS habilitado pero sin políticas, causando warning de seguridad

-- Política de lectura pública para documents
CREATE POLICY "Acceso público de lectura documents" 
ON public.documents 
FOR SELECT 
USING (true);

-- Política de inserción restringida para documents  
CREATE POLICY "Inserción restringida documents" 
ON public.documents 
FOR INSERT 
WITH CHECK (false); -- Solo permitir via funciones administrativas

-- Política de actualización restringida para documents
CREATE POLICY "Actualización restringida documents" 
ON public.documents 
FOR UPDATE 
USING (false); -- No permitir updates directos

-- Política de eliminación restringida para documents
CREATE POLICY "Eliminación restringida documents" 
ON public.documents 
FOR DELETE 
USING (false); -- No permitir deletes directos

-- Los documentos son para búsqueda vectorial y deben ser gestionados
-- por procesos administrativos, no por usuarios finales