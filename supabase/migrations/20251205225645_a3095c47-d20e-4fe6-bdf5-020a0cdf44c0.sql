-- Actualizar políticas RLS de chat_intelligence_sessions para filtrar por user_id
DROP POLICY IF EXISTS "Acceso público lectura chat_intel" ON public.chat_intelligence_sessions;
DROP POLICY IF EXISTS "Acceso público inserción chat_intel" ON public.chat_intelligence_sessions;
DROP POLICY IF EXISTS "Acceso público eliminación chat_intel" ON public.chat_intelligence_sessions;

-- Política de lectura: usuarios ven sus propias conversaciones O conversaciones sin user_id (compatibilidad)
CREATE POLICY "Users can view own sessions"
ON public.chat_intelligence_sessions
FOR SELECT
USING (user_id = auth.uid() OR user_id IS NULL);

-- Política de inserción: usuarios insertan con su user_id o null
CREATE POLICY "Users can insert own sessions"
ON public.chat_intelligence_sessions
FOR INSERT
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Política de eliminación: usuarios eliminan sus propias conversaciones
CREATE POLICY "Users can delete own sessions"
ON public.chat_intelligence_sessions
FOR DELETE
USING (user_id = auth.uid());