
# Plan: Consenso de crisis — validación empírica + blindaje metodológico + exposición en producto

## Contexto

Hipótesis del usuario: cuando una empresa concentra noticias negativas, las 6 IAs convergen más (rango inter-modelo bajo) que en semanas tranquilas. Si esto se confirma, hay que explicarlo proactivamente para que no se interprete como sesgo editorial nuestro.

La regla `signed-consensus` ya existe en memoria pero no está demostrada con datos ni expuesta al usuario final. Universo: **todas las empresas**, mismo tratamiento (no cherry-picking).

## Fase 1 — Estudio empírico (one-off, sin tocar producto)

Script Python ejecutado fuera de la app que cruza 3 fuentes ya disponibles:

- `rix_runs_v2`: 6 scores por (ticker, semana) → calcula `range = max-min`, `std`, `mean`
- `weekly_theme_tags` (si existe) o `data_quality_reports` + `monitor_reputacional_events` → marcador de polaridad/crisis por semana
- `parity_cited_urls_t1` o conteo de fuentes citadas → proxy de volumen mediático

**Outputs**:
1. CSV `consenso_vs_polaridad.csv` con: ticker, week, mean_rix, range, std, n_eventos_negativos, n_fuentes_citadas, tag_dominante.
2. PDF `estudio_consenso_crisis.pdf` con:
   - Scatter `range` vs `mean_rix` coloreado por polaridad → debe verse cluster bajo-izquierda (RIX bajo + range bajo = consenso de crisis)
   - Boxplot de `range` segmentado por (semana_con_evento_negativo / semana_tranquila / semana_con_evento_positivo)
   - Test estadístico (Mann-Whitney U) sobre la diferencia de `range` entre los 3 grupos, con p-valor y tamaño de efecto
   - Top-10 casos paradigmáticos de "consenso de crisis" detectados
   - Conclusión: confirma o refuta la hipótesis con cifras

Entrega en `/mnt/documents/`. **Sin esto, las fases 2 y 3 no se ejecutan** — si los datos no respaldan la hipótesis, ajustamos el discurso.

## Fase 2 — Nota metodológica pública

Si la fase 1 confirma el patrón, añadir sección en `src/pages/Methodology.tsx`:

**"Tipos de consenso: por qué el acuerdo entre IAs no siempre es buena noticia"**
- Definición de los 3 estados firmados (saludable, de crisis, disperso)
- Por qué ocurre (saliencia informativa, asimetría de cobertura)
- Referencia al estudio empírico de fase 1 como anexo descargable
- Disclaimer: "RepIndex mide percepción algorítmica; cuando los inputs convergen, los outputs convergen. No introducimos polaridad — la detectamos."

Internacionalizar a los 4 idiomas via el motor i18n existente.

## Fase 3 — Métrica derivada en producto

Exponer el **tipo de consenso** en cada informe, sin inventar datos:

1. **Helper compartido** `src/lib/consensusType.ts`:
   ```ts
   classifyConsensus({mean, range}) → 'healthy' | 'crisis' | 'dispersed' | 'neutral'
   // crisis: range≤10 ∧ mean<50
   // healthy: range≤10 ∧ mean≥70
   // dispersed: range>20
   // neutral: resto
   ```
2. **UI**: badge en `ReportInfoBar.tsx` y en cabecera de tarjetas de empresa (`StoryCard`, ranking) — color semántico (rojo crisis, verde healthy, ámbar dispersed) con tooltip que enlaza a la nota metodológica.
3. **Agente Rix**: inyectar `consensus_type` en el datapack de `chat-intelligence-v2` y añadir regla en `prompts/antiHallucination.ts` que obligue a leer el consenso con polaridad (ya está en memoria pero no codificada en prompt).

## Qué NO entra en el plan

- No tocamos el cálculo del RIX ni los pesos.
- No reclasificamos histórico — la métrica se calcula on-the-fly desde `rix_runs_v2`.
- No añadimos columnas a la BD (cálculo derivado, no almacenado).
- No tocamos backend de barrido.

## Detalles técnicos

- Fase 1: script `/tmp/study_consensus.py`, usa `psql` directo si `PGHOST` está disponible, fallback a `supabase--read_query`.
- Fase 2: edición de `Methodology.tsx` + `chatTranslations.ts` + `footerTranslations.ts` si aplica.
- Fase 3: el helper es puro TS, sin estado. Integración no invasiva en componentes existentes. En el agente, modificar `datapack/` para inyectar el campo y `prompts/antiHallucination.ts` para forzar lectura firmada.
- QA visual obligatorio del PDF antes de entregar (convertir páginas a imagen y revisar).

## Orden de ejecución

1. Fase 1 completa y entrega del PDF/CSV → revisión del usuario.
2. Si valida, fase 2 (nota metodológica).
3. Fase 3 (badge + integración en agente).

Cada fase termina con punto de validación antes de pasar a la siguiente.
