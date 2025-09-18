-- Add weights and subscores columns to pari_runs table
ALTER TABLE pari_runs 
ADD COLUMN weights JSONB,
ADD COLUMN subscores JSONB;