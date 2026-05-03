## Sprint 1 — Cierre Fix 2 (multi-sector thesaurus) + validación

### Estado actual

- `detectMultiSectorTickers` ya existe en `orchestrator.ts` (líneas 62–85) con thesaurus para `energía` y `retail`, pero **nunca se invoca**.
- El subsegment hospitalarios/farma sí está cableado vía `parsed.scope_tickers` (líneas 473–477).
- Skills `sectorRanking.ts` y `comparison.ts` ya consumen `parsed.scope_tickers` con prioridad máxima — no requieren cambios.

### Cambios

**1. `supabase/functions/chat-intelligence-v2/orchestrator.ts`**

Tras el bloque de subsegment (línea 477), añadir cableado del thesaurus multi-sector como segundo nivel de scope:

```ts
// Sprint 1 Fix 2 — Multi-sector thesaurus: when query mentions a broad
// keyword like "energía" or "retail" that maps to MULTIPLE sector_category
// values, inject the union of tickers as scope_tickers. Only applies when
// no subsegment already filled scope_tickers.
if (!parsed.scope_tickers || parsed.scope_tickers.length === 0) {
  const multiSectorTickers = await detectMultiSectorTickers(question, supabase, 15);
  if (multiSectorTickers && multiSectorTickers.length > 0) {
    parsed.scope_tickers = multiSectorTickers;
    if (parsed.intent !== "sector_ranking" && parsed.intent !== "comparison") {
      parsed.intent = "sector_ranking";
    }
    console.log(`${logPrefix} multi-sector thesaurus scope attached | tickers=${multiSectorTickers.length}`);
  }
}
```

Ampliar el thesaurus (línea 62–65) con dos entradas más detectadas en QA:

```ts
{ re: /\bbanca\b|\bbancos?\b|\bfinanciero?s?\b/i, sectors: ["Banca y Servicios Financieros"], label: "banca" },
{ re: /\binmobiliari[oa]s?\b|\bsocimi(?:s)?\b/i, sectors: ["Inmobiliaria", "SOCIMI"], label: "inmobiliario" },
```

(Nota: `banca` es single-sector pero entra aquí para forzar scope explícito y evitar fuzzy resolution que coge solo 1 banco.)

**2. Sin cambios en skills, BD, ni vector store.**

### Validación post-deploy

Ejecutar 6 queries en `/chat` (preview), conversación nueva cada una:

| # | Query | Criterio aceptación |
|---|-------|---------------------|
| 1 | `top 5 IBEX-35 esta semana` | No aparece "RIX medio del índice" ni "mediana"; usa "RIX de referencia" + rango max-min |
| 2 | `ranking sector energía` | ≥10 tickers (Energía y Gas + Petróleo y Energía fusionados) |
| 3 | `top retail` | Incluye empresas de Moda+Distribución+Alimentación+Consumo |
| 4 | `top 5 IBEX Top Dividendo` | Mensaje canónico de no disponible (no inventa datos) |
| 5 | `top 5 IBEX Growth` | Mensaje canónico de no disponible |
| 6 | `analiza Caixa` | Resuelve a CABK / CaixaBank correctamente |

Si alguna falla, revisar logs de `chat-intelligence-v2` y ajustar antes de cerrar Sprint 1.

### Fuera de alcance

- No tocar `repindex_root_issuers`, `rix_runs_v2`, vector store, ni UI.
- No publicar (cambios solo backend, deploy automático).
