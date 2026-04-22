-- Add a JSON column to user_conversations to persist the last report context.
-- This enables backend recovery of the structured conversational context
-- ({entity, ticker, intent, period_from, period_to, models}) without
-- relying on fragile regex over assistant text.
ALTER TABLE public.user_conversations
ADD COLUMN IF NOT EXISTS last_report_context jsonb;

COMMENT ON COLUMN public.user_conversations.last_report_context IS
'Structured report context from the last successful assistant turn: {company, ticker, sector, intent, period_from, period_to, models}. Used by the chat-intelligence-v2 backend to inherit context for follow-up queries.';