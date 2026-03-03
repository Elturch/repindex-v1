

# Plan: Eliminar promedios, mostrar datos por IA individual con consenso temático

## El problema fundamental

El sistema actual promedia los scores de 6 IAs para crear un ranking de empresas. Esto es metodológicamente incorrecto:

1. **No todas las IAs tienen el mismo peso de audiencia** -- ChatGPT tiene cientos de millones de usuarios, DeepSeek tiene una fracción. Un promedio aritmético trata ambas como iguales.
2. **Un promedio ponderado real requiere datos de audiencia actualizados** que no tenemos (cuotas de mercado, usuarios activos por geografía, etc.).
3. **El usuario espera ver qué dice CADA IA**, no una media aritmética sin sentido.
4. **El informe debe buscar coherencia temática** (¿en qué coinciden las IAs? ¿en qué divergen?) en lugar de promediar números.

## Cambios en `supabase/functions/chat-intelligence/index.ts`

### Cambio 1: Reestructurar el ranking de Route B -- datos por modelo individual

Actualmente (lineas 1611-1667): se agrupan scores por empresa y se promedian. 

**Nuevo enfoque:**
- El `pack.ranking` dejará de contener `rix_avg` (promedio). En su lugar, cada entrada del ranking incluirá los scores individuales de cada modelo como un objeto `scores_por_modelo: { ChatGPT: 72, Gemini: 65, ... }`.
- Ordenar el ranking por la **mediana** (no la media), que es más robusta a valores extremos. La mediana ya se usa en RIXc Lite.
- Incluir el campo `rango` (max - min) como indicador de dispersión.
- Incluir `consenso_nivel`: "alto" si rango < 10, "medio" si < 20, "bajo" si >= 20.

Esto permite que el orquestador (E5) explique: "Solaria obtiene 84 según Grok pero solo 57 según ChatGPT — alta dispersión inter-modelo" en vez de "Solaria: 67.7 puntos".

### Cambio 2: Reestructurar el snapshot de Route B -- una fila por modelo, no por empresa promediada

Actualmente (lineas 1681-1694): el snapshot contiene entradas tipo `"Solaria (SOL)": rix_avg=67.7` con métricas promediadas.

**Nuevo enfoque:**
- Cada entrada del snapshot será `{ modelo: "ChatGPT → Solaria", rix: 57, nvm: X, drm: Y, ... }` -- una fila por modelo por empresa (solo top-5 y bottom-5).
- Esto da al E5 la granularidad para explicar POR QUÉ Grok ve Solaria tan positivamente vs ChatGPT.
- Limitar a top-5 + bottom-5 × 6 modelos = máx 60 filas (controlado).

### Cambio 3: Actualizar el prompt del orquestador (E5) con instrucciones anti-promedio

En el system prompt del E5 (lineas 2528-2643), añadir reglas explícitas:

```
REGLA ANTI-PROMEDIO (PRIORIDAD MÁXIMA):
• NUNCA calcules ni presentes promedios aritméticos de scores entre modelos de IA.
• Cada IA tiene audiencia, arquitectura y sesgos distintos. Un promedio sin ponderación de audiencia es metodológicamente incorrecto.
• En su lugar, presenta los datos POR MODELO INDIVIDUAL y busca CONSENSO TEMÁTICO:
  - ¿En qué coinciden 5-6 IAs? → Señal consolidada
  - ¿Dónde divergen significativamente? → Señal de incertidumbre
  - ¿Qué modelo es outlier y por qué?
• Usa la MEDIANA como referencia de tendencia central (no la media).
• El ranking usa la mediana como criterio de ordenación, pero SIEMPRE muestra los scores individuales.
• NUNCA digas "RIX promedio de 67.7" → Sí puedes decir "Mediana RIX: 67, rango: 57-84 (alta dispersión)"
```

### Cambio 4: Actualizar `sector_avg` y `evolucion` para usar mediana

- `sector_avg` (linea 1679): cambiar de media a mediana.
- `evolucion` (lineas 1758-1774): cambiar de media a mediana para el agregado semanal del índice.
- Añadir `rango` a cada punto de evolución para mostrar la dispersión temporal.

### Cambio 5: Actualizar E3 con max_tokens y pre-filtrado (del plan anterior pendiente)

- Linea 2257: `max_tokens` de 1500 a 4000.
- Linea 2202: si hay más de 40 textos normalizados, seleccionar máximo 3 por empresa (priorizando modelos distintos) y truncar a 1500 chars.
- En el catch (linea 2267): intentar reparar JSON truncado antes de devolver null.

### Cambio 6: Actualizar las reglas IBEX-35 específicas en E5

En las lineas 2613-2622, reescribir las reglas de índice para reflejar la filosofía anti-promedio:

```
REGLAS ESPECÍFICAS PARA CONSULTAS DE ÍNDICE:
• Presenta SIEMPRE los scores de cada IA por separado para las empresas destacadas.
• Busca COHERENCIA TEMÁTICA: ¿las 6 IAs coinciden en que X empresa lidera? ¿O solo 2 la ponen arriba?
• Si una empresa tiene alta dispersión (rango > 15), dedica un párrafo a explicar por qué las IAs discrepan.
• La mediana es tu referencia de tendencia central. Nunca uses "promedio" ni "media".
• Para el ranking general, ordena por mediana pero muestra: Mediana | Min | Max | Consenso.
```

## Resumen de impacto

| Cambio | Qué resuelve | Riesgo |
|--------|-------------|--------|
| Ranking por modelo individual | El usuario ve lo que ve en el dashboard | Bajo: más datos pero estructura clara |
| Snapshot granular por modelo | E5 puede explicar divergencias reales | Medio: más filas, controlar tamaño |
| Prompt anti-promedio en E5 | Elimina promedios sin sentido del informe | Bajo: solo instrucciones |
| Mediana en vez de media | Referencia estadística robusta sin necesitar pesos | Bajo: cambio determinista |
| E3 max_tokens + pre-filtrado | Resuelve el timeout/truncado de E3 | Bajo: ya planificado |
| Reglas IBEX-35 actualizadas | Informes con perspectiva por IA, no listados | Bajo: solo prompt |

