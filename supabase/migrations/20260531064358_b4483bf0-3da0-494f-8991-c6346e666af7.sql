UPDATE public.cron_triggers
SET status = 'completed',
    processed_at = now(),
    result = COALESCE(result, '{}'::jsonb) || jsonb_build_object('obsoleted_by', 'model_name_canonical_fix')
WHERE action = 'repair_analysis'
  AND status IN ('pending', 'processing')
  AND params->'only_models' ?| array['Gemini', 'DeepSeek'];

INSERT INTO public.cron_triggers (action, params, status)
VALUES ('auto_recovery', '{}'::jsonb, 'pending');