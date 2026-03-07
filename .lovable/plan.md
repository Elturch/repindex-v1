
# 3 Correcciones Críticas en el Prompt de chat-intelligence

## Diagnóstico

Tras auditar el prompt completo, confirmo las 3 inconsistencias:

1. **Doble taxonomía de métricas**: La sección "LAS 8 MÉTRICAS" (línea ~4977) lista las métricas correctas, pero no hay una regla explícita que PROHÍBA inventar métricas adicionales. El modelo puede fabricar SOM, POL, NPM, etc. en la tabla de la Sección 3.

2. **Artefactos Consensos/Disensos**: La Sección 2 (línea ~5652) menciona "Consensos, Disensos, Outliers" como sub-bloques pero no exige formato h4 separado, lo que permite concatenación en una línea.

3. **KPI en recomendaciones**: El formato existe (líneas 5754-5760) pero está enterrado dentro de la estructura. Falta una regla de cierre que lo haga OBLIGATORIO e imposible de omitir.

## Cambios (solo prompt, 3 inserciones)

### Cambio 1: Regla anti-invención de métricas
**Ubicación**: Después de "LAS 8 MÉTRICAS" (línea ~4981), antes de "COMPETIDORES".

Insertar regla explícita:

```
REGLA INQUEBRANTABLE SOBRE MÉTRICAS:
Las ÚNICAS métricas válidas del sistema RepIndex son EXACTAMENTE 8: NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM.
NUNCA inventes, añadas ni sustituyas métricas. NO uses SOM, POL, NPM, RRM, ISM ni ninguna otra sigla fuera de estas 8.
La tabla de la Sección 3 DEBE contener EXACTAMENTE estas 8 métricas con sus nombres canónicos y valores del DATAPACK.
Si inventas una métrica que no existe en este listado, el informe queda INVALIDADO.
```

### Cambio 2: Formato obligatorio Consensos/Disensos/Outliers
**Ubicación**: Sección 2 (líneas ~5652-5655), reemplazar el bloque de patrones detectados.

Reescribir para exigir subsecciones h4 separadas:

```
Después de analizar todos los modelos individualmente, incluir un bloque PATRONES DETECTADOS con subsecciones SEPARADAS:

#### Consensos
(>=4 IAs coinciden en la misma señal — cada consenso como bullet •)

#### Disensos
(rango >20 entre modelos en alguna métrica — cada disenso como bullet •)

#### Outliers
(1 modelo dice algo que ninguno más detecta — cada outlier como bullet •)

CONTROL DE CALIDAD: Consensos, Disensos y Outliers son subsecciones SEPARADAS con encabezado propio (####). NUNCA concatenarlos en una sola línea. Cada subsección empieza con oración completa. Verificar que no haya palabras duplicadas ni fragmentos cortados.
```

### Cambio 3: Refuerzo KPI obligatorio en recomendaciones
**Ubicación**: En "REGLAS DE RECOMENDACIONES" (línea ~5764), añadir al final.

Insertar refuerzo explícito:

```
- OBLIGATORIO: CADA recomendación DEBE terminar con una línea en formato exacto:
  **KPI objetivo**: [Sigla]: [valor actual] → [objetivo] en [plazo] días.
  Esta línea NO puede omitirse en NINGUNA recomendación. Si falta, la recomendación está INCOMPLETA.
```

## Archivos a modificar
- `supabase/functions/chat-intelligence/index.ts` (solo texto del prompt, 3 inserciones)

## Despliegue
- Redesplegar la edge function `chat-intelligence`
