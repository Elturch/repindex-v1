-- Añadir política de lectura pública para analytics en Admin (solo preview)
CREATE POLICY "Public read for analytics"
ON public.role_enrichment_analytics
FOR SELECT
USING (true);

-- Añadir política de lectura pública para preferencias de rol
CREATE POLICY "Public read for role preferences"
ON public.user_role_preferences
FOR SELECT
USING (true);