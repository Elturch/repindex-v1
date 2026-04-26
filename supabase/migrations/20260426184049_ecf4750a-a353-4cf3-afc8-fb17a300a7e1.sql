-- Reset de los 5 huérfanos del sweep 2026-W18 (BBVA, ANA, FER, GIGA, EXOLUM-PRIV)
-- Quedaron en status='pending' con started_at puesto pero sin worker_id durante 17h+
-- por crash del worker antes de marcar 'processing'. El cleanup del orchestrator
-- solo busca status='processing', así que se quedaron en zona ciega.

UPDATE public.sweep_progress
SET started_at = NULL,
    worker_id = NULL,
    fase = 0,
    retry_count = 0,
    error_message = 'Reset manual (W18): huerfano pending+started_at sin worker durante 17h+',
    updated_at = NOW()
WHERE sweep_id = '2026-W18'
  AND status = 'pending'
  AND ticker IN ('BBVA','ANA','FER','GIGA','EXOLUM-PRIV');

-- Disparo manual del orchestrator en modo auto_recovery para procesar los 5 ya
INSERT INTO public.cron_triggers (action, params, status)
VALUES (
  'auto_recovery',
  jsonb_build_object('sweep_id', '2026-W18', 'forced', true, 'reason', 'manual_orphan_reset'),
  'pending'
);