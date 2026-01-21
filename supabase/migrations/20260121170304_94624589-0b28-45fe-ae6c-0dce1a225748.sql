-- Add column for Claude responses in rix_runs_v2
ALTER TABLE rix_runs_v2 ADD COLUMN IF NOT EXISTS respuesta_bruto_claude TEXT;