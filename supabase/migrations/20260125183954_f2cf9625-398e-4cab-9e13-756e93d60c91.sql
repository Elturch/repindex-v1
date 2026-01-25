-- Insert missing Gemini models pricing in api_cost_config
INSERT INTO api_cost_config (provider, model, input_cost_per_million, output_cost_per_million)
VALUES 
  ('gemini', 'gemini-3-pro-preview', 1.50, 6.00),
  ('gemini', 'gemini-2.5-pro', 1.25, 10.00)
ON CONFLICT DO NOTHING;