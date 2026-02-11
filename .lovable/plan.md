

# Sugerencias Inteligentes con Vector Store - "Preguntas que demuestran poder"

## Problema actual

El hook `useSmartSuggestions` usa un pool de ~20 plantillas fijas con inyeccion basica de datos live (top/bottom company, divergencia). Las preguntas son genericas y repetitivas: "Cuales son las 5 mejores empresas", "Compara el sector bancario vs energetico". No demuestran lo que el Agente Rix realmente puede hacer.

## Solucion: Edge Function `fetch-smart-suggestions`

En lugar de generar preguntas desde el frontend con plantillas, se creara una Edge Function que **mina directamente los metadatos del Vector Store** para descubrir patrones interesantes y generar preguntas contextuales y sorprendentes.

### Fuentes de datos (sin embeddings, solo SQL sobre metadata)

La Edge Function consultara los metadatos JSONB de la tabla `documents` para extraer:

1. **Anomalias por dimension**: Empresas con scores extremos en dimensiones especificas (ej: CEM de 100 pero SIM de 10)
2. **Flags interesantes**: Documentos con flags como `inconsistencias`, `datos_antiguos`, `cutoff_disclaimer`
3. **Divergencias entre modelos**: Misma empresa evaluada por diferentes IAs con scores muy distintos
4. **Movimientos semanales**: Comparar scores entre semanas consecutivas
5. **Patrones sectoriales**: Sectores donde todas las empresas bajan o suben

### Tipos de preguntas generadas

| Tipo | Ejemplo | Fuente |
|------|---------|--------|
| Anomalia dimensional | "Renta 4 tiene CEM de 100 pero SIM de 10 -- por que las IAs la ven tan bien en gobernanza pero tan mal en sostenibilidad?" | metadata.scores |
| Divergencia entre IAs | "ChatGPT da 82 a Iberdrola pero Deepseek solo 54 -- quien tiene razon y por que?" | Misma empresa, distinto ai_model |
| Flag de alerta | "3 empresas del IBEX-35 tienen flag de 'inconsistencias' esta semana -- que esta pasando?" | metadata.flags |
| Movimiento brusco | "Logista ha caido de 72 a 45 en una semana -- es un problema real o un fallo de datos?" | Comparacion temporal |
| Patron sectorial | "Todas las empresas de Banca subieron esta semana excepto una -- cual y por que?" | Agrupacion por sector |
| Descubrimiento oculto | "Solo 2 empresas small cap superan a las del IBEX-35 en reputacion -- cuales son?" | ibex_family_code + scores |

### Arquitectura

```
Frontend (useSmartSuggestions)
    |
    |-- GET /fetch-smart-suggestions?lang=es&count=4
    |
    v
Edge Function (fetch-smart-suggestions)
    |
    |-- SQL queries sobre metadata JSONB de documents
    |-- SQL queries sobre rix_runs_v2 (ultima semana)
    |-- Aleatoriza y prioriza hallazgos
    |
    v
Respuesta JSON: [{ text, type, icon, source }]
```

### Ventaja clave: Sin coste de embeddings

No se generan embeddings ni se llama a OpenAI. Todo se resuelve con consultas SQL sobre los campos JSONB de metadata ya indexados. Coste: cero. Latencia: <500ms.

## Detalles tecnicos

### 1. Nueva Edge Function: `supabase/functions/fetch-smart-suggestions/index.ts`

La funcion ejecutara 5-6 queries SQL en paralelo sobre `documents` y `rix_runs_v2`:

- **Query 1 - Anomalias dimensionales**: Buscar documentos recientes donde la diferencia entre el score maximo y minimo de las 8 dimensiones supere 50 puntos
- **Query 2 - Divergencias entre IAs**: Agrupar por ticker+semana, calcular max-min de rix_score entre modelos
- **Query 3 - Flags sospechosos**: Contar empresas con flags criticos esta semana
- **Query 4 - Movimientos semanales**: Comparar rix_score promedio de la semana actual vs anterior por empresa
- **Query 5 - Patrones sectoriales**: Agrupar por sector y detectar unanimidad alcista/bajista
- **Query 6 - Descubrimientos cross-index**: Comparar small caps vs IBEX-35

Cada query produce 1-3 "hallazgos" que se convierten en preguntas usando plantillas parametrizadas con los datos reales encontrados.

La funcion devolvera un array de sugerencias aleatorizado, priorizando hallazgos mas "sorprendentes" (mayor delta, flags mas criticos).

### 2. Modificar: `src/hooks/useSmartSuggestions.ts`

- Anadir un `useEffect` que llame a la Edge Function `fetch-smart-suggestions`
- Usar las sugerencias del Vector Store como tipo `'vector_insight'` con prioridad maxima (0)
- Mantener el sistema actual como fallback si la Edge Function falla
- Cachear resultados durante 5 minutos para evitar llamadas repetidas

### 3. Modificar: `src/components/chat/ChatMessages.tsx`

- Anadir badge visual `"Insight en vivo"` para sugerencias tipo `vector_insight`
- Estilo diferenciado: borde con gradiente sutil para destacar las preguntas basadas en datos reales

### 4. Configuracion: `supabase/config.toml`

- Anadir entrada para la nueva funcion con `verify_jwt = false`

## Archivos a crear/modificar

| Archivo | Accion |
|---------|--------|
| `supabase/functions/fetch-smart-suggestions/index.ts` | Crear |
| `src/hooks/useSmartSuggestions.ts` | Modificar - integrar Edge Function |
| `src/components/chat/ChatMessages.tsx` | Modificar - badge visual para insights |
| `supabase/config.toml` | Modificar - anadir config |

## Resultado esperado

- Cada vez que se abre un hilo nuevo, las 4 sugerencias seran unicas, basadas en datos reales del Vector Store
- Las preguntas demostraran capacidades avanzadas: analisis cruzado, deteccion de anomalias, comparacion entre IAs
- El boton "Refrescar" generara preguntas distintas cada vez (aleatorizacion server-side)
- Coste cero en API de IA (solo queries SQL)
- Fallback al sistema actual si la Edge Function falla
