# V1 Quality Contract — Agente Rix (chat-intelligence monolítico)

> Documento de referencia para la migración a V2. V2 debe igualar o superar
> CADA punto de este contrato antes de poder ser declarado producción.
>
> **V1 sigue activo en producción.** La ruta `chat-intelligence` permanece
> intacta. V2 se cocina detrás del flag `?agent=v2` / `localStorage` /
> `getTrafficSplit()` (actualmente 0 en producción).

---

## 1. Configuración del motor V1

| Parámetro | Valor V1 |
|---|---|
| Provider primario | OpenAI |
| Modelo primario | `o3` |
| `reasoning_effort` | `medium` |
| `temperature` | `0` (efectivamente determinista; o3 ignora temp pero se envía 0) |
| `max_completion_tokens` por turno | hasta 32 000 (algunas llamadas 16 000) |
| Auto-continuación | **Sí**. Hasta **4 turnos** si `finish_reason === "length"`. Tope global ~120 000 tokens acumulados. |
| Timeout por turno | 90 s (primario) |
| Fallback | Gemini 2.5 Pro (`gemini-2.5-pro`) directo, mismo prompt, mismo system, sin reasoning |
| Streaming | SSE token-a-token |

Fuente: `supabase/functions/_deprecated_chat-intelligence/index.ts` y
`supabase/functions/_deprecated_chat-intelligence/streamOpenAI.ts`
(monolito previo a la modularización del 22-abr-2026).

## 2. Las 40 capacidades del prompt monolítico V1

Todas presentes en el prompt de sistema y/o en los bloques pre-renderizados
que V1 inyectaba en el `userMessage`:

1.  Titular-Respuesta en negrita en el primer párrafo.
2.  Estructura de 8 secciones canónicas (Contexto, KPIs, Modelos, Evolución,
    Competidores, Análisis, Recomendaciones, Fuentes) + Ficha metodológica.
3.  Tabla 8 KPIs con `media / inicio→fin / Δ / min / max / SD (volatilidad)`.
4.  Detección de **3+ findings** comunes a varios modelos.
5.  Detalle por modelo (cobertura, score, deltas) — bloque "Visión por IA".
6.  Desglose por modelo × KPI (matriz 6×8).
7.  **Consensos**: KPIs donde ≥4 de 6 modelos coinciden en banda.
8.  **Disensos**: KPIs con σ inter-modelo > umbral.
9.  Serie temporal multi-semana con Δ vs semana previa.
10. Comparativa multi-empresa con ranking sectorial.
11. Posición competitiva vs verified_competitors (no fallback a sector).
12. Sub-segmentación canónica (grupos hospitalarios, eléctricas, supermercados).
13. Énfasis temático detectado (semantic bridge → instrucción al LLM).
14. Doctrina temporal estricta (data floor 2026-01-01, no extrapolar).
15. Anti-hallucination ruleset.
16. Coverage rules (parcial vs total, % de cobertura, banner obligatorio).
17. Anti-fabrication: prohibido inventar KPIs fuera de NVM/DRM/SIM/RMM/CEM/GAM/DCM/CXM.
18. Bloque de divergencia inter-modelo (σ y nivel low/medium/high).
19. Bloque de recomendaciones accionables (mín. 5, GEO/AISO).
20. Bloque de citado de fuentes verificadas (URLs reales por dominio).
21. Bloque de Source Tier (T1/T2/T3/T4 hierarchy).
22. Resumen del período (RIX medio, tendencia, métrica más fuerte/débil/volátil).
23. Análisis empresa por empresa en rankings sectoriales.
24. Patrón narrativo OBLIGATORIO: párrafo → tabla → párrafo de cierre.
25. Etiquetado preciso `volatilidad temporal (SD)` vs `dispersión inter-modelo (σ)`.
26. Multilingual thesaurus (ES/EN/PT/CA) en normalize-query + base prompt + post-render.
27. Internationalization: idioma de respuesta = idioma del usuario.
28. Lentes analíticas (DirCom, CEO, ESG, etc.) como interpretación, no rol.
29. Sanitización de jerga interna ("DataPack", "skill", "sweep_id"…).
30. Estilo didáctico-narrativo, sin acrónimos sin desplegar la primera vez.
31. Detección de top-N en query y cap [3, 35].
32. **Price anchoring**: incluir precio de acción y delta % cuando aplica.
33. Regresión estadística always-on (correlación RIX-precio, R², muestra).
34. **Ficha metodológica completa**: período declarado vs disponible, modelos,
    observaciones, divergencia con σ y snapshot de referencia.
35. Marker `<!--CITED_SOURCES_HERE-->` para sustituir bibliografía full.
36. Per-company source list en rankings (top 5 dominios por empresa).
37. Renderizado de evolución temporal con semáforo + Δ + nº modelos por semana.
38. Categorías dominantes / flags dominantes por consenso.
39. Crisis detection (RIX o CEM < 40 → `crisis_scan` skill).
40. Bibliografía scoping: solo URLs del entity/scope solicitado, no leak entre runs.

## 3. Outputs canonical de referencia

Snapshots reales generados por V1 (fuera de Git por tamaño; el usuario los
conserva localmente). V2 debe ser indistinguible o superior en estructura,
riqueza interpretativa y densidad cuantitativa para estos cuatro casos:

| Caso | Query | Notas |
|---|---|---|
| BBVA | "Analiza la reputación de BBVA Q1 2026" | Empresa única, periodo trimestral, narrativa rica multi-sección. |
| Banca (sector) | "Ranking del sector banca Q1 2026" | sector_ranking, top 15, contexto competitivo. |
| Hospiten | "Reputación de Grupo Hospiten" | Empresa no IBEX, sub-sector salud, fallback a evidencia cualitativa. |
| paella-trap | "Cuál es la mejor paella" | Out-of-scope guard rejection con tono editorial. |

Referencia HTML real entregada por el usuario:
`repindex_informe_2026-04-23_09-50-03.html` (V1 + plantilla frontend).

## 4. Estado de tráfico

- Producción default = **V1** (`getEdgeFunctionName()` → `chat-intelligence`).
- `getTrafficSplit()` = `0` en prod (sin override). Verificado en
  `src/lib/agentVersion.ts`.
- Override preview: `?agent=v2` o `localStorage["repindex.agentVersion"] = "v2"`.
- Kill-switch global: secret `CHAT_V2_KILL_SWITCH` (declarado en Fase 1,
  cableado en Fase 4).

## 5. Compromiso

Hasta que V2 demuestre igualar o superar los 40 puntos anteriores en los
cuatro casos canonical, **V1 NO se retira**. El _deprecated path_ del
monolito se mantiene como copia de seguridad versionada.