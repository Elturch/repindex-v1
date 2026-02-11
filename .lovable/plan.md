

# Plan: Corregir falso positivo en el clasificador de preguntas del Agente Rix

## Problema

La pregunta "Me puedes habilitar un informe sobre los top 5 y bottom 5 RIX solo tomando en cuenta chatgpt y el ibex35?" se clasifica como `off_topic` y se rechaza.

**Causa raiz**: El regex de deteccion de off-topic en la linea 2133 contiene el patron `cuent[oa]` (pensado para detectar "cuento" = story). Pero la frase "tomando en **cuenta**" coincide con ese patron, provocando un falso positivo.

```
Regex actual: /f[uú]tbol|pol[ií]tica|receta|chiste|poema|cuent[oa]|weather|.../
                                                           ^^^^^^^^
                                                     Coincide con "cuenta" en 
                                                     "tomando en cuenta"
```

Ademas, preguntas genericas sobre el mercado (rankings, IBEX-35, sectores) que no mencionan una empresa especifica caen primero en la comprobacion de empresas (linea 2128), no detectan ninguna, y luego quedan expuestas al regex de off-topic.

## Cambios a realizar

### Archivo: `supabase/functions/chat-intelligence/index.ts`

**Cambio 1 -- Corregir el regex off-topic (linea 2133)**

Reemplazar `cuent[oa]` por patrones mas especificos que no colisionen con expresiones comunes del español:
- `cuento` (sustantivo, "tell me a story") 
- `cuentame un` (frase)
- Usar word boundaries para evitar coincidencias parciales

**Cambio 2 -- Anadir deteccion de preguntas de mercado/indice ANTES del filtro off-topic (linea 2127)**

Insertar una comprobacion que detecte keywords de mercado como "ranking", "top", "bottom", "ibex", "sector", "mercado", "tendencia", "comparativa", etc., y las clasifique directamente como `corporate_analysis` sin necesidad de detectar una empresa especifica.

```
// Market-wide / index queries (no specific company needed)
if (/ranking|top\s*\d|bottom\s*\d|ibex|sector|mercado|tendencia|comparativa|evoluci/i.test(q)) {
  return 'corporate_analysis';
}
```

Esto protege todas las preguntas que son claramente sobre analisis de mercado aunque no mencionen una empresa concreta.

## Resultado esperado

- "Me puedes habilitar un informe sobre los top 5 y bottom 5 RIX solo tomando en cuenta chatgpt y el ibex35?" -> `corporate_analysis` (antes: `off_topic`)
- "Dame el ranking del sector energia" -> `corporate_analysis` (OK)
- "Cuentame un chiste" -> `off_topic` (sigue funcionando)
- "Cual es la tendencia del mercado?" -> `corporate_analysis` (antes: dependia del default)
