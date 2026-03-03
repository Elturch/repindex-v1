

# Diagnóstico: El Agente Rix devuelve "no hay datos" para el IBEX-35

## Causa raíz

El clasificador (E1) clasifica "dame lo último del panorama completo del ibex-35" como `tipo=general, intencion=general`. Esto hace que la compuerta en la línea 1522-1523 (`isIndexQuery`) devuelva `false` y el pipeline aborte con un DataPack vacío.

La detección por regex de "IBEX-35" en la línea 1546 existe, pero está **después** de la compuerta que ya ha cortado la ejecución. El regex nunca se alcanza.

```text
Flujo actual:
  empresas_detectadas = 0
  → isIndexQuery = (tipo=general? NO) || (intencion=general? NO) → false
  → return pack (vacío)              ← ABORTA AQUÍ
  → regex IBEX-35 (línea 1546)      ← NUNCA SE ALCANZA
```

## Plan de corrección

### Cambio 1: Mover la detección regex ANTES de la compuerta

En `supabase/functions/chat-intelligence/index.ts`, líneas 1518-1536:

- Antes de evaluar `isIndexQuery`, hacer un regex check de la pregunta original buscando menciones a índices bursátiles (IBEX-35, IBEX, etc.)
- Si el regex detecta un índice, forzar `isIndexQuery = true` independientemente de lo que diga el clasificador

### Cambio 2: Mejorar el prompt del clasificador (E1)

Añadir una regla explícita al prompt del clasificador (línea 1408-1432):

```
- Si la pregunta menciona "IBEX-35", "IBEX", un índice bursátil o pide un "panorama" de un grupo de empresas, tipo="sector" e intencion="ranking"
- Palabras clave de índice: ibex, panorama, mercado, índice, ranking general
```

Esto resuelve el problema en origen (el clasificador devuelve el tipo correcto) y la detección regex actúa como red de seguridad.

### Cambio 3: Log de diagnóstico mejorado

Añadir al log de `isIndexQuery=false` la pregunta original para facilitar debugging futuro.

## Impacto

- **Riesgo**: Muy bajo. Solo se amplía la condición de entrada a Route B.
- **Resultado**: Las consultas sobre IBEX-35 volverán a devolver datos reales.

