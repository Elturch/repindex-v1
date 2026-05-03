# Plan: Batería QA RIX v2 — 54 queries

## Decisiones tomadas
- **Concurrencia:** 3 curl paralelos (~37 min total)
- **Auth:** Anónimo (anon key) — refleja el peor caso de cliente nuevo
- **Disparo:** Adelante sin listado verbatim previo (criterio AI)
- **Modo:** Híbrido — 49 queries via curl SSE + 5 manuales en /chat

## Ejecución (al aprobar paso a build mode)

### Bloque 1 — Inventario y preparación (2 min)
- Confirmar endpoint `/chat-intelligence-v2` operativo con 1 ping
- Generar fichero `/tmp/qa_queries.json` con las 49 queries automatizables agrupadas en 10 bloques temáticos

### Bloque 2 — Ejecución batería automatizada (37 min)
- Script bash con 3 workers paralelos consumiendo la cola
- Cada query: payload SSE → captura full response → extrae header coverage, lista entidades, métricas, banners de error
- Timeout 90s por query, 3 reintentos en caso de 5xx
- Output incremental a `/mnt/documents/qa_battery_2026-05-03.csv` con columnas: `block, id, query, expected_class, actual_summary, pass_fail, failure_class, snippet`

### Bloque 3 — Validación manual (usuario, 5 min)
Te paso 5 queries para ejecutar tú en `/chat` (las que requieren contexto de sesión real):
1. `top 5 IBEX-35 esta semana` → header debe decir "5 sobre 35 posibles"
2. `evolución Inditex últimas 4 semanas`
3. `divergencia entre modelos para Iberdrola`
4. `top 3 banca y energía comparadas`
5. `top 5 IBEX Growth` → debe responder "no disponible en BD"

### Bloque 4 — Triage e informe (10 min)
- Clasificación de fallos por las 8 clases definidas (`IDENTIFY_INDEX`, `IDENTIFY_SECTOR`, `IDENTIFY_ENTITY`, `WINDOW_RESOLUTION`, `COVERAGE_BANNER`, `HALLUCINATION`, `SILENT_EMPTY`, `WRONG_COUNT`, más cualquier emergente)
- Tabla resumen: bloque × clase × count
- Lista priorizada de fixes propuestos (sin ejecutar) con ubicación archivo:línea sospechosa
- Si <5 fallos críticos → propuesta fix individual; si ≥5 → propuesta de refactor por categoría

### Bloque 5 — Entregables
- `/mnt/documents/qa_battery_2026-05-03.csv` (datos crudos)
- `/mnt/documents/qa_report_2026-05-03.md` (informe ejecutivo)
- Mensaje final con: % pass, top 5 fallos críticos, propuesta de fixes ordenada

## Restricciones (respetadas)
- Cero writes en BD salvo fallo crítico de invariante (poco probable)
- Documents intacto, W17 paso 2 pausado, ranking AVG-Gemini pausado
- Backup `repindex_root_issuers_backup_20260503` no se toca
- Guardrail invariante IBEX-35=35 sigue activo
- No se aplican fixes de catálogo (consolidación sectores) hasta ver fallos reales

## Tiempo total estimado
~55 min (37 batería + 5 manuales paralelas + 10 triage + 3 buffer)

## Tras aprobación
Arranco directamente con bloque 1 y te aviso cuando tengas que ejecutar las 5 manuales mientras yo proceso el triage.
