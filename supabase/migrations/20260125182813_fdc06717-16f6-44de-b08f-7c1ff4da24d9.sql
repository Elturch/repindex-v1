-- Insert GPT-5 pricing in api_cost_config (estimated based on GPT-4o pricing tier)
INSERT INTO api_cost_config (provider, model, input_cost_per_million, output_cost_per_million)
VALUES ('openai', 'gpt-5', 5.00, 15.00)
ON CONFLICT DO NOTHING;