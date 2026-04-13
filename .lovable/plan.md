

## Auditoría completa: Estado actual del Agente Rix (13 abril 2026)

### Hallazgos tras verificación con datos reales

---

### PROBLEMA 1: Dashboard vs Agente muestran rankings distintos (CONFIRMADO)

**Causa raíz**: El Dashboard muestra filas individuales (1 por modelo por empresa) y ordena por `displayRixScore` de cada fila individual. El Agente calcula la **mediana** de los 6 modelos por empresa y ordena por esa mediana.

Son dos vistas fundamentalmente diferentes del mismo dato. Ejemplo real del 12 abril IBEX-35:
- **Agente (mediana)**: CaixaBank=70, Enagás=69, BBVA=68, Cellnex=67.5, Ferrovial=66.5
- **Dashboard (filas individuales)**: Inditex-Gemini=83, Acciona-Grok=79, CaixaBank-Qwen=79...

El usuario ve en el Dashboard que Inditex tiene un 83 (Gemini) y el Agente le dice que CaixaBank lidera con 70. Ambos son "correctos" pero miden cosas distintas, lo que genera desconfianza total.

**El plan aprobado de consenso/disenso resuelve esto**: el Agente debe mostrar las 6 puntuaciones individuales y ordenar por consenso, no por mediana ficticia.

---

### PROBLEMA 2: "1 semana / 30 observaciones" cuando se piden 4 semanas (PERSISTE)

El informe del 13 abril dice literalmente "1 semanas, 30 observaciones" cuando el usuario pidió "evolución durante las últimas 4 semanas". La lógica temporal sigue sin propagarse a `skillSectorSnapshot`.

---

### PROBLEMA 3: "Grupos hospitalarios" — Estado actual: FUNCIONA

He verificado con los logs y con una llamada directa:
- `rix_semantic_groups` tiene la composición correcta: 7 tickers `[QS, HMH, HLA, HOS, VIT, VIA, RS]`
- SANITAS está en `exclusions`
- Los logs muestran resolución correcta: "7 companies, 42 model rows, 4 weeks"
- El último informe generado de hospitalarios muestra datos correctos con las 8 métricas canónicas

**Sin embargo**, hay un bug menor: la query "grupos hospitalarios" hace fuzzy match a "Grupo Azvi (AZVI)" como empresa principal, aunque el semantic group se resuelve correctamente en paralelo. Esto no rompe el resultado pero añade ruido innecesario.

Si antes "no tenía datos", puede deberse a que la query se hizo antes del barrido del 12 abril con una formulación que no coincidía con los aliases, o a que el diccionario semántico no se había activado en una versión anterior del deploy.

---

### Plan de implementación (priorizado)

#### Fase 1 — Pivotar ranking del Agente a consenso/disenso (el cambio más crítico)

**Archivo**: `supabase/functions/chat-intelligence/index.ts`

En `skillSectorSnapshot` (~línea 860-895):
- Cambiar el ranking de `sort by rix_mediano` a ranking por consenso dual:
  - Calcular rango (max - min) por empresa
  - Clasificar consenso: Alto (< 10), Medio (10-20), Bajo (> 20)  
  - Calcular score del "bloque mayoritario" (modelos dentro de ±5 puntos entre sí)
- Inyectar en el DataPack por cada empresa: `scores: {ChatGPT: X, Gemini: Y, ...}`, `consenso`, `rango`, `bloque_mayoritario`, `outliers`
- Mantener `rix_mediano` solo como referencia secundaria

En la tabla cruzada pre-calculada del prompt:
- Cambiar de una columna "Mediana" a 6 columnas (una por modelo) + Rango + Consenso
- Así el LLM recibe exactamente los mismos datos que el Dashboard

En el system prompt:
- Prohibir presentar una puntuación única como "la nota"
- Obligar a mostrar las 6 puntuaciones individuales
- El análisis debe centrarse en dónde coinciden y dónde divergen las IAs

#### Fase 2 — Corregir propagación temporal ("1 semana" → "4 semanas")

En `skillSectorSnapshot`: cuando `dateRange` se proporciona, el `report_context` debe reflejar:
- Número real de semanas con datos
- Observaciones reales (empresas × modelos × semanas)
- `date_from` y `date_to` reales del DataPack

En la construcción del `pack` (~línea 2890-2960):
- Contar semanas distintas en los datos devueltos
- Inyectar `semanas_cubiertas` y `observaciones_totales` reales

#### Fase 3 — Eliminar fuzzy match a "Grupo Azvi" cuando hay semantic group

En el flujo de `resolveSemanticGroup` + `interpretQueryEdge`:
- Cuando un semantic group se resuelve, suprimir el fuzzy match de empresa individual
- Evitar que "grupos hospitalarios" resuelva "Grupo Azvi" como companyProfile

#### Fase 4 — Reforzar el prompt sectorial con KPIs pre-calculados

Calcular y añadir al DataPack un bloque `kpis_sector_canonicos` con las 8 métricas (NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM) como medianas sectoriales. Esto ya se hace parcialmente pero no se inyecta de forma explícita en el prompt, lo que a veces causa que el LLM invente métricas.

### Resultado esperado

- Dashboard y Agente mostrarán los mismos datos base (6 puntuaciones individuales)
- El Agente analizará consenso y disenso como valor diferencial
- Los metadatos temporales del informe serán correctos
- No habrá fuzzy match espúreo cuando un semantic group ya se ha resuelto

