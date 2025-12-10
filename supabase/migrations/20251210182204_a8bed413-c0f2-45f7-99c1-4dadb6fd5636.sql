-- Create table for storing response feedback/ratings
CREATE TABLE public.chat_response_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  message_content TEXT NOT NULL,
  user_question TEXT,
  rating TEXT NOT NULL CHECK (rating IN ('positive', 'negative')),
  feedback_comment TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  included_in_vector_store BOOLEAN DEFAULT false,
  vector_store_included_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_response_feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "Users can insert own feedback"
ON public.chat_response_feedback
FOR INSERT
WITH CHECK ((user_id = auth.uid()) OR (user_id IS NULL));

-- Users can view their own feedback
CREATE POLICY "Users can view own feedback"
ON public.chat_response_feedback
FOR SELECT
USING ((user_id = auth.uid()) OR (user_id IS NULL));

-- Admins can view all feedback
CREATE POLICY "Admins can view all feedback"
ON public.chat_response_feedback
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update feedback (for vector store inclusion)
CREATE POLICY "Admins can update feedback"
ON public.chat_response_feedback
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for efficient queries
CREATE INDEX idx_chat_response_feedback_rating ON public.chat_response_feedback(rating);
CREATE INDEX idx_chat_response_feedback_included ON public.chat_response_feedback(included_in_vector_store);
CREATE INDEX idx_chat_response_feedback_session ON public.chat_response_feedback(session_id);