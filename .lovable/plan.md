
# Informes RIX — módulo paralelo con filtros bidireccionales y salida idéntica a Agente RIX V2

## 1. Confirmación clave

**Sí**, los 11 filtros funcionan **juntos o por separado**, con **cascada bidireccional** (descendente clásica + ascendente auto-fill). Y **el informe final es exactamente el mismo formato que produce hoy Agente RIX V2 en `/chat`**: narrativa completa, los **9 epígrafes canónicos**, tabla cross-model, recomendaciones GEO, **Fuentes verificadas** y **Bibliografía**.

La única diferencia respecto al chat: el `ParsedQuery` que alimenta a las skills V2 **no se construye con LLM** a partir de texto libre; se **compila desde el estado de filtros**. Cero adivinación, cero deriva semántica, datos garantizados.

---

## 2. Cómo se conecta el filtro con el motor V2 existente

Agente RIX V2 ya tiene el pipeline completo (lo respeta esta memoria: `agente-rix-skills-pipeline-v2`, `pdf-export-unified-engine`, `bibliography-scoping-protocol`, `cross-model-grounding-table`, `actionable-geo-recommendations`, `estructura-informe-canonica`):

```text
ParsedQuery ──► Skill V2 (sectorRanking | companyAnalysis |
                         comparison | divergence | evolution)
            ──► DataPack (métricas + raw_rows + cited_sources_report)
            ──► Prompt modules (snapshotMode | rankingMode | …)
            ──► LLM síntesis narrativa (9 epígrafes)
            ──► verifiedSourcesAdapter ──► Bibliography
            ──► pdf-export-unified-engine
```

El plan **NO toca** ese pipeline. Lo **reutiliza** desde una nueva ruta de entrada:

```text
FilterState (UI Informes RIX)
   │
   ▼
compileToParsedQuery()       ← determinista, 0 LLM
   │
   ▼
execute(skill, parsed, …)    ← mismas skills V2 del chat
   │
   ▼
mismo SkillOutput + mismos prompt_modules + mismo render
   │
   ▼
informe idéntico al del chat (9 epígrafes + fuentes + bibliografía)
```

`compileToParsedQuery(filterState): ParsedQuery` produce exactamente la struct de `supabase/functions/chat-intelligence-v2/types.ts`:

- `intent` ← Tipo de informe (filtro 0): `ranking`→`sector_ranking`, `comparativa`→`comparison`, `evolución`→`period_evolution`, `divergencia`→`model_divergence`, `perfil`→`company_analysis`, `visión general`→ se resuelve a `sector_ranking` o `company_analysis` según scope.
- `entities` ← empresas seleccionadas (o derivadas del scope).
- `temporal` ← ventana + granularidad → `from`, `to`, `snapshots_expected`, `snapshots_available`.
- `models` ← chips de modelos.
- `mode` ← `snapshot` si granularidad=snapshot, si no `period`.
- `scope_tickers` ← cuando el usuario eligió empresas explícitas dentro de un sector/universo (respeta `data-pack-scope-integrity`).
- `raw_question` / `effective_question` ← string sintetizada legible: *"Ranking IBEX-35 en Gemini, semanas 2026-02-01 a 2026-05-03, métrica RIXc, top 35"*. Se usa solo para logs y como fallback de los parsers (`top N`, etc.).

Resultado: las skills V2 reciben un input **bien formado, validado y trazable**, y producen el mismo informe que ya hacen hoy.

---

## 3. Filtros bidireccionales (resumen del modelo confirmado)

Los **11 filtros + filtro 0 (intención)**, cada uno con tres estados (`free` / `user-set` / `derived`):

```text
 0. Tipo de informe          ← gobierna visibilidad y skill destino
 1. Universo / Índice        ← IBEX-35, Continuo, Custom
 2. Sector                   ← Banca, Telecom, Energía…
 3. Subsector
 4. Empresa / Ticker         ← multi-select
 5. Modelos IA               ← 1..6
 6. Ventana temporal         ← presets + date range
 7. Granularidad             ← snapshot / semanal / mensual / trimestral
 8. Métrica eje              ← NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM, RIXc
 9. Top N                    ← solo Ranking
10. Orden                    ← desc / asc / divergencia
11. Tipo de fuente           ← todas / regulatorias / medios / propias
```

**Cascada bidireccional**:
- Empresa → auto-fill de Sector y Universo (estado `derived`, chip "auto", botón desbloquear).
- Sector → restringe opciones de Empresa.
- Dos empresas de sectores distintos → Sector se vuelve multi-valor `derived` ("Banca, Telecom") y la barra superior recomienda Tipo="Comparativa".
- Modelos=1 → oculta Tipo="Divergencia" (R12).
- Empresa fuera de cobertura del modelo en la ventana → banner amarillo ofreciendo ajustar ventana.

**Motor de coherencia** (`coherenceEngine.ts`) con 15 reglas declarativas que se evalúan en cada cambio (auto-fill, deshabilitar opciones imposibles, banners, nunca borra elección del usuario sin avisar). Reglas detalladas idénticas a la versión anterior del plan (R1–R15).

---

## 4. Flujo end-to-end y garantía de "9 epígrafes + bibliografía"

1. Usuario ajusta filtros en `/informes`. `FilterPanel` mantiene `FilterState`.
2. Cada cambio dispara `coherenceEngine` → propaga derivados, deshabilita opciones, muestra avisos.
3. `reports-preview-count` (edge function, debounce 250 ms) ejecuta solo `SELECT count(*), distinct ticker, distinct period_from, distinct model FROM rix_runs_v2 WHERE …`. Devuelve contadores y 5 filas de muestra. **No** invoca skills ni LLM.
4. Usuario clica **"Generar informe"**.
5. `reports-generate` (edge function nueva) hace:
   a. `compileToParsedQuery(filterState)` → `ParsedQuery` validado.
   b. Selecciona skill V2 (`sectorRanking | companyAnalysis | comparison | divergence | periodEvolution`) por `intent`.
   c. `await skill.execute({ parsed, supabase, logPrefix })` → `SkillOutput { datapack, prompt_modules, metadata }` con `cited_sources_report` poblado por la skill (memoria `bibliography-scoping-protocol`).
   d. Construye prompt de síntesis con los **mismos `prompt_modules`** que usa el chat (snapshot/period/ranking/comparison/divergence/evolution). Estructura forzada por `estructura-informe-canonica` → **9 epígrafes**:
      1. Headline + diagnóstico
      2. Tabla cross-model (grounding table, anti-mediana)
      3. Análisis por modelo (6 IAs)
      4. Patrones / consenso / divergencias
      5. Sub-métricas (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM)
      6. Evolución / deltas
      7. Contexto sectorial / competidores verificados
      8. Recomendaciones GEO accionables
      9. Cierre y metodología (con fechas exactas del datapack)
   e. Llama LLM de síntesis (mismo modelo y mismos parámetros que el chat — memoria `estrategia-jerarquica-modelos-chat-intelligence`).
   f. Pasa `cited_sources_report` por `verifiedSourcesAdapter.toVerifiedSources(report, period_from, period_to)` → array `VerifiedSourceWire[]` que alimenta la sección **Fuentes verificadas + Bibliografía** (mismo `verifiedSourceExtractor.ts` y `generateBibliographyHtml` que usa el PDF actual).
   g. Persiste en `rix_reports` (id, user_id, filter_state jsonb, parsed_query jsonb, datapack jsonb, output_md, output_html, verified_sources jsonb, created_at).
   h. Devuelve markdown + html + sources.
6. Frontend renderiza con el **mismo componente de mensaje del chat** (`ChatMessages` reutilizable o un wrapper equivalente) para garantía visual 100% idéntica, y ofrece exportar PDF vía `pdf-export-unified-engine` ya existente.

**Garantía dura**: el informe sale por las **mismas funciones de render, los mismos prompt modules, las mismas skills, el mismo adapter de bibliografía y el mismo PDF engine** que Agente RIX V2. Lo único nuevo es el origen del `ParsedQuery`.

---

## 5. UX (recordatorio del layout)

```text
┌──────────────────────────────────┬──────────────────────────────────┐
│  PANEL DE FILTROS (sticky)       │  VISTA PREVIA EN VIVO            │
│  ¿Qué quieres hacer? (chips)     │  35 empresas · 6 IA · 14 sem     │
│  ▼ Alcance (Universo/Sector/…)   │  2.940 observaciones             │
│  ▼ Modelos IA                    │  Muestra (5 filas)               │
│  ▼ Tiempo (ventana + granular.)  │  ⚠️ avisos coherencia             │
│  ▼ Métricas (eje, top N, orden)  │                                  │
│  [Limpiar]  [Guardar vista]      │  [   Generar informe   ]         │
└──────────────────────────────────┴──────────────────────────────────┘
```

Tras "Generar informe" la pantalla cambia a vista de informe (idéntica al chat) con botones **Exportar PDF / HTML / TXT / JSON** (mismos que `ChatIntelligence.tsx`).

---

## 6. Coexistencia con Agente RIX

```text
                      rix_runs_v2 (datos)
                              │
              ┌───────────────┴───────────────┐
              │                               │
       skills-v2 (lib compartida importada como módulo Deno)
              │                               │
              ▼                               ▼
      /chat (Agente RIX)              /informes (Informes RIX)
      texto libre + LLM parser        filtros + compile determinista
      (sin tocar)                     (nuevo)
```

**Cero modificaciones** a `ChatIntelligence.tsx`, `chat-intelligence-v2/index.ts`, skills, prompt modules, adapter, PDF engine, tablas `chat_*`. Solo se **importan** las skills desde la nueva edge function.

Botón "Informes RIX" en `Header.tsx` junto al chat. Página `/mis-informes` con historial.

---

## 7. Estructura técnica nueva

```text
src/
  pages/
    RixReports.tsx                     ← /informes (panel + preview + render)
    MyRixReports.tsx                   ← /mis-informes
  components/reports/
    FilterPanel.tsx                    ← 12 filtros con estado tri-valor
    FilterBlock.tsx                    ← bloque colapsable
    LivePreview.tsx                    ← contadores + sample 5 filas
    ReportView.tsx                     ← reutiliza ChatMessages render
    IntentChips.tsx                    ← filtro 0 destacado
  lib/reports/
    filterState.ts                     ← tipos FilterState + estado tri-valor
    coherenceEngine.ts                 ← 15 reglas declarativas
    filterDependencies.ts              ← grafo descendente + ascendente
    compileToParsedQuery.ts            ← FilterState → ParsedQuery V2
    filterPresets.ts                   ← "IBEX última semana", "Banca trimestre"…
supabase/functions/
  reports-preview-count/index.ts       ← count + sample, sin LLM
  reports-generate/index.ts            ← importa skills v2, genera informe
  _shared/skills-v2/                   ← (ya existe en chat-intelligence-v2)
```

Tabla nueva (migración):

```sql
create table public.rix_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  filter_state jsonb not null,
  parsed_query jsonb not null,
  datapack jsonb,
  output_md text,
  output_html text,
  verified_sources jsonb,
  created_at timestamptz not null default now()
);
alter table public.rix_reports enable row level security;
create policy "users own reports"  on public.rix_reports for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

---

## 8. Fases de implementación

1. **Fase 1** — `FilterPanel` + `coherenceEngine` + `LivePreview` + `reports-preview-count`. Sin generar informe. Validar UX con datos reales.
2. **Fase 2** — `compileToParsedQuery` + `reports-generate` importando skills V2 + render con `ChatMessages` + export PDF. Output idéntico al chat.
3. **Fase 3** — Tabla `rix_reports` + página `/mis-informes` con historial y re-export.
4. **Fase 4** — URLs compartibles, presets guardados, métricas de adopción comparadas con chat.

---

## 9. Decisiones a confirmar

1. **Tipo de informe por defecto**: ¿"Visión general" preseleccionado o vacío forzando elección?
2. **Auto-fill ascendente**: ¿agresivo (al elegir empresa, sector y universo se auto-rellenan al instante, recomendado) o pasivo (sugerencia con botón "aplicar")?
3. **Conflictos al desbloquear un derivado**: ¿bloquear "Generar" hasta resolver, o permitir generar con warning visible en el informe final?
4. **Filtro 11 (Tipo de fuente)**: ¿incluir en MVP o dejar para Fase 4?
