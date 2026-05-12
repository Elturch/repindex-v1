## Problema que vamos a resolver

Ahora mismo la matriz de estrés solo dice “21/21 fallan”. Eso confirma que el sistema está roto, pero no indica cómo arreglarlo ni fuerza al agente a seguir la ruta correcta en base de datos.

El último run muestra un patrón claro:

- `A10_biblio_min`: 18 fallos. No se está garantizando una bibliografía válida por ticker.
- `A9_ranking_enrichment`: 18 fallos. Faltan sub-métricas canónicas en bastantes salidas.
- `A2_single_model_lang` y `A6_anti_mediana`: 15 fallos. En vistas single-model se cuela lenguaje multi-modelo y la palabra prohibida.
- `A5_hotels_edge`: 7 fallos. Hoteles no declara de forma estable que solo existe MEL como único emisor cotizado.
- `A3_anti_fabrication`: 2 fallos. Siguen apareciendo entregables prohibidos.

Además hay una causa técnica evidente: el skill `sectorRanking` todavía depende demasiado del LLM para respetar estructura, bibliografía, unicidad de alcance y sub-métricas. La herramienta de estrés debería convertir cada fallo en instrucciones de reparación, no solo en badges rojos.

## Plan de implementación

### 1. Añadir un “plan de reparación” dentro de la herramienta de estrés

En `StressTestsPanel.tsx` añadiré una sección nueva encima de resultados:

- Diagnóstico agrupado por assert.
- Severidad.
- Causa probable.
- Archivo/zona afectada.
- Instrucción concreta de reparación.
- Evidencia: casos afectados y ejemplo de mensaje.
- Estado esperado después del arreglo.

Ejemplo práctico:

```text
A10_biblio_min
Causa: la salida final no contiene sección de fuentes detectable o no incluye ticker del ranking.
Reparación: forzar append determinista de “Fuentes citadas” por ticker después de la síntesis LLM.
Archivo: sectorRanking.ts, bloque cited_sources_substitution.
Casos afectados: 18/21.
```

Esto hará que la herramienta sirva para avanzar, no solo para observar el desastre.

### 2. Crear un mapa canónico assert -> instrucciones de reparación

En frontend crearé una estructura local `ASSERT_REPAIR_PLAYBOOK` para los asserts actuales:

- `A1_scope_integrity`
- `A2_single_model_lang`
- `A3_anti_fabrication`
- `A4_small_n`
- `A5_hotels_edge`
- `A6_anti_mediana`
- `A7_period_coherence`
- `A8_models_coverage`
- `A9_ranking_enrichment`
- `A10_biblio_min`

Cada entrada tendrá:

- qué significa el fallo,
- cómo detectarlo,
- causa probable,
- instrucciones de arreglo,
- componentes/funciones candidatos,
- prioridad.

No tocaré base de datos para esto.

### 3. Corregir el `sectorRanking` para que no dependa del LLM en checks críticos

Haré que los elementos que la matriz exige salgan de forma determinista:

- Siempre añadir aviso de alcance estricto cuando `scope_tickers.length <= 3`.
- Para Hoteles, forzar frase exacta compatible con `A5`: “El subsector Hoteles contiene 1 único emisor cotizado: Meliá Hotels International (MEL).”
- Siempre añadir tabla canónica de 8 sub-métricas cuando falte cualquiera de `NVM/DRM/SIM/RMM/CEM/GAM/DCM/CXM`.
- Siempre añadir bloque final de “Fuentes citadas” por ticker del ranking, incluso si el LLM omitió la sección.
- Cambiar cualquier fallback de “sin datos suficientes” para que también incluya alcance, sub-métricas y fuentes mínimas, evitando que DeepSeek rompa A9/A10 por irse al fallback.

### 4. Reforzar sanitización antes de persistir y antes de auditar

Ampliaré `sanitizeFinalMarkdown` para cubrir variantes que siguen escapando:

- `RIX medio` en tablas/footnotes single-model.
- `mediana` en cualquier sección.
- “nota de prensa” y otros entregables prohibidos.
- lenguaje multi-modelo en single-model.

El objetivo es que el texto que llega al runner ya esté limpio, no solo el que se muestra al usuario final.

### 5. Añadir instrucciones generadas por caso en el modal de detalle

En el detalle de cada celda fallida añadiré:

- “Qué falló”.
- “Por qué probablemente falló”.
- “Qué tocar”.
- “Cómo comprobar que queda arreglado”.
- fragmento de respuesta donde aparece el problema cuando sea detectable.

Esto resuelve tu punto principal: si el resultado es malo, la herramienta debe producir las instrucciones para arreglarlo.

### 6. Validación

Después de implementar:

- Ejecutaré comprobaciones estáticas sobre los ficheros modificados.
- Revisaré el panel `/admin` para confirmar que muestra el playbook de reparación.
- Revisaré logs/datos del último run para comprobar que el diagnóstico se agrupa bien.
- Si procede, desplegaré la edge function modificada y dejaré listo el siguiente run de estrés para verificar que los 21 casos empiezan a pasar.

## Archivos previstos

- `src/components/admin/StressTestsPanel.tsx`
- `supabase/functions/chat-intelligence-v2/skills/sectorRanking.ts`
- `supabase/functions/chat-intelligence-v2/guards/outputGuard.ts`

## Fuera de alcance

- No crearé nuevas tablas.
- No cambiaré la definición de los asserts salvo que encontremos un falso positivo claro.
- No tocaré datos de producción.
- No ampliaré la matriz de estrés; primero haremos que la actual sea útil y pase.