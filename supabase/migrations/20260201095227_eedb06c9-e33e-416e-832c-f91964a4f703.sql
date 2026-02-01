-- Add worker_id column for parallel worker tracking
ALTER TABLE sweep_progress 
ADD COLUMN IF NOT EXISTS worker_id INTEGER;

-- Add index for efficient worker queries
CREATE INDEX IF NOT EXISTS idx_sweep_progress_worker_id 
ON sweep_progress(sweep_id, worker_id) 
WHERE worker_id IS NOT NULL;

-- Create atomic claim function with optimistic locking
CREATE OR REPLACE FUNCTION claim_next_sweep_company(
  p_sweep_id TEXT,
  p_worker_id INTEGER
) 
RETURNS TABLE(id UUID, ticker TEXT, issuer_name TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT sp.id 
    FROM sweep_progress sp
    WHERE sp.sweep_id = p_sweep_id 
      AND sp.status = 'pending'
    ORDER BY sp.fase, sp.ticker
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE sweep_progress sp
  SET 
    status = 'processing',
    started_at = NOW(),
    worker_id = p_worker_id,
    updated_at = NOW()
  FROM claimed
  WHERE sp.id = claimed.id
  RETURNING sp.id, sp.ticker, sp.issuer_name;
END;
$$;