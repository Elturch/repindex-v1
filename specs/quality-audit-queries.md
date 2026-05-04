# Catálogo de queries — Quality Audit RIX V2

24 queries organizadas en 6 familias. Cada una se ejecuta contra `chat-intelligence-v2` (no-stream) y se evalúa con la rúbrica de 7 dimensiones.

## Formato JSON exportado

El runner consume directamente la sección `queries` (JSON). Mantén sincronizado este markdown con el JSON.

```json
{
  "version": "1.0",
  "queries": [
    { "id": "S1", "family": "snapshot", "question": "¿Cómo está la reputación de Iberdrola esta semana?", "expects": { "intent": "company_analysis", "mode": "snapshot", "must_mention": ["Iberdrola","IBE"], "must_not_match": ["mediana"] } },
    { "id": "S2", "family": "snapshot", "question": "Dame el RIX actual de Inditex con detalle por IA", "expects": { "intent": "company_analysis", "mode": "snapshot", "must_mention": ["Inditex","ChatGPT","Perplexity","Gemini","DeepSeek","Grok","Qwen"] } },
    { "id": "S3", "family": "snapshot", "question": "Reputación algorítmica de Banco Santander hoy", "expects": { "intent": "company_analysis", "mode": "snapshot", "must_mention": ["Santander","SAN"] } },
    { "id": "S4", "family": "snapshot", "question": "Estado actual de Telefónica en percepción IA", "expects": { "intent": "company_analysis", "mode": "snapshot", "must_mention": ["Telefónica","TEF"] } },

    { "id": "P1", "family": "period", "question": "Balance de Ferrovial del primer trimestre de 2026", "expects": { "intent": "company_analysis", "mode": "period", "must_mention": ["Ferrovial","Q1","trimestre"], "must_not_match": ["mediana","esta semana"] } },
    { "id": "P2", "family": "period", "question": "Evolución de Repsol en el último mes", "expects": { "intent": "period_evolution", "mode": "period", "must_mention": ["Repsol"] } },
    { "id": "P3", "family": "period", "question": "Cómo ha cambiado la reputación de BBVA en los últimos 30 días", "expects": { "intent": "period_evolution", "mode": "period", "must_mention": ["BBVA"] } },
    { "id": "P4", "family": "period", "question": "Tendencia de Aena durante febrero y marzo", "expects": { "intent": "period_evolution", "mode": "period", "must_mention": ["Aena","AENA"] } },

    { "id": "R1", "family": "ranking", "question": "Top 10 del IBEX-35 por RIX esta semana", "expects": { "intent": "sector_ranking", "must_mention": ["IBEX-35"], "min_companies": 10 } },
    { "id": "R2", "family": "ranking", "question": "Ranking del sector energía", "expects": { "intent": "sector_ranking", "must_mention": ["energ"] } },
    { "id": "R3", "family": "ranking", "question": "Quiénes son las 5 peores del IBEX en consenso IA", "expects": { "intent": "sector_ranking", "must_mention": ["IBEX"] } },
    { "id": "R4", "family": "ranking", "question": "Comparativa de los bancos del IBEX", "expects": { "intent": "sector_ranking", "must_mention": ["banco"] } },

    { "id": "C1", "family": "comparison", "question": "Compara Iberdrola con Endesa", "expects": { "intent": "comparison", "must_mention": ["Iberdrola","Endesa"] } },
    { "id": "C2", "family": "comparison", "question": "BBVA vs Santander en reputación algorítmica", "expects": { "intent": "comparison", "must_mention": ["BBVA","Santander"] } },
    { "id": "C3", "family": "comparison", "question": "Compara Inditex con sus competidores verificados", "expects": { "intent": "comparison", "must_mention": ["Inditex","verificad"] } },
    { "id": "C4", "family": "comparison", "question": "Telefónica frente a sus competidores", "expects": { "intent": "comparison", "must_mention": ["Telefónica"], "must_not_match": ["Vodafone Group","Deutsche Telekom"] } },

    { "id": "D1", "family": "divergence", "question": "Dónde discrepan más los modelos sobre Repsol", "expects": { "intent": "model_divergence", "must_mention": ["Repsol","ChatGPT","Perplexity","Gemini","DeepSeek","Grok","Qwen"] } },
    { "id": "D2", "family": "divergence", "question": "Consenso entre IAs sobre Iberdrola esta semana", "expects": { "intent": "model_divergence", "must_mention": ["Iberdrola","consenso"] } },
    { "id": "D3", "family": "divergence", "question": "Qué IA es más crítica con Inditex", "expects": { "intent": "model_divergence", "must_mention": ["Inditex"] } },
    { "id": "D4", "family": "divergence", "question": "Divergencias por métrica en BBVA en el primer trimestre", "expects": { "intent": "model_divergence", "must_mention": ["BBVA","Q1"] } },

    { "id": "E1", "family": "edge", "question": "Qué tiempo hace mañana", "expects": { "intent": "out_of_scope" } },
    { "id": "E2", "family": "edge", "question": "Reputación de Telefónica Germany", "expects": { "scope_rejection": true, "must_mention": ["España","matriz"] } },
    { "id": "E3", "family": "edge", "question": "REP esta semana", "expects": { "must_mention": ["Repsol"] } },
    { "id": "E4", "family": "edge", "question": "Balance del top 5 del ibex en el primer semestre", "expects": { "intent": "sector_ranking", "must_mention": ["parcial","disponible"] } }
  ]
}
```

## Rúbrica de evaluación (0-2 por dimensión, total /14)

| Dim | Pregunta a contestar |
|---|---|
| `grounding` | ¿Los números coinciden con el DataPack? ¿Sin invenciones? |
| `temporal` | ¿Fechas correctas? ¿Respeta floor 2026-01-01? |
| `anti_mediana` | ¿Compara las 6 IAs sin colapsar a un único número? |
| `competidores` | ¿Solo `verified_competitors` o inventa peers? |
| `estructura` | Headline → Diagnóstico → 6 IAs → Patrones → GEO accionable |
| `sanitizacion` | ¿Filtra jerga interna, marcadores, "mediana"? |
| `fiabilidad` | ¿Sin timeout, SSE limpio, latencia razonable? |

## Auto-checks programáticos

Se aplican automáticamente al guardar cada `audit_result`:

- `forbidden_mediana`: NO debe aparecer la palabra "mediana" en el output
- `forbidden_internal_jargon`: regex `/F[0-9]_/` o `/skill[A-Z]/`
- `forbidden_knowledge_cutoff`: `/según mi conocimiento|i (don't|do not) have/i`
- `mentions_six_models`: 4-6 modelos de la lista deben aparecer en intents que lo requieren
- `must_mention_terms`: cada término del array `expects.must_mention` debe aparecer
- `must_not_match`: ningún término del array debe aparecer
- `latency_ok`: `latency_ms < 90000`
- `models_coverage_complete`: si hay datapack, `models_coverage.with_data.length === 6`