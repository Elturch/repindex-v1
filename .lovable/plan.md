

# Plan: Insertar un Experto SQL (F2) en el pipeline del Agente Rix

## Problema actual

El E2 (DataPack) es **100% hardcoded**. Ejecuta las mismas consultas fijas para todas las preguntas, independientemente de lo que pregunte el usuario. No hay ningún paso NL→SQL en el pipeline actual.

Existe `execute_sql` en la base de datos (RPC, read-only, timeout 5s), pero el pipeline nunca lo usa.

Resultado: si el usuario pregunta algo que no encaja en las 2 rutas fijas (Route A: empresa, Route B: índice), el sistema devuelve un DataPack vacío o irrelevante.

## Arquitectura propuesta

Insertar una fase **F2: SQL Expert** entre el clasificador (E1) y el ensamblador de DataPack (E2). El flujo queda:

```text
E1 (Clasificador)
  ↓
F2 (SQL Expert) ← NUEVO: LLM genera queries SQL óptimas según la pregunta
  ↓
E2 (DataPack Builder) ← Ahora recibe datos dinámicos de F2 además de sus queries fijas
  ↓
E3-E5-E6 (sin cambios)
```

### F2: SQL Expert - Diseño

**Modelo**: `gpt-4o-mini` (rápido, barato, excelente en SQL)

**Input**: La pregunta original + el resultado del clasificador (E1) + el esquema de tablas disponibles

**Output**: Un array de queries SQL de solo lectura, cada una con un `label` que indica qué dato aporta al DataPack

**Prompt del SQL Expert** incluirá:
- Esquema completo de `rix_runs_v2` (columnas, tipos, significado de cada campo)
- Esquema de `repindex_root_issuers` (tickers, sectores, competidores verificados)
- Esquema de `corporate_snapshots`, `corporate_news`, `rix_trends`
- Reglas: solo SELECT, máx 5 queries, timeout 5s cada una, usar `.range()` patterns
- Ejemplos de queries bien formadas para cada tipo de intención (diagnóstico, ranking, evolución, comparativa, métrica específica)
- Regla del Snapshot Dominical: solo considerar `batch_execution_date` de domingos con ≥180 registros
- Regla anti-truncamiento: LIMIT con valores razonables, usar medianas no promedios

**Ejecución**: Cada query generada se ejecuta via `supabase.rpc('execute_sql', { sql_query })` con timeout y validación de resultado.

**Fallback**: Si F2 falla (LLM no responde, SQL inválido, timeout), se ejecuta el E2 hardcoded actual como safety net.

### Cambios en E2 (DataPack Builder)

E2 pasa de ser el generador de queries a ser el **ensamblador**:
1. Recibe los resultados de F2 (datos dinámicos)
2. Los mapea al DataPack existente (snapshot, ranking, evolucion, etc.)
3. Si F2 no trajo ciertos datos, complementa con las queries fijas actuales (fallback parcial)
4. El DataPack resultante es idéntico en estructura -- E3/E4/E5/E6 no cambian

### Cambios en roles (`src/lib/chatRoles.ts`)

Reescribir los 6 roles para eliminar fabricación de contenido (aprobado en plan anterior, se ejecuta en paralelo):
- Eliminar "Kit de Respuesta", "Protocolo de Acción", "Cascada de Decisiones", "Roadmap ESG", "Stakeholder Map Político", "Plan Talent-Brand"
- Cada rol pasa a ser una **lente analítica**: cambia el ángulo de lectura pero nunca autoriza a inventar

### Control de temperatura

- Gemini: `temperature: 0.3` en `streamGeminiResponse`
- o3: `reasoning_effort: "medium"` en `streamOpenAIResponse`

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/chat-intelligence/index.ts` | Nueva función `generateSQLQueries()` (F2), modificar `buildDataPack()` para usar resultados de F2, temperature/reasoning_effort |
| `src/lib/chatRoles.ts` | Reescribir los 6 roles como lentes analíticas |

## Riesgos y mitigaciones

- **SQL injection**: `execute_sql` ya valida solo SELECT. F2 genera queries, no las recibe del usuario.
- **Timeout**: Cada query tiene 5s de timeout. Si falla, fallback al E2 hardcoded.
- **Coste**: `gpt-4o-mini` para F2 añade ~$0.001 por consulta. Negligible.
- **Regresión**: El E2 hardcoded se mantiene como fallback completo. Si F2 falla, el sistema funciona igual que antes.

