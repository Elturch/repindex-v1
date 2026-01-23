-- Limpiar sweep_progress para reiniciar el barrido completo
DELETE FROM sweep_progress WHERE sweep_id LIKE '2026%';

-- También limpiar rix_trends para evitar conflictos
DELETE FROM rix_trends WHERE batch_week >= '2026-01-19';