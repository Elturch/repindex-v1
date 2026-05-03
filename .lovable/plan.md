
# Sprint 1 — Fixes bloqueantes QA 2026-05-03

Resultado QA: 45/50 automatizadas + 5/5 manuales pasan a primera vista, pero hay **14 fallos cualitativos** que violan reglas Core de RepIndex (anti-mediana, sectores, familias, alias). Este sprint los cierra antes de seguir.

## Alcance (4 fixes)

### Fix 1 — Sanitizer anti-mediana
**Problema:** Las queries B1-01..03 (rankings IBEX-35) devuelven frases como *"el RIX medio del índice es 57,5"*. Viola Core rule **Anti-Mediana**: nunca usar promedio agregado, siempre comparar los 6 modelos.

**Qué hacer:** Añadir un guard en `supabase/functions/chat-intelligence-v2/guards/` (o el outputGuard existente) que detecte por regex frases tipo `RIX medio|promedio del índice|media del IBEX` y las reescriba o marque `WARNING:CONSOLIDATED_AVERAGE` para que el LLM las regenere comparando los 6 modelos.

### Fix 2 — Thesaurus de subsectores
**Problema:** Query *"top energía"* devuelve sólo 2 empresas de "Petróleo y Energía" e ignora las 15 de "Energía y Gas". El resolver de sectores no consolida sinónimos.

**Qué hacer:** Crear/extender un mapa en `supabase/functions/_shared/semanticGroups.ts` (o un nuevo `sectorResolver.ts`) con sinónimos:
- `energía` → `["Energía y Gas", "Petróleo y Energía"]`
- `banca` → `["Banca y Servicios Financieros"]`
- `retail` → `["Moda y Distribución", "Consumo"]`

Aplicar el mapa antes del filtro SQL en las skills de ranking sectorial.

### Fix 3 — Familias inexistentes (BME Growth, IBEX Top Dividendo)
**Problema:** Query *"top 5 IBEX Top Dividendo"* inventa un ranking en vez de rechazar. *"top 5 IBEX Growth"* tampoco está catalogado.

**Qué hacer:** Añadir códigos de familia conocida a la lista canónica con flag `NOT_AVAILABLE`:
- `BME-GROWTH` → respuesta canónica "Familia no cubierta por RepIndex actualmente"
- `IBEX-TOP-DIVIDENDO` → idem

Que el intent classifier los detecte y devuelva mensaje estándar en vez de pasar al LLM.

### Fix 4 — Alias "Caixa" → CABK
**Problema:** *"analiza Caixa"* no resuelve, mientras "SAN", "ITX", "BBV", "Iberdorla" (con typo) sí. Falta entrada en el resolver de entidades.

**Qué hacer:** Añadir `"caixa" → "CABK"` (CaixaBank) al diccionario de alias del entity resolver, junto con variantes habituales (`la caixa`, `caixabank`).

## Detalles técnicos

- Archivos a tocar (estimado, a confirmar al abrir):
  - `supabase/functions/chat-intelligence-v2/guards/outputGuard.ts` (Fix 1)
  - `supabase/functions/_shared/semanticGroups.ts` (Fix 2)
  - `supabase/functions/chat-intelligence-v2/skills/skillInterpretQuery.ts` o equivalente (Fix 3)
  - Resolver de entidades en `chat-intelligence-v2` (Fix 4)
- Sin cambios de schema en BD. Sin migraciones.
- Sin tocar `repindex_root_issuers`, `rix_runs_v2`, ni vector store.

## Validación tras los fixes

Re-ejecutar las **6 queries afectadas** del subset crítico:
1. `top 5 IBEX-35 esta semana` → no debe aparecer "RIX medio"
2. `top energía` → debe consolidar 17 empresas (15+2)
3. `top retail` → debe consolidar Moda y Consumo
4. `top 5 IBEX Top Dividendo` → debe rechazar limpiamente
5. `top 5 IBEX Growth` → debe rechazar limpiamente
6. `analiza Caixa` → debe resolver a CaixaBank

Si las 6 pasan, Sprint 1 cerrado. Sprint 2 (calidad: comparativas sector vs sector, naming en rankings, delta_filter, etc.) y Sprint 3 (cosmético) quedan para próximas iteraciones.

## Tiempo estimado
~6h de trabajo de implementación + 30 min validación.

## Lo que NO se toca
- Documents, W17 step 2, AVG-Gemini ranking, `repindex_root_issuers_backup_20260503`.
- Ninguna escritura a BD en producción.
