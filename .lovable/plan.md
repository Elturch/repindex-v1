

# Plan: Corregir metricas nulas en Ruta B y eliminar alucinaciones de planes de accion

## Diagnostico del informe

El informe descargado muestra DOS fallos criticos:

### Fallo 1: Las 8 metricas aparecen como "dato no disponible"

**Causa raiz exacta** (linea 1606 de `chat-intelligence/index.ts`):

```
nvm: null, drm: null, sim: null, rmm: null,
cem: null, gam: null, dcm: null, cxm: null,
```

La Ruta B ya descarga las columnas de metricas (`23_nvm_score`, `26_drm_score`, etc. en linea 1532), pero al construir el snapshot solo calcula el RIX promedio y descarta las metricas. El LLM recibe `null` para las 8 metricas y escribe "dato no disponible" en cada seccion.

### Fallo 2: Alucinacion masiva — "Plan de Accion Institucional"

El informe contiene **6 paginas de contenido 100% fabricado**:
- "Plan de Accion Institucional" con objetivos 2024-2025 (fechas inventadas)
- "Mapa de Influencia y Alianzas" con nodos institucionales falsos (Caixabank-CEOE, Iberdrola-WindEurope)
- "Hoja de Ruta Trimestral" T3-2024 a T2-2025 con responsables inventados
- "Stakeholder Map Politico" con CNMV, Ministerio, Banco de Espana
- KPIs fabricados: "Share of Voice >=35%", "Engagement digital >=3 ppm", "SECNewgate score >=7"
- Escenarios ficticios: "cisne negro sanitario", "tasa extraordinaria a electricas"

**Por que los FORBIDDEN_PATTERNS no lo detectaron:** Los patrones actuales exigen formatos especificos que el LLM evita. Por ejemplo `plan\s+de\s+accion\s+(?:ejecutivo|institucional)\s*\(` exige un parentesis final, pero el LLM no lo pone. No hay patrones para stakeholder maps, hojas de ruta, ni KPIs de share-of-voice.

---

## Solucion: 3 cambios en `supabase/functions/chat-intelligence/index.ts`

### Cambio 1: Acumular y promediar las 8 metricas en Route B (lineas 1569-1611)

Ampliar la estructura `byCompany` para acumular arrays de cada metrica por empresa. Calcular promedios e inyectarlos en el snapshot en lugar de `null`.

```text
// Estructura actual:
byCompany = Map<ticker, { name, scores[], sector }>

// Nueva estructura:
byCompany = Map<ticker, { 
  name, scores[], sector,
  nvm[], drm[], sim[], rmm[], cem[], gam[], dcm[], cxm[] 
}>
```

Luego en el snapshot (linea 1602-1611), reemplazar `null` por los promedios reales:
```text
nvm: avg(entry.nvm), drm: avg(entry.drm), ...
```

Tambien calcular promedios de metricas por sector en `sector_avg` para que el LLM tenga referencia.

### Cambio 2: Ampliar FORBIDDEN_PATTERNS (lineas 1054-1131)

Anadir ~15 patrones nuevos para detectar las fabricaciones que se colaron:

```text
// Plan de accion sin parentesis
/plan\s+de\s+acci[oó]n\s+institucional/i,

// Stakeholder maps inventados
/stakeholder\s+map/i,
/mapa\s+de\s+influencia/i,
/nodo\s+institucional/i,
/patrocinador\s+interno/i,
/socio\s+externo\s+ancla/i,

// Hojas de ruta trimestrales
/hoja\s+de\s+ruta\s+trimestral/i,
/hoja\s+de\s+ruta\s+\(T\s*\+/i,

// Trimestres con fechas pasadas (fabricacion)
/T[1-4][\s-]+202[0-5]/i,

// KPIs de consultoria
/share\s+of\s+voice\s+(?:institucional|>=|≥)/i,
/engagement\s+digital.*ppm/i,
/secnewgate/i,

// Presupuestos fabricados
/presupuesto\s+(?:total\s+)?estimado.*\d+[.,]?\d*\s*m\s*[€e]/i,

// Datos bursatiles inventados
/(?:sabadell|bbva|caixabank|repsol|cellnex|colonial)\s+[+-]\d+\s*%/i,
/indice:\s*[\d.,]+\s*pts/i,

// Task Force / capacitacion inventada
/task\s+force\s+sectorial/i,
/formacion\s+(?:anual\s+)?de\s+portavoces/i,
/dashboard\s+reputacional\s+en\s+comit[eé]/i,
/cisne\s+negro\s+sanitario/i,

// Campanas inventadas
/campana\s+multicanal.*(?:earned|paid|owned)/i,
/certificaci[oó]n\s+iso\s+37000/i,
```

### Cambio 3: Reforzar el system prompt del orquestador para consultas de indice

Anadir un bloque condicional en `buildOrchestratorPrompt` (linea ~2454) que detecte cuando `dataPack.empresa_primaria.ticker` es "IBEX-35" y anada reglas especificas:

```text
CUANDO EL DATAPACK SEA DE TIPO ÍNDICE (IBEX-35):
- Tu ÚNICO contenido permitido es: ranking, métricas por empresa, promedios sectoriales, evolución temporal, divergencia.
- NUNCA generes planes de acción, hojas de ruta, stakeholder maps, KPIs de gestión ni escenarios.
- NUNCA inventes datos bursátiles (cotizaciones, variaciones YTD, volatilidad, ratios).
- NUNCA inventes organizaciones externas (WindEurope, Airlines for Europe, CEOE) ni responsables internos.
- Si una métrica es null, di "dato no disponible" y PASA A LA SIGUIENTE. No rellenes.
- Extensión máxima: 2.000 palabras. Este es un resumen de índice, no un informe de consultoría.
```

---

## Resumen de impacto

| Cambio | Que resuelve | Riesgo |
|--------|-------------|--------|
| Metricas en Route B | Elimina "dato no disponible" en las 8 metricas | Bajo: usa datos que ya se descargan |
| FORBIDDEN_PATTERNS | Corta el stream ante planes de accion y stakeholder maps fabricados | Bajo: solo regex adicionales |
| Prompt para indice | Reduce la libertad creativa del LLM en consultas panoramicas | Bajo: solo texto en prompt |

No se toca: streaming, sesion, Ruta A (empresa), E1-E4, bulletin handler.

