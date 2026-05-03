CREATE UNIQUE INDEX IF NOT EXISTS documents_rix_run_model_future_uidx
  ON public.documents ((metadata->>'rix_run_id'), (metadata->>'ai_model'))
  WHERE metadata->>'rix_run_id' IS NOT NULL
    AND id > 1262000;