

# Plan: Eliminar truncamiento del ranking — mostrar TODAS las empresas por modelo

## Diagnostico

El problema de fondo no es el IBEX-35 especificamente, es que el sistema trunca al 22% de los datos disponibles:

| Metrica | Valor actual | Problema |
|---------|-------------|----------|
| Empresas por modelo | 179 | Solo se muestran 40 (22%) |
| Modelos | 6 | OK, todos se muestran |
| Ranking promedio | 179 empresas | Solo se muestran 50 (28%) |
| Registros totales descartados | ~834 de 1,074 | 78% del contexto tirado |

### Por que el top-40 no sirve

Cualquier pregunta que implique empresas fuera del top 40 de un modelo fallara: ranking IBEX-35 completo, consultas sobre empresas con RIX bajo, comparativas sectoriales donde alguna empresa esta en la posicion 60+, etc. Es un recorte arbitrario que no tiene justificacion dado el espacio disponible.

### Capacidad del modelo o3

```text
Contexto maximo de o3:      200,000 tokens (~800,000 chars)
Contexto actual:            ~218,000 chars (~55,000 tokens)
Espacio usado:              27%
Espacio libre:              73% (~580,000 chars)
```

Mostrar las 179 empresas por modelo (en vez de 40) anade ~70,000 chars (~17,000 tokens), llegando a ~72,000 tokens. Aun queda el 64% del contexto libre.

## Cambios concretos

### Archivo: `supabase/functions/chat-intelligence/index.ts`

**Cambio 1 — Eliminar `slice(0, 40)` del ranking por modelo (linea 4351)**

Antes:
```text
records.slice(0, 40).forEach((record, idx) => { ... });
if (records.length > 40) {
  context += `| ... | ${records.length - 40} empresas más | ...`;
}
```

Despues:
```text
records.forEach((record, idx) => { ... });
// Sin truncamiento — se muestran TODAS las empresas evaluadas
```

Esto pasa de mostrar 40 a mostrar las 179 empresas para cada uno de los 6 modelos.

**Cambio 2 — Eliminar `slice(0, 50)` del ranking promedio (linea 4368)**

Antes:
```text
rankedByAverage.slice(0, 50).forEach((company, idx) => { ... });
if (rankedByAverage.length > 50) {
  context += `... y ${rankedByAverage.length - 50} empresas más.`;
}
```

Despues:
```text
rankedByAverage.forEach((company, idx) => { ... });
// Sin truncamiento — se muestran TODAS las empresas
```

### Impacto en el contexto

```text
ANTES (truncado):
  Ranking por modelo:  6 modelos x 40 empresas x ~100 chars  = ~24,000 chars
  Ranking promedio:    50 empresas x ~80 chars                = ~4,000 chars
  Total seccion:       ~28,000 chars

DESPUES (completo):
  Ranking por modelo:  6 modelos x 179 empresas x ~100 chars = ~107,400 chars
  Ranking promedio:    179 empresas x ~80 chars               = ~14,320 chars
  Total seccion:       ~121,720 chars

Incremento:            +93,720 chars (~23,400 tokens)
Contexto total:        ~312,000 chars (~78,000 tokens)
Uso del contexto o3:   39% (antes 27%)
```

Sigue holgado. El limite de o3 es 200K tokens, estariamos al 39%.

## Resultado esperado

- Cualquier pregunta sobre cualquier empresa tendra datos reales en el contexto
- Rankings IBEX-35, IBEX-MC, sectoriales, comparativos — todos completos
- No mas "No dispongo de ese dato" por truncamiento
- No mas scores inventados por falta de datos reales
- Funciona para preguntas que aun no conocemos, no solo para el caso IBEX-35

## Archivo a modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/chat-intelligence/index.ts` | Eliminar `slice(0, 40)` en linea 4351 y bloque `if > 40` en lineas 4354-4356; eliminar `slice(0, 50)` en linea 4368 y bloque `if > 50` en lineas 4377-4379 |

