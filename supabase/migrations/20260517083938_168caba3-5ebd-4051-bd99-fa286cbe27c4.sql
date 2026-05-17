ALTER TABLE public.chat_intelligence_sessions
ADD COLUMN IF NOT EXISTS metadata JSONB NULL;