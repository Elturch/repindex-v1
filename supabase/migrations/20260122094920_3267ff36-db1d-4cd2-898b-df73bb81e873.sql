-- Actualizar precios reales de IAs enero 2025

-- Perplexity sonar-pro: $3/$15 per million tokens
UPDATE api_cost_config SET 
  input_cost_per_million = 3.00,
  output_cost_per_million = 15.00,
  updated_at = NOW()
WHERE provider = 'perplexity' AND model = 'sonar-pro';

-- Grok 3 (xAI): $3/$15 per million tokens
UPDATE api_cost_config SET 
  input_cost_per_million = 3.00,
  output_cost_per_million = 15.00,
  updated_at = NOW()
WHERE provider = 'xai' AND model = 'grok-3';

-- DeepSeek chat: $0.14/$0.28 per million tokens (muy barato)
UPDATE api_cost_config SET 
  input_cost_per_million = 0.14,
  output_cost_per_million = 0.28,
  updated_at = NOW()
WHERE provider = 'deepseek' AND model = 'deepseek-chat';

-- Gemini 2.5 Pro Preview: $1.25/$10 per million tokens
UPDATE api_cost_config SET 
  input_cost_per_million = 1.25,
  output_cost_per_million = 10.00,
  updated_at = NOW()
WHERE provider = 'gemini' AND model = 'gemini-2.5-pro-preview-05-06';

-- GPT-4.1-mini: $0.40/$1.60 per million tokens
UPDATE api_cost_config SET 
  input_cost_per_million = 0.40,
  output_cost_per_million = 1.60,
  updated_at = NOW()
WHERE provider = 'openai' AND model = 'gpt-4.1-mini';

-- Qwen-max (Alibaba): $1.60/$6.40 per million tokens
UPDATE api_cost_config SET 
  input_cost_per_million = 1.60,
  output_cost_per_million = 6.40,
  updated_at = NOW()
WHERE provider = 'alibaba' AND model = 'qwen-max';

-- GPT-4o: $2.50/$10 per million tokens
UPDATE api_cost_config SET 
  input_cost_per_million = 2.50,
  output_cost_per_million = 10.00,
  updated_at = NOW()
WHERE provider = 'openai' AND model = 'gpt-4o';

-- O3: $10/$40 per million tokens (el más caro - PREMIUM)
UPDATE api_cost_config SET 
  input_cost_per_million = 10.00,
  output_cost_per_million = 40.00,
  updated_at = NOW()
WHERE provider = 'openai' AND model = 'o3';