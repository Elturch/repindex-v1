
Objetivo: hacer una auditoría de recuperación del Agente Rix centrada en el punto real de rotura y aplicar una reparación segura, paso a paso, sin “parches” que vuelvan a degradar resultados.

Diagnóstico confirmado tras revisar el código activo y la base:
1. El problema principal está en `supabase/functions/chat-intelligence/index.ts`, no en `src/lib/skills/skillInterpretQuery.ts`.
   - La ruta de producción del agente usa `interpretQueryEdge` y `buildDataPackFromSkills` dentro de la edge function.
   - Arreglar solo `src/lib/...` no restauraría el comportamiento real.

2. La caída encaja con la capa temporal nueva (`// v2.1-temporal`), no con `populate-vector-store`.
   - El parser trimestral/mensual se añadió arriba del pipeline.
   - Pero los skills siguen consultando solo:
     - empresa: últimas 24 filas (`~4 semanas`)
     - sector: últimas 4 semanas
     - ranking: solo último batch
   - Después se aplica un filtro temporal “a posteriori”, cuando ya se han traído datos insuficientes o del periodo equivocado.

3. Ahora mismo el agente puede “decir” un periodo que no corresponde a los datos reales.
   - `temporalRange` reescribe `report_context.date_from/date_to`
   - pero no rehace las queries fuente para ese rango.
   - Resultado: cabecera y narrativa pueden hablar de “enero” o “Q1” usando en realidad abril o solo las últimas 4 semanas.

4. Hay un fallo estructural claro en hospitalarios/seguros.
   - En `public.rix_semantic_groups`, el grupo `grupos_hospitalarios` incluye `SANITAS` dentro de `issuer_ids`.
   - Además, `Sanitas S.A. de Seguros` está en `repindex_root_issuers` con `sector_category = 'Salud y Farmacéutico'`.
   - Y el código no aplica el campo `exclusions` de `rix_semantic_groups`.
   - Conclusión: no es una sensación; hay mezcla real de grupo y sector.

5. Hay inconsistencia entre skills con filtro de modelo.
   - `executeSkillGetCompanyRanking` sí respeta `model_name`.
   - `skillSectorSnapshot` no lo respeta.
   - Resultado: un ranking “según Gemini” puede convivir con medianas sectoriales calculadas sobre los 6 modelos.

6. La forma del DataPack es inconsistente según la ruta.
   - En sector: `metricas_consolidadas = ss.metricas_sector` (objeto plano sectorial)
   - En ranking enriquecido: `metricas_consolidadas = { [ticker]: ... }`
   - El prompt recibe estructuras distintas bajo la misma clave y eso favorece tablas KPI incorrectas o narrativas mezcladas.

7. Hay al menos dos bugs adicionales en la propia función que pueden romper consultas “difíciles”.
   - En el fallback de glosario se reasigna `enrichedQuestion` aunque está declarado como `const`.
   - En ese mismo bloque se llama a `lookupGlossaryTerms(supabase, ...)` cuando la variable activa es `supabaseClient`.
   - Ese camino puede explotar precisamente en consultas ambiguas o complejas.

8. La base sí tiene histórico suficiente para responder enero/trimestres.
   - He comprobado semanas desde enero en `rix_runs_v2`.
   - El problema no es falta de dato; es que el agente no lo está recuperando bien.

Plan de recuperación propuesto

Fase 0 — Contención inmediata para dejar de dar respuestas engañosas
- Cortar el comportamiento más peligroso: no volver a “maquillar” el `report_context` con un rango solicitado si las queries no se han recalculado para ese rango.
- Si una consulta pide mes/trimestre/semestre/año y aún no hay datos reconstruidos para ese intervalo, el agente debe:
  - o responder con datos realmente filtrados por rango,
  - o declarar que no puede construir ese corte todavía.
- Prioridad aquí: dejar de mentir con fechas.

Fase 1 — Reparar la lógica temporal en origen, no al final
Archivo principal:
- `supabase/functions/chat-intelligence/index.ts`

Cambios de diseño:
- Añadir `dateRange` a los skills que hoy trabajan “últimas 4 semanas / último batch”:
  - `skillCompanyProfile`
  - `skillSectorSnapshot`
  - `executeSkillGetSectorComparison`
  - ranking/enrichment cuando la consulta sea temporal
- Para rangos explícitos (enero, Q1, semestre, año):
  - consultar todas las semanas dominicales dentro del intervalo
  - recalcular snapshot/evolución/ranking con esas semanas
  - no filtrar después un conjunto ya recortado
- Ampliar el parser trimestral para formatos reales de usuario:
  - `Q1 2026`
  - `T1 2026`
  - `1T 2026`
  - `primer trimestre de 2026`
- Sustituir el “suelo sintético” de `2026-01-01` en cabeceras por disponibilidad real de datos devueltos, dejando la nota metodológica aparte.

Criterio funcional propuesto:
- Si el usuario pide un periodo explícito, el ranking y las medianas deben calcularse sobre las semanas incluidas en ese periodo, no sobre la última semana disponible fuera de contexto.

Fase 2 — Arreglar grupos hospitalarios y el cruce con seguros
Código + datos a revisar:
- `supabase/functions/chat-intelligence/index.ts`
- `public.rix_semantic_groups`
- posiblemente `public.repindex_root_issuers` si hay clasificación editorial incorrecta

Acciones:
- Corregir la composición de `grupos_hospitalarios` en `rix_semantic_groups`:
  - revisar si `SANITAS` debe salir de `issuer_ids` del grupo hospitalario
- Aplicar por fin `exclusions` en runtime
- Ampliar aliases del grupo para capturar consultas naturales como “hospitales” cuando la intención sea grupo y no sector salud genérico
- Mantener prioridad del grupo cerrado sobre el sector abierto
- Evitar que una consulta de “hospitalarios” caiga por debajo a `Salud y Farmacéutico` salvo que el usuario realmente pida “sector salud”

Fase 3 — Unificar filtros de modelo y datos sectoriales
- Hacer que `skillSectorSnapshot` acepte `modelFilter`
- Cuando haya filtro de modelo:
  - ranking sectorial
  - medianas sectoriales
  - `per_model_detail`
  - evolución
  deben salir todos del mismo subconjunto
- Así se elimina la mezcla actual de “ranking Gemini” + “sector 6 modelos”

Fase 4 — Normalizar el DataPack para que el prompt no se contradiga
- Dar una sola estructura a `metricas_consolidadas`
- Separar explícitamente:
  - `metricas_empresa`
  - `metricas_sector`
  - `metricas_ranking_por_ticker`
  si hacen falta varias vistas
- Añadir metadatos de alcance:
  - `scope: company | sector | ranking`
  - `time_scope: latest_week | selected_range`
- El prompt debe consumir claves distintas según el tipo de consulta, no reinterpretar una misma clave con formas diferentes.

Fase 5 — Corregir bugs secundarios que hoy pueden estar disparando fallos globales
- Arreglar el bloque de glossary fallback:
  - `let enrichedQuestion`
  - usar `supabaseClient`
- Revisar cualquier otro camino de baja confianza que hoy pueda lanzar excepción silenciosa y devolver packs incompletos.

Fase 6 — Añadir una batería de regresión antes de tocar más producción
Ahora no hay tests para esta edge function. Añadiría tests de `chat-intelligence` para cubrir exactamente lo que se ha roto:
- “grupos hospitalarios en enero”
- “grupos hospitalarios según Gemini”
- “Q1 2026 hospitales”
- “sector salud” vs “grupos hospitalarios”
- comprobación de que Sanitas no entra en hospitalarios si esa es la regla editorial final
- validación de que cabecera/fechas salen de los datos reales, no del deseo del usuario
- top/bottom con filtro temporal
- consultas sin rango explícito para asegurar que no rompemos el comportamiento semanal actual

Orden recomendado de implementación
1. Contención de fechas engañosas
2. Reparación temporal en origen
3. Fix de hospitalarios/seguros
4. Filtro de modelo en sector snapshot
5. Normalización del DataPack/prompt
6. Tests de regresión
7. Validación manual con casos reales de enero, Q1 y hospitalarios

Resultado esperado
- Las consultas por enero/trimestre dejarán de “alucinar” periodos
- El agente usará el histórico real que ya existe en `rix_runs_v2`
- “Grupos hospitalarios” dejará de arrastrar seguros por error de grupo/sector
- “Según Gemini” dejará de mezclar datos de seis modelos
- El informe volverá a estar alineado entre datos, fechas, ranking y narrativa

Importante:
No recomiendo revertir a ciegas “todo lo de trimestres”. El fallo no es solo el parser; es que se añadió una capa temporal por encima de skills que seguían diseñados para snapshots semanales. La reparación correcta es volverlos period-aware y cerrar los escapes de grupo/modelo/prompt al mismo tiempo.
