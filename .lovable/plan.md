## Diagnóstico

El informe adjunto confirma dos problemas principales:

1. **La selección de 1 modelo no se está respetando de forma fiable.** La consulta enviada debería activar la rama `single-model`, pero acaba saliendo un informe multi-IA con columnas de todos los modelos y lenguaje de consenso.
2. **El Top 10 no explica el criterio de ordenación.** Ahora se ordena por el extremo superior del rango RIX (`rix_max`) y luego por `rix_min`, pero el informe no lo declara claramente. Eso hace que el usuario no entienda por qué esas 10 empresas son “las mejores”.
3. **El consenso es confuso en ranking agregado.** La tabla muestra “RIX rango” y “Consenso bajo”, pero no separa bien tres conceptos distintos: puntuación, dispersión entre modelos y criterio de ranking.

## Plan de implementación

1. **Blindar la interpretación de single-model en rankings**
   - Ajustar `intentClassifier` para que una consulta tipo “top 10 IBEX-35 usando solo ChatGPT” siga siendo `sector_ranking`, no `model_divergence`.
   - Mantener `model_divergence` solo cuando el usuario realmente pregunte por diferencias/desacuerdo entre modelos.
   - Añadir una salvaguarda en `sectorRanking` para que, si `parsed.models.length === 1`, nunca se rendericen columnas ni textos de consenso multi-IA.

2. **Hacer determinista y visible el criterio del Top 10**
   - En el ranking multi-IA, añadir un bloque metodológico breve antes de la tabla: “Ordenado por mejor caso RIX del periodo; desempate por suelo RIX más alto”.
   - En single-model, declarar: “Ordenado por RIX medio del modelo seleccionado durante el periodo; desempate por número de observaciones”.
   - Cambiar el resumen compacto enviado al LLM para que incluya el criterio de ordenación, evitando que invente explicaciones.

3. **Aclarar o retirar “consenso” según el caso**
   - Con 1 modelo: eliminar por completo “consenso”, “divergencia”, “rango inter-modelo” y cualquier mención a las otras IAs.
   - Con 2+ modelos: renombrar la lectura a “Dispersión entre modelos” y explicar que `alto/medio/bajo` mide acuerdo entre IAs, no calidad reputacional.
   - Mantener la regla de polaridad: consenso alto + RIX bajo se debe leer como “consenso de crisis”, no como señal positiva.

4. **Corregir el caso YTD / Year-to-date en informes IBEX-35**
   - Verificar que “YTD” y rangos tipo `2026-01-01 → hoy` llegan como periodo completo al SQL.
   - Asegurar que el conteo de semanas en el footnote hable de semanas, no de modelos.
   - Para `/informes`, si el preset es YTD, compilar explícitamente “year to date” o “lo que va de año” además del rango de fechas.

5. **Añadir regresiones mínimas**
   - Añadir casos de prueba o endpoint de regresión para:
     - “Genera un informe ejecutivo del universo IBEX-35 limitado a las 10 mejores entre 2026-01-01 y 2026-05-10 usando solo ChatGPT.”
     - “Top 10 IBEX-35 YTD usando solo ChatGPT.”
     - “Top 10 IBEX-35 por consenso/divergencia entre modelos.”
   - Validar que el primer caso no devuelve tabla multi-modelo ni lenguaje de consenso.

## Archivos a tocar

- `supabase/functions/chat-intelligence-v2/parsers/intentClassifier.ts`
- `supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts`
- `supabase/functions/chat-intelligence-v2/prompts/rankingMode.ts`
- `src/lib/reports/compileQuestion.ts`
- Pruebas/regresiones de `chat-intelligence-v2` si encajan en el patrón existente.

## Resultado esperado

- Si el usuario selecciona **ChatGPT**, el informe será inequívocamente “según ChatGPT”.
- El Top 10 explicará exactamente de qué sale.
- “Consenso” dejará de parecer una puntuación positiva y pasará a leerse como dispersión/acuerdo entre modelos.