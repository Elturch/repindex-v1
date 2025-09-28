-- Delete all duplicate PARI run entries, keeping only the most recent one for each company-period combination
WITH duplicates_to_delete AS (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "03_target_name", "06_period_from", "07_period_to" 
        ORDER BY created_at DESC
      ) as rn
    FROM pari_runs
    WHERE "06_period_from" IS NOT NULL AND "07_period_to" IS NOT NULL
  ) ranked
  WHERE rn > 1
)
DELETE FROM pari_runs 
WHERE id IN (SELECT id FROM duplicates_to_delete);