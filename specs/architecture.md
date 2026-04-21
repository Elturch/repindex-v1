# Agente Rix v2 — Arquitectura

## Principio: cada modulo tiene una responsabilidad unica y <500 lineas

## Diagrama de flujo

Pregunta usuario -> index.ts (routing, <150 LOC) -> parsers/ (extraer entidad, temporal, modelos, intent) -> orchestrator.ts (decidir skill + mode + componer prompt, <300 LOC) -> skills/ (query SQL + empaquetado datos, prompt propio por skill) -> datapack/builder.ts (construir DataPack + pre-renderizar tablas) -> LLM sintesis (prompt compuesto = base + anti-hallucination + skill-specific) -> Response

## Estructura de directorios

supabase/functions/chat-intelligence-v2/

  index.ts (routing serve(), max 150 LOC)

  orchestrator.ts (dispatch intent, compose prompt, max 300 LOC)

  skills/

    companyAnalysis.ts (max 400 LOC)

    sectorRanking.ts (max 350 LOC)

    comparison.ts (max 350 LOC)

    modelDivergence.ts (max 300 LOC)

    periodEvolution.ts (max 300 LOC)

  parsers/

    entityResolver.ts (max 300 LOC)

    temporalParser.ts (max 250 LOC)

    modelParser.ts (max 150 LOC) — reutiliza _shared/modelsEnum.ts

    intentClassifier.ts (max 200 LOC)

  prompts/

    base.ts (identidad agente, tono, idioma, max 100 LOC)

    antiHallucination.ts (reglas anti-invencion, max 80 LOC)

    periodMode.ts (reglas mode=period, max 60 LOC)

    snapshotMode.ts (reglas mode=snapshot, max 40 LOC)

    coverageRules.ts (reglas cobertura parcial, max 50 LOC)

  datapack/

    builder.ts (construir DataPack segun skill+mode, max 300 LOC)

    tableRenderer.ts (pre-renderizar tablas markdown, max 200 LOC)

  guards/

    scopeGuard.ts (ambito espanol, empresa valida, max 100 LOC)

    temporalGuard.ts (fechas futuras, cobertura, max 150 LOC)

    inputGuard.ts (off-topic, prompt injection, max 80 LOC)

  types.ts (todas las interfaces y tipos, max 200 LOC)

## Modulos _shared reutilizados del v1 (NO duplicar)

- modelsEnum.ts

- consensusRanking.ts

- periodAggregation.ts

- queryGuards.ts

- inputValidator.ts

- temporalGuard.ts

## Base de datos: misma Supabase, mismas tablas

No hay migracion de datos. v2 lee las mismas tablas que v1.

## Feature flag

El frontend en src/hooks/useChat.ts (o donde se llame a la edge function) tendra un flag: si URL contiene ?agent=v2 llama a chat-intelligence-v2, si no llama a chat-intelligence (v1).