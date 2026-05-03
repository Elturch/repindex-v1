-- Backup of IBEX-35 issuers prior to 2026-05-04 cleanup (ABE.MC + GCO.MC)
CREATE TABLE IF NOT EXISTS public.repindex_root_issuers_backup_20260504 AS
SELECT *, now() AS backup_taken_at
FROM public.repindex_root_issuers
WHERE ibex_family_code = 'IBEX-35';

DO $$
DECLARE
  c integer;
BEGIN
  SELECT COUNT(*) INTO c FROM public.repindex_root_issuers_backup_20260504;
  IF c <> 37 THEN
    RAISE EXCEPTION 'BACKUP FAILED: expected 37 rows, got %', c;
  END IF;
  RAISE NOTICE 'BACKUP OK: % rows snapshotted', c;
END $$;

ALTER TABLE public.repindex_root_issuers_backup_20260504 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ibex backup 20260504"
ON public.repindex_root_issuers_backup_20260504
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));