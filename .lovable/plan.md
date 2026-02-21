

# Plan: Convertir al Agente Rix en un campeon de respuestas

## Diagnostico: Por que las respuestas pierden matices

El problema NO esta en las instrucciones al LLM (que son excelentes), ni en la estructura del Embudo Narrativo (que es solida). El problema esta en que **el LLM recibe datos amputados** y luego se le pide que haga un analisis de nivel ejecutivo con ellos.

### Los 5 cuellos de botella actuales

**1. Las respuestas brutas de cada IA estan truncadas a 600-800 caracteres**
- Linea 4468: `rawField.substring(0, 600)` (multi-semana)
- Linea 4496: `rawField.substring(0, 800)` (semana unica)
- Estas respuestas son textos de 3.000-8.000 caracteres donde cada IA explica EN DETALLE por que puntua como puntua. El LLM solo ve el 10-20% del texto original. Es como pedirle a un analista que haga un informe leyendo solo el primer parrafo de cada fuente.

**2. Las categorias de metricas se cargan pero NUNCA se inyectan en el contexto**
- Se cargan: `25_nvm_categoria`, `28_drm_categoria`, `31_sim_categoria`, etc. (lineas 3988-3995)
- Pero en la tabla de scores (lineas 4475-4479), solo se muestran los numeros, nunca la categoria ("fortaleza", "riesgo", "mejora"). El LLM tiene que adivinar la interpretacion en lugar de recibirla pre-calculada.

**3. Las explicaciones detalladas se cargan pero se descartan**
- `22_explicacion` y `25_explicaciones_detalladas` se piden en la query (lineas 3978-3979) pero NUNCA aparecen en la seccion 6.1 de contexto de empresa. Son los textos donde el sistema de analisis V2 explica POR QUE puso cada puntuacion. Es inteligencia pura que se tira a la basura.

**4. Los resumenes estan truncados a 500 caracteres**
- Linea 4485: `r["10_resumen"].substring(0, 500)` — un resumen de 1.500 chars se corta a un tercio.

**5. El ranking general consume tokens sin aportar al analisis de empresa**
- 150 filas de ranking individual (lineas 4764-4767) + 50 filas de promedios (lineas 4782-4788) = ~5.000 tokens de tablas que el LLM raramente necesita cuando el usuario pregunta por UNA empresa. Estos tokens podrian usarse para los textos completos.

## Plan de accion: 5 cambios en un solo archivo

Archivo: `supabase/functions/chat-intelligence/index.ts`

### Cambio 1 — Textos brutos COMPLETOS para la empresa preguntada

Cuando el usuario pregunta por una empresa concreta, el texto bruto de cada modelo es la fuente primaria de matices. Ampliar de 600/800 chars a 3.000 chars para la empresa principal (la primera detectada) y mantener 800 para las demas empresas detectadas.

```
Antes (linea 4496):
rawField.substring(0, 800)

Despues:
rawField.substring(0, isPrimaryCompany ? 3000 : 800)
```

Mismo cambio en linea 4468 para multi-semana (de 600 a 2500/600).

`isPrimaryCompany` se determina comparando con `detectedCompanies[0]`.

### Cambio 2 — Inyectar categorias de metricas en la tabla de scores

Anadir una fila de interpretacion debajo de cada modelo en la tabla de contexto:

```
Antes:
| ChatGPT | 64 | 71 | 63 | 35 | 35 | 100 | 50 | 88 | 62 |

Despues:
| ChatGPT | 64 | 71 | 63 | 35 | 35 | 100 | 50 | 88 | 62 |
| _(interpretacion)_ | | fortaleza | mejora | riesgo | riesgo | fortaleza | mejora | fortaleza | mejora |
```

Esto se logra leyendo los campos `25_nvm_categoria`, `28_drm_categoria`, etc. que YA estan cargados.

### Cambio 3 — Incluir explicaciones detalladas para la empresa principal

Para la empresa principal (la que el usuario pregunta), anadir un bloque con `22_explicacion` y/o `25_explicaciones_detalladas` despues de cada texto bruto:

```typescript
// Solo para la empresa principal, inyectar explicaciones del analisis
if (isPrimaryCompany) {
  if (r["22_explicacion"]) {
    context += `- **Explicacion del analisis**: ${r["22_explicacion"].substring(0, 2000)}\n`;
  }
  if (r["25_explicaciones_detalladas"]) {
    const detalladas = typeof r["25_explicaciones_detalladas"] === 'string' 
      ? r["25_explicaciones_detalladas"] 
      : JSON.stringify(r["25_explicaciones_detalladas"]);
    context += `- **Desglose dimensional**: ${detalladas.substring(0, 2000)}\n`;
  }
}
```

### Cambio 4 — Resumenes completos (sin truncar)

Ampliar el limite del resumen de 500 a 1500 caracteres para la empresa principal:

```
Antes (linea 4485):
r["10_resumen"].substring(0, 500)

Despues:
r["10_resumen"].substring(0, isPrimaryCompany ? 1500 : 500)
```

### Cambio 5 — Ranking inteligente: completo solo cuando se pide

Reducir el ranking individual de 150 a 30 filas y el de promedios de 50 a 20 filas EXCEPTO cuando el usuario pregunta explicitamente por rankings, top, IBEX completo, etc.

```typescript
// Detectar si la consulta pide ranking explicitamente
const isRankingQuery = /\b(ranking|top\s?\d|ibex|clasificaci[oó]n|mejor|peor|l[ií]der|primera|[uú]ltima|posici[oó]n|listado|todas las empresas)\b/i.test(question);

const rankingLimit = isRankingQuery ? 150 : 30;
const averageLimit = isRankingQuery ? 50 : 20;
```

Los tokens liberados (~3.000-4.000) se redirigen automaticamente a los textos brutos y explicaciones de la empresa principal.

## Resultado esperado

El LLM recibira, para la empresa preguntada:
- 6 textos brutos de ~3.000 chars cada uno (antes: 800) = la materia prima completa
- 6 categorias por metrica (antes: ninguna) = interpretacion pre-calculada
- 6 explicaciones detalladas (antes: ninguna) = el "por que" de cada puntuacion
- 6 resumenes de ~1.500 chars (antes: 500) = contexto completo
- 8 scores numericos + RIX por modelo (sin cambios)

Con esta informacion, el LLM puede:
- Cruzar lo que dice ChatGPT con lo que dice DeepSeek sobre el mismo tema
- Identificar matices cualitativos que solo aparecen en un modelo
- Usar las categorias para no tener que "adivinar" si un 35 es malo
- Citar explicaciones concretas del analisis en lugar de inventar interpretaciones

## Impacto en tokens

```text
Antes:
  Textos brutos:     6 x 800  = 4.800 chars (~1.200 tokens)
  Resumenes:         6 x 500  = 3.000 chars (~750 tokens)
  Explicaciones:     0 chars
  Categorias:        0 chars
  Ranking:           150 filas + 50 filas = ~5.000 tokens
  Total empresa:     ~7.000 tokens utiles

Despues:
  Textos brutos:     6 x 3.000 = 18.000 chars (~4.500 tokens)
  Resumenes:         6 x 1.500 = 9.000 chars (~2.250 tokens)
  Explicaciones:     6 x 2.000 = 12.000 chars (~3.000 tokens)
  Categorias:        ~200 chars (~50 tokens)
  Ranking:           30 filas + 20 filas = ~2.000 tokens
  Total empresa:     ~12.000 tokens utiles
```

Incremento neto: ~5.000 tokens. Dentro del margen del modelo o3 (200k contexto) y Gemini 2.5 Flash (1M contexto). Sin riesgo de timeout.

## Lo que NO cambia

- El Embudo Narrativo (estructura de respuesta)
- El system prompt (reglas, tono, estilo)
- "Guia, no corse" (flexibilidad adaptativa)
- El principio de densidad de evidencia cruzada
- La deteccion de empresas y temas
- El grafo de conocimiento y vector store
- El analisis de regresion
- El frontend
- Las queries de datos (ya cargan todo, solo no lo muestran)

## Seccion tecnica

| Linea(s) | Cambio |
|----------|--------|
| ~4412 | Calcular `isPrimaryCompany` comparando con `detectedCompanies[0]` |
| 4468 | Ampliar substring de textos brutos multi-semana: 600 a 2500 (primaria) / 600 (resto) |
| 4475-4479 | Anadir fila de categorias debajo de cada modelo en tabla de scores |
| 4482-4498 | Inyectar `22_explicacion` y `25_explicaciones_detalladas` para empresa primaria |
| 4485 | Ampliar substring de resumen: 500 a 1500 (primaria) / 500 (resto) |
| 4496 | Ampliar substring de textos brutos: 800 a 3000 (primaria) / 800 (resto) |
| 4764-4767 | Reducir ranking individual segun `isRankingQuery` |
| 4782-4788 | Reducir promedios segun `isRankingQuery` |

