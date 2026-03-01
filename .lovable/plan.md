

# Destacado inteligente y selectivo de palabras clave en informes PDF

## Filosofia

No se trata de un diccionario estatico ni de llenar de negritas. El sistema debe comportarse como un editor humano que lee el informe y subraya solo las palabras que condensan la esencia: un nombre propio la primera vez que aparece, un veredicto que define una situacion, un calificativo que marca diferencia. Maximo 12-15 terminos unicos por informe.

## Logica de seleccion (heuristica en 4 capas)

### Capa 1 -- Nombres propios (primera aparicion)
- Detectar frases de 2+ palabras donde cada palabra empieza en mayuscula y no estan al inicio de frase (ej. "Banco Santander", "IBEX 35", "Comision Nacional").
- Incluir acronimos de 3+ letras mayusculas (NVM, RIX, CEM).
- Solo la primera ocurrencia se marca en negrita; las siguientes quedan sin formato.

### Capa 2 -- Calificativos de veredicto (alto impacto)
- Lista curada de ~30 adjetivos/expresiones que en contexto reputacional son conclusivos:
  - Positivos: "solido", "excepcional", "consistente", "destacada", "robusta", "lider"
  - Negativos: "critico", "vulnerable", "debil", "deficiente", "erosionada", "fragil"
  - Neutros de alta carga: "sin precedentes", "estructural", "sistematico", "disruptivo"
- Solo se marcan cuando aparecen como parte de una frase valorativa (no sueltos). Se buscan en contexto: precedidos o seguidos de sustantivo (ej. "posicion solida", "riesgo critico").

### Capa 3 -- Expresiones de veredicto compuestas
- Detectar patrones tipo "riesgo [alto/elevado/critico]", "posicion [dominante/debil]", "tendencia [alcista/bajista/negativa]", "evolucion [favorable/desfavorable]".
- Estas frases completas se marcan como unidad.

### Capa 4 -- Control de densidad
- Maximo 12-15 terminos unicos marcados por informe.
- Prioridad: Capa 3 (veredictos compuestos) > Capa 1 (nombres propios) > Capa 2 (calificativos sueltos).
- Si se supera el limite, se descartan los de capa 2 primero.
- Nunca se marca algo que el LLM ya puso en negrita (respeta `**texto**` previo).

## Cambios tecnicos

### Archivo: `src/lib/markdownToHtml.ts`

**1. Nueva funcion `highlightSmartKeywords(text: string): string`**

Se ejecuta sobre el markdown crudo ANTES de la conversion a HTML (antes de `processMarkdownTables`), para trabajar con texto plano y no romper tags.

Pasos internos:
1. Extraer todas las coincidencias de las 3 capas con su posicion en el texto.
2. Filtrar las que ya estan dentro de `**...**` (ya en negrita por el LLM).
3. Ordenar por prioridad de capa y limitar a 12-15 unicos.
4. Para nombres propios, marcar solo la primera aparicion.
5. Envolver cada seleccion en `**...**` (markdown), que luego el pipeline existente convierte a `<strong>`.

**2. Integracion en el pipeline**

```text
Pipeline actualizado:
  highlightSmartKeywords   <-- NUEVO (sobre markdown crudo)
  -> processMarkdownTables
  -> code blocks / inline code
  -> headers
  -> bold/italic
  -> lists
  -> decorative section headers
  -> emoji result blocks
  -> numbered metric blocks
  -> wrapInParagraphs
```

Al operar sobre markdown crudo, no interfiere con ningun parser HTML posterior.

**3. Lista curada de calificativos**

Array `VERDICT_QUALIFIERS` con ~30 terminos, definido en el mismo archivo. No es un glosario generico: son palabras que en un informe reputacional siempre merecen atencion.

**4. Patrones de veredicto compuesto**

Array `VERDICT_PATTERNS` con regex tipo:
- `/\b(riesgo|exposicion|vulnerabilidad)\s+(alto|elevado|critico|significativo|moderado|bajo)\b/gi`
- `/\b(posicion|situacion|tendencia)\s+(dominante|debil|solida|fragil|favorable|negativa)\b/gi`

## Ejemplo de resultado

Texto original del LLM:
> Banco Santander presenta una posicion solida en el IBEX 35. El indice NVM alcanza 78.2 puntos, mientras que la gestion de controversias muestra un riesgo critico que requiere atencion inmediata. Banco Santander ha mejorado su NVM respecto al trimestre anterior.

Despues de `highlightSmartKeywords`:
> **Banco Santander** presenta una **posicion solida** en el **IBEX 35**. El indice **NVM** alcanza 78.2 puntos, mientras que la gestion de controversias muestra un **riesgo critico** que requiere atencion inmediata. Banco Santander ha mejorado su NVM respecto al trimestre anterior.

Notar: "Banco Santander" y "NVM" solo en negrita la primera vez. "posicion solida" y "riesgo critico" como veredictos compuestos.

## Impacto

- 1 archivo modificado: `src/lib/markdownToHtml.ts`
- Sin cambios en backend, edge functions ni componentes UI
- Aplica a ambas rutas de exportacion gracias al motor unificado
- Densidad controlada: maximo ~15 negritas automaticas por informe

