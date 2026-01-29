-- Add session configuration columns to user_conversations
ALTER TABLE user_conversations 
ADD COLUMN IF NOT EXISTS session_depth_level text DEFAULT 'complete',
ADD COLUMN IF NOT EXISTS session_role_id text DEFAULT 'general';

COMMENT ON COLUMN user_conversations.session_depth_level IS 
'Nivel de profundidad configurado para toda la sesión: quick, complete, exhaustive';

COMMENT ON COLUMN user_conversations.session_role_id IS 
'ID del rol/perfil seleccionado para toda la sesión. Ej: ceo, periodista, general';