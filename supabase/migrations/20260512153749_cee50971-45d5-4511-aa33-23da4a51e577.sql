-- Clean up hung stress run f1c7e535-920d-46ee-8e23-23415d985184
-- 12 cases stuck in 'pending' for >45 minutes due to missing fetch timeout.
UPDATE stress_results
SET status = 'error',
    error_message = 'TIMEOUT: runner hung (fetch had no timeout). Manual cleanup after fix.'
WHERE run_id = 'f1c7e535-920d-46ee-8e23-23415d985184'
  AND status = 'pending';

UPDATE stress_runs
SET status = 'completed',
    finished_at = now(),
    notes = 'concurrency=3 weeks=4 cases=21 | completed after timeout cleanup | 6 passed, 3 failed, 12 errored (timeout)'
WHERE id = 'f1c7e535-920d-46ee-8e23-23415d985184';