-- Create table for logging API usage
CREATE TABLE public.api_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  edge_function TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  action_type TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create table for API cost configuration
CREATE TABLE public.api_cost_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_cost_per_million NUMERIC(10, 4) NOT NULL,
  output_cost_per_million NUMERIC(10, 4) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(provider, model)
);

-- Enable RLS
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_cost_config ENABLE ROW LEVEL SECURITY;

-- RLS policies for api_usage_logs (admin read-only, service role insert)
CREATE POLICY "Admins can view api usage logs"
ON public.api_usage_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- RLS policies for api_cost_config (admin full access)
CREATE POLICY "Admins can view api cost config"
ON public.api_cost_config
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can update api cost config"
ON public.api_cost_config
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Create indexes for efficient querying
CREATE INDEX idx_api_usage_logs_created_at ON public.api_usage_logs(created_at DESC);
CREATE INDEX idx_api_usage_logs_edge_function ON public.api_usage_logs(edge_function);
CREATE INDEX idx_api_usage_logs_provider ON public.api_usage_logs(provider);
CREATE INDEX idx_api_usage_logs_action_type ON public.api_usage_logs(action_type);

-- Insert initial pricing data (January 2025)
INSERT INTO public.api_cost_config (provider, model, input_cost_per_million, output_cost_per_million) VALUES
  ('openai', 'gpt-4o', 2.50, 10.00),
  ('openai', 'gpt-4o-mini', 0.15, 0.60),
  ('openai', 'o3', 10.00, 40.00),
  ('openai', 'o3-mini', 1.10, 4.40),
  ('openai', 'text-embedding-3-small', 0.02, 0.00),
  ('openai', 'text-embedding-3-large', 0.13, 0.00),
  ('gemini', 'gemini-2.5-flash', 0.075, 0.30),
  ('gemini', 'gemini-2.5-flash-lite', 0.01, 0.05),
  ('gemini', 'gemini-2.0-flash', 0.10, 0.40),
  ('gemini', 'gemini-1.5-pro', 1.25, 5.00);