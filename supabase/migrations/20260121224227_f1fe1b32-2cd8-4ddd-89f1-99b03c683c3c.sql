-- Add new AI models used in RIX V2 pipeline to api_cost_config
-- Perplexity Sonar Pro
INSERT INTO api_cost_config (provider, model, input_cost_per_million, output_cost_per_million)
VALUES ('perplexity', 'sonar-pro', 3.00, 15.00)
ON CONFLICT (provider, model) DO UPDATE SET
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  updated_at = now();

-- xAI Grok 3
INSERT INTO api_cost_config (provider, model, input_cost_per_million, output_cost_per_million)
VALUES ('xai', 'grok-3', 3.00, 15.00)
ON CONFLICT (provider, model) DO UPDATE SET
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  updated_at = now();

-- DeepSeek Chat
INSERT INTO api_cost_config (provider, model, input_cost_per_million, output_cost_per_million)
VALUES ('deepseek', 'deepseek-chat', 0.14, 0.28)
ON CONFLICT (provider, model) DO UPDATE SET
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  updated_at = now();

-- Google Gemini 2.5 Pro (used in search)
INSERT INTO api_cost_config (provider, model, input_cost_per_million, output_cost_per_million)
VALUES ('gemini', 'gemini-2.5-pro-preview-05-06', 1.25, 10.00)
ON CONFLICT (provider, model) DO UPDATE SET
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  updated_at = now();

-- Anthropic Claude Opus 4
INSERT INTO api_cost_config (provider, model, input_cost_per_million, output_cost_per_million)
VALUES ('anthropic', 'claude-opus-4-20250514', 15.00, 75.00)
ON CONFLICT (provider, model) DO UPDATE SET
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  updated_at = now();

-- Alibaba Qwen Max
INSERT INTO api_cost_config (provider, model, input_cost_per_million, output_cost_per_million)
VALUES ('alibaba', 'qwen-max', 1.60, 6.40)
ON CONFLICT (provider, model) DO UPDATE SET
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  updated_at = now();

-- GPT-4.1 Mini (used in search)
INSERT INTO api_cost_config (provider, model, input_cost_per_million, output_cost_per_million)
VALUES ('openai', 'gpt-4.1-mini', 0.40, 1.60)
ON CONFLICT (provider, model) DO UPDATE SET
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  updated_at = now();

-- GPT-4o (used in analysis)
INSERT INTO api_cost_config (provider, model, input_cost_per_million, output_cost_per_million)
VALUES ('openai', 'gpt-4o-2024-11-20', 2.50, 10.00)
ON CONFLICT (provider, model) DO UPDATE SET
  input_cost_per_million = EXCLUDED.input_cost_per_million,
  output_cost_per_million = EXCLUDED.output_cost_per_million,
  updated_at = now();

-- Add pipeline_stage column to api_usage_logs for V2 tracking
ALTER TABLE api_usage_logs 
ADD COLUMN IF NOT EXISTS pipeline_stage text,
ADD COLUMN IF NOT EXISTS ticker text,
ADD COLUMN IF NOT EXISTS batch_id text;