-- =============================================
-- FASE 1: Correcciones de Seguridad Seguras
-- No afectan a integraciones de Make
-- =============================================

-- 1. Habilitar RLS en chat_vector_memory
ALTER TABLE public.chat_vector_memory ENABLE ROW LEVEL SECURITY;

-- Políticas para chat_vector_memory (edge functions usan service_role_key, bypasean RLS)
CREATE POLICY "Service role can manage chat_vector_memory"
ON public.chat_vector_memory
FOR ALL
USING (true)
WITH CHECK (true);

-- 2. Habilitar RLS en chat_history
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

-- Políticas para chat_history
CREATE POLICY "Service role can manage chat_history"
ON public.chat_history
FOR ALL
USING (true)
WITH CHECK (true);

-- 3. Restringir acceso a user_profiles (actualmente público)
-- Primero eliminamos políticas existentes si las hay
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.user_profiles;

-- Crear nuevas políticas restrictivas
CREATE POLICY "Users can view own profile"
ON public.user_profiles
FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.user_profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
ON public.user_profiles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all profiles"
ON public.user_profiles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Añadir política DELETE a user_conversations
CREATE POLICY "Users can delete own conversations"
ON public.user_conversations
FOR DELETE
USING (user_id = auth.uid());

-- 5. Añadir política DELETE a user_documents
CREATE POLICY "Users can delete own documents"
ON public.user_documents
FOR DELETE
USING (user_id = auth.uid());