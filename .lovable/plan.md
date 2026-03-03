
Diagnóstico confirmado (con evidencia):
1) El sistema sí tiene datos del IBEX-35 en base de datos, pero el pipeline los está perdiendo antes de narrar.
   - rix_runs_v2: última semana 2026-03-01 con 1050 filas, 175 compañías, 6 modelos.
   - IBEX-35 en esa semana: 210 filas.
2) La petición que falló fue panorámica de índice (sin empresa explícita): “haz una valoración panorámica del IBEX…”.
3) En el código actual, E2 devuelve DataPack vacío cuando no hay empresa detectada:
   - `buildDataPack()` corta en `if (classifier.empresas_detectadas.length === 0) return pack;`
   - Resultado: consultas de índice/sector quedan sin datos aunque sí existan.
4) Hay inconsistencias de código IBEX que empeoran el problema:
   - se usa `"IBEX35"` en varios sitios, pero en DB el valor canónico es `"IBEX-35"`.

Objetivo del arreglo:
- Garantizar que consultas “IBEX-35 / sector / ganadores-perdedores” construyan DataPack real desde SQL (sin invención).
- Reestructurar el flujo en 8 pasos con traductor lenguaje natural → SQL + ejecución validada.
- Eliminar definitivamente respuestas tipo “no hay datos” cuando sí hay datos disponibles.

Plan de implementación (secuenciado):

Bloque 1 — Contención urgente (hotfix para que vuelva a responder bien ya)
1. Añadir rama de DataPack para consultas sin empresa (índice/sector/comparativa)
   - Archivo: `supabase/functions/chat-intelligence/index.ts`
   - En E2 (`buildDataPack`), reemplazar el early return por enrutado:
     - Ruta A: empresa específica (comportamiento actual).
     - Ruta B: análisis de índice/sector (nueva), construyendo snapshot/ranking/evolución agregados del universo objetivo.
2. Normalizar código canónico IBEX
   - Sustituir comparaciones `IBEX35` por `IBEX-35` en filtros de `companiesCache` y fallbacks.
   - Centralizar constantes:
     - `const IBEX35_CODE = "IBEX-35"`
     - `const IBEX35_LABEL = "IBEX-35"`
3. Endurecer mensaje “sin datos”
   - Solo permitir “no dispongo de datos” si SQL devuelve cero filas tras ejecutar consultas válidas (no por ausencia de empresa detectada).

Bloque 2 — Refactor a pipeline de 8 pasos (anclado a SQL)
4. Reorganizar pipeline actual E1-E6 a 8 fases explícitas:
   - F1 Router de intención (empresa/índice/sector/comparativa/metodología)
   - F2 Traductor NL→SQL (plantillas + parámetros, sin SQL libre del LLM)
   - F3 Validador SQL (solo SELECT, tablas permitidas, columnas permitidas, límites/rangos)
   - F4 Ejecutor SQL (RPC `execute_sql` read-only o query builder equivalente)
   - F5 Ensamblador DataPack (snapshot, ranking, evolución, divergencia, competidores verificados)
   - F6 Lector cualitativo (raw texts + explicaciones)
   - F7 Comparador analítico (gaps reales y evidencia)
   - F8 Orquestador/maquetador (narrativa final + compliance gate)
5. Contratos de datos entre fases
   - Definir estructuras tipadas por fase para evitar silencios:
     - `QueryPlan`, `ValidatedQueryPlan`, `SqlResultBundle`, `DataPack`.
   - Si una fase devuelve vacío, registrar causa estructurada (no dejarlo implícito).

Bloque 3 — Catálogo SQL para consultas panorámicas (evitar alucinación)
6. Implementar plantillas SQL deterministas por intención:
   - “Top N IBEX-35 semana actual”
   - “Ganadores/perdedores por sector en IBEX-35”
   - “Ranking por métrica”
   - “Evolución 4 semanas del IBEX-35”
   - “Divergencia entre modelos”
7. Añadir guardrails funcionales:
   - Si no hay empresa y la intención es índice/sector, usar catálogo SQL de índice (no ruta empresa).
   - Si usuario pide IBEX-35, forzar `ibex_family_code = 'IBEX-35'`.
   - Validar cobertura mínima de modelos antes de afirmar conclusiones.

Bloque 4 — Observabilidad y pruebas de no regresión
8. Telemetría por fase (en `pipeline_logs`):
   - `phase`, `intent`, `query_template_id`, `row_count`, `empty_reason`.
9. Pruebas funcionales (mínimo):
   - Caso A: pregunta panorámica IBEX-35 sin empresa → debe devolver ranking y sectores.
   - Caso B: pregunta de empresa concreta → debe mantener comportamiento actual.
   - Caso C: IBEX-35 con filtros de sector → no debe responder “sin datos” si hay filas.
   - Caso D: ausencia real de datos (semana vacía) → mensaje transparente correcto.
10. Pruebas de integridad anti-fabricación:
   - Verificar que salida solo cite métricas presentes en DataPack.
   - Mantener compliance gate anti “pilares/fake frameworks” activo.

Archivos/zonas a tocar en implementación:
- `supabase/functions/chat-intelligence/index.ts`
  - `runClassifier` (enrutado robusto índice/sector)
  - `buildDataPack` (rama sin empresa + agregados IBEX/sector)
  - constantes y filtros `IBEX35` → `IBEX-35`
  - orquestador: reglas de “sin datos” basadas en resultado SQL real
  - introducción de fases F2/F3/F4 (planner/validator/executor)
- (si procede) nuevo módulo interno en la misma función para catálogo SQL y validación de plantillas.

Criterios de aceptación:
1) La consulta “valoración panorámica del IBEX-35, ganadores y perdedores por sector” devuelve datos reales (no DataPack vacío).
2) Nunca aparece “no hay datos del IBEX-35” mientras existan filas en `rix_runs_v2` para esa semana.
3) Todas las secciones del informe quedan trazables a resultados SQL de fases F2-F4.
4) Se elimina la dependencia de “empresa detectada” para análisis de índice/sector.
5) Se mantiene el protocolo anti-alucinación ya aplicado (sin pilares, sin frameworks inventados).

Riesgos y mitigación:
- Riesgo: ampliar demasiado consultas y subir latencia.
  - Mitigación: plantillas SQL acotadas, límites explícitos, índices existentes, paginación/range.
- Riesgo: romper flujo actual de empresa.
  - Mitigación: mantener ruta empresa intacta y añadir pruebas A/B por intención.
- Riesgo: inconsistencia de códigos de familia.
  - Mitigación: constante única `IBEX35_CODE = 'IBEX-35'` usada en todo el flujo.
