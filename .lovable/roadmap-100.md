# ROADMAP 100% — RepIndex chat-intelligence-v2

## De "Fase 2 cerrada" a "175 empresas estables en todos sus cruces de filtro"

### BLOQUE A — Cerrar Fase 2.5 (hoy pendiente, ~35 min)

A1. Usuario añade 2 Secrets en Supabase Dashboard:

   - PHASE2_STAGING_ONLY = true

   - STRESS_TESTS_HEADER_TOKEN = <32+ chars generado por usuario>

A2. Gate E4 reforzado §6 del plan (4 sub-gates):

   a) phase1-full SIN header -> 21/21 (regresión cero)

   b) phase1-full CON header válido + 3 Secrets Fase 2 = false -> 21/21 (header solo no activa)

   c) phase1-full SIN header + token mal escrito -> 21/21 (fail-closed)

   d) Inspección meta.phase2_isolation_active = true en todas las respuestas

A3. Gates 3-4-5 con protocolo aislado §7:

   - Gate 3: TINY_UNIVERSE_GUARD=true + phase2-tiny CON header (8/8) + phase1-full SIN header (21/21) en paralelo

   - Gate 4: EXEC_NARRATIVE=true + phase2-exec CON header (5/5) + phase1-full SIN header (21/21) en paralelo

   - Gate 5: ENRICH_RANKING_SUBMETRICS=true + phase1-full CON header (21/21) + phase1-full SIN header (21/21) en paralelo

   - Tras cada gate: Secret del flag vuelve a false (aislamiento estricto)

A4. Cierre formal Fase 2:

   - Tabla de 5 gates con timestamps y resultados

   - Checklist D+0/D+7/D+14 preparado SIN ejecutar

   - Estado: COMPLETO, pendiente de activación escalonada

### BLOQUE B — Fase 3: Inventario y Clasificación de la Cartera Real

B1. Extraer de Supabase la lista completa de las 175 empresas activas con:

   - empresa_id, nombre, sector, subsector

   - número de informes generados (chat_logs)

   - cruces de filtro más frecuentes: periodo, geografía, fuente, modelo, tipo_medio

   - tasa de error/warning actual (si hay logs de scope_audit)

   - Query SQL: SELECT empresa, sector, subsector, COUNT(*) as n_informes, array_agg(DISTINCT modelo) as modelos, array_agg(DISTINCT periodo) as periodos FROM chat_logs GROUP BY 1,2,3 ORDER BY n_informes DESC

B2. Clasificar las 175 empresas en familias de estrés por sector:

   - Familia 1: Hoteles + REITs (ya cubierta por phase1-full, 21 celdas)

   - Familia 2: Banca / Seguros / Finanzas

   - Familia 3: Energía / Utilities

   - Familia 4: Retail / Consumo / Distribución

   - Familia 5: Telco / Tecnología / Media

   - Familia 6: Industria / Construcción / Infraestructura

   - Familia 7: Salud / Farma

   - Familia 8: Multisector / Holdings / Otros

   Nota: ajustar familias según la distribución real de las 175 empresas.

B3. Para CADA familia, identificar:

   - Los 3-5 subsectores con más informes

   - Los cruces de filtro problemáticos (basado en scope_audit warnings, errores históricos, parches manuales de los últimos 3 meses)

   - El modelo más usado y el menos usado

   - Si hay universos pequeños (N<=3) que activen tiny-universe guard

### BLOQUE C — Fase 3: Construcción de Matrices de Estrés por Familia

C1. Para cada familia (2-8), crear una spec en stress-matrix-runner/spec.ts:

   - phase3-banca (subsectores top x modelos top x periodos = N celdas)

   - phase3-energia

   - phase3-retail

   - phase3-telco

   - phase3-industria

   - phase3-salud

   - phase3-multi

   Cada spec: entre 10 y 25 celdas (subsector x modelo), ventana 4 semanas.

C2. Asserts por familia (además de S1-S5 + SQL_DIFF que ya existen):

   - F1: Filtro de sector correcto (no mezcla datos de otro sector)

   - F2: Filtro de subsector correcto (no mezcla subsectores dentro del sector)

   - F3: Filtro de periodo correcto (datos dentro de la ventana solicitada)

   - F4: Filtro de geografía correcto (si la empresa tiene foco geográfico)

   - F5: Consistencia numérica (los números del ranking coinciden con los datos de la tabla)

   - F6: Completitud (no faltan empresas que deberían estar en el ranking según los datos de Supabase)

   - F7: No hay empresas fantasma (todas las mencionadas existen en el universo filtrado)

C3. Añadir las specs al selector de StressTestsPanel.tsx y al runner.

C4. Ejecutar cada phase3-X en modo legacy (flags OFF, SIN header):

   - Objetivo: validar que el motor ACTUAL (legacy) pasa los asserts F1-F7 en cada familia

   - Si falla: REGISTRAR exactamente qué assert falla y en qué celda -> esto es el MAPA DE BUGS REAL

   - Si pasa: esa familia ya está estable en legacy

### BLOQUE D — Fase 3: Corrección dirigida de fallos

D1. Con el mapa de bugs de C4, priorizar por impacto:

   - Criticidad 1: assert F1/F2 falla (mezcla sectores/subsectores) = datos incorrectos

   - Criticidad 2: assert F6/F7 falla (completitud/fantasmas) = datos faltantes o inventados

   - Criticidad 3: assert F5 falla (consistencia numérica) = error de cálculo

   - Criticidad 4: assert F3/F4 falla (periodo/geografía) = filtro incompleto

D2. Para cada bug, diagnosticar si el fallo está en:

   a) scopedQuery.ts (query SQL mal construida) -> corregir query

   b) sectorRanking.ts / periodEvolution.ts (lógica de ranking) -> corregir lógica

   c) Prompt que pide datos fuera del scope -> corregir prompt slot

   d) Datos de Supabase inconsistentes (empresa sin sector, subsector mal asignado) -> corregir datos

D3. Cada corrección sigue el protocolo:

   1. Implementar fix

   2. Re-ejecutar phase3-X de la familia afectada -> verificar que el assert pasa

   3. Re-ejecutar phase1-full -> verificar 21/21 (no regresión)

   4. Si regresa -> rollback y rediseñar

### BLOQUE E — Fase 3: Activación gradual de Fase 2 por familia

E1. Con TODAS las familias en verde en legacy (phase3-X todos pass), activar Fase 2 gradualmente:

   - Semana 1 (D+0): Activar ENRICH_RANKING_SUBMETRICS=true globalmente vía header aislado. Ejecutar TODAS las phase3-X CON header + phase1-full SIN header en paralelo.

   - Semana 2 (D+7): Si todo verde, activar TINY_UNIVERSE_GUARD=true. Repetir batería completa.

   - Semana 3 (D+14): Si todo verde, activar EXEC_NARRATIVE=true. Repetir batería completa.

   - Semana 4 (D+21): Si todo verde, proponer PHASE2_STAGING_ONLY=false (desactiva header gating; flags activos para TODOS los usuarios). Decisión del usuario.

E2. Criterios de rollback:

   - Cualquier phase3-X con >0 fail en asserts F1-F7 -> flag a false, diagnosticar

   - Cualquier phase1-full con <21 pass -> flag a false, rollback global

   - Cualquier queja de cliente real durante la semana de activación -> flag a false, investigar

### BLOQUE F — Fase 3: Validación final y estado 100%

F1. Batería completa "phase3-all" (175 empresas representadas en 7-8 familias, ~120-150 celdas totales):

   - Ejecutar con los 3 flags Fase 2 ON

   - Ejecutar con los 3 flags OFF (regresión cero)

   - Ambas verde -> sistema 100% estable

F2. Dashboard de estado permanente en /admin:

   - Tabla resumen por familia: ultimo run, pass/fail, timestamp

   - Semáforo global: verde = todas las familias pass, rojo = alguna falla

   - Historial de activaciones D+X

F3. Monitorización continua (CRON semanal):

   - Re-ejecutar phase3-all automáticamente cada lunes

   - Alerta por email si alguna familia regresa a rojo

   - Log en chat_logs.scope_audit

### TIMELINE ESTIMADO

| Bloque | Duración estimada | Dependencias |

|--------|-------------------|-------------|

| A (cerrar Fase 2.5) | 35 min | Secrets del usuario |

| B (inventario + clasificación) | 2-3 horas | Query SQL + revisión manual |

| C (construir matrices phase3-X) | 4-6 horas | B completo |

| D (corregir fallos) | Variable: 1-3 días según número de bugs | C completo |

| E (activación gradual) | 4 semanas (1 flag/semana) | D completo |

| F (validación final + monitorización) | 2-3 horas setup + continuo | E completo |

Total hasta "100% estable": ~1-2 semanas de trabajo efectivo de implementación + 4 semanas de activación gradual supervisada.

### REGLAS INMUTABLES (heredadas de Fase 1/2)

- Legacy intacto hasta cierre formal de Fase 3

- USE_SCOPED_SKILLS OFF hasta decisión explícita del usuario

- Cosmetic injectors congelados

- Asserts S1-S5 + SQL_DIFF mandatory en todos los runs

- Rollback < 5 min por flag via Supabase Secrets

- No se avanza al siguiente bloque sin que el anterior esté verde

- Cada fix pasa phase1-full antes de aceptarse
