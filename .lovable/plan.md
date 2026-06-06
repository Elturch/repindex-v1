## Objetivo

Eliminar la regresión sistémica de R24 (adjetivos valorativos sin cifra de respaldo) con un **parche determinista post-LLM**, sin tocar prompts, glosario, R20-R23/R25 ni la regla 24 del prompt. Cero invención de datos.

## Archivos a tocar (sub-commit atómico)

### 1. `supabase/functions/chat-intelligence-v2/prompts/narrativeQuality.ts` (modificado)

Append al final del archivo, **sin tocar** la export `NARRATIVE_QUALITY_PROMPT`, ni `R20_GLOSSARY_MAP`, ni `enforceR20Acronyms`:

- **Constante** `R24_EMPTY_ADJECTIVES: string[]` (lista cerrada, espejo exacto de la regla 24 con variantes de género/número):
  ```
  robusto, robusta, robustos, robustas
  sólido, sólida, sólidos, sólidas
  compacto, compacta, compactos, compactas
  potente, potentes
  fuerte, fuertes
  débil, débiles
  excelente, excelentes
  notable, notables
  destacado, destacada, destacados, destacadas
  significativo, significativa, significativos, significativas
  relevante, relevantes
  importante, importantes
  considerable, considerables
  sustancial, sustanciales
  ```

- **Exclusiones contextuales** (no cuentan como violación aunque carezcan de cifra):
  - Bandas interpretativas canónicas de R12: `"Sólido 🟢"`, `"Débil 🟠"` (detectables por emoji adyacente o por aparecer dentro de paréntesis tras un valor: `(78,4 — Sólido 🟢)`).
  - Adjetivo dentro de un bloque ya parentetizado con cifra delante: `(RIX 78,4 sólido)` → exento.

- **Función exportada** `enforceR24Adjectives(markdown: string): { output: string; substitutions: number; removals: number; warnings: string[] }`.

### 2. `supabase/functions/chat-intelligence-v2/orchestrator.ts` (cableado mínimo)

Insertar **inmediatamente después** del bloque `try { const r20 = enforceR20Acronyms(...) }` (el añadido en el sub-commit anterior, ~líneas 1037-1052):

```ts
try {
  const r24 = enforceR24Adjectives(content);
  if (r24.substitutions > 0 || r24.removals > 0) {
    console.log(`[R24] skill=${skill.name} reanchored=${r24.substitutions} removed=${r24.removals}`);
    content = r24.output;
  }
  if (r24.warnings.length > 0) {
    console.warn(`[R24] skill=${skill.name} warnings=`, r24.warnings);
  }
} catch (r24Err) {
  console.warn("[R24] enforceR24Adjectives failed (non-fatal):", r24Err);
}
```

Y ampliar el import existente:
```ts
import { enforceR20Acronyms, enforceR24Adjectives } from "./prompts/narrativeQuality.ts";
```

## Lógica determinista

### Paso 0 — Filtrado por línea (idéntico a R20)

Mismas guardas: skip de líneas que empiezan por `|`, `#`, `>`, dentro de bloques ```` ``` ````, o dentro de secciones cuyo encabezado contiene `glosario` o `metodología`. Reset implícito por bloque `##`/`###` (las decisiones son por frase, no acumulativas).

### Paso 1 — Tokenización por párrafo y por frase

- **Párrafo** = secuencia de líneas no vacías consecutivas (separadas por línea en blanco).
- **Frase** dentro del párrafo: split con regex `/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÑ«"¿¡—])/u`.
  - El lookahead exige mayúscula, comilla o signo de apertura: evita romper en `62.8`, `1.234`, `Sr.`, `S.A.`, `Ltd.`, decimales con punto y abreviaturas comunes.
  - El lookbehind acepta `.`, `!`, `?`, `…`.
- Conservar índices originales para reensamblar sin perder espaciado.

### Paso 2 — Detección de "cifra válida en la frase"

Regex: `/(?<![A-Za-z])[-+]?\d+(?:[.,]\d+)?%?(?![A-Za-z])/g`
- Excluir tokens de año puro `\b20\d\d\b` (igual que `execNarrativeValidator.extractNumbers`).
- Excluir números de sección/bullet tipo `1.`, `2)` (si el token aparece al inicio de la frase y va seguido inmediatamente de `.` o `)` + espacio, descartarlo).
- Si tras los filtros queda ≥1 token numérico → la frase tiene **cifra propia** → adjetivo OK.

### Paso 3 — "Cifra de respaldo del mismo sujeto en frase contigua"

Definición operacional **conservadora** (para no inventar relaciones):

- **Sujeto candidato** de una frase = primer proper noun detectado (mayúscula inicial, no al principio absoluto de la frase, no preposición ni mes). Heurística: extraer matches de `/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*\b/u` y tomar el primero; si la frase empieza con proper noun, también vale.
- También se considera sujeto un **ticker** del universo (lista cargada como constante `R24_IBEX_TICKERS` con el mismo set que el `ignoreList` de R20: `BBVA`, `SAN`, `ITX`, `TEF`, `REP`, etc. — los tickers ya observados en los warnings de R20, no se inventan; se enumeran explícitamente en código).
- **Reancla** la cifra de la frase contigua (anterior o posterior, dentro del mismo párrafo) **solo si** se cumplen **TODAS**:
  1. La frase contigua contiene ≥1 cifra válida (paso 2).
  2. El sujeto candidato de la frase del adjetivo aparece textualmente en la frase contigua, **o** la frase del adjetivo no tiene sujeto propio explícito (sujeto implícito continuado).
  3. La cifra contigua no es ya un año puro ni un número de sección.
- **Reescritura mínima**: añadir ` (referencia: ${cifra})` justo antes del signo de puntuación final de la frase del adjetivo. No se toca el texto del adjetivo. Se cuenta como `substitutions++`.
- Se elige la **primera cifra disponible** de la frase contigua, priorizando frase **posterior** (suele ser la justificación) sobre frase anterior.

### Paso 4 — Sin cifra disponible: neutralización (no invención)

Si ni la frase del adjetivo ni las contiguas dentro del párrafo aportan cifra de respaldo válida:

- **Eliminar** el adjetivo del texto. Estrategia mínima:
  - Si el adjetivo va precedido por artículo + sustantivo (`una reputación sólida`, `desempeño notable`): borrar el adjetivo y el espacio precedente → `una reputación`, `desempeño`.
  - Si el adjetivo abre la frase (`Sólido desempeño en...`): borrar adjetivo + capitalizar siguiente palabra → `Desempeño en...`.
  - Si el adjetivo va precedido por adverbio cuantificador (`muy sólido`, `bastante notable`): borrar adverbio + adjetivo conjuntamente.
  - Colapsar dobles espacios resultantes (`/  +/g → ' '`) y normalizar `\s+([,.;:])` → `\1`.
- Contar como `removals++`.
- Log warning: `[R24] adjetivo sin cifra eliminado: "<adjetivo>" en frase: "<frase truncada a 80 chars>"`.

### Paso 5 — Excepciones definitivas

- Adjetivo precedido **inmediatamente** por una cifra en la misma frase (ej. `78,4 sólido`) → OK por paso 2, no actúa.
- Adjetivo dentro de paréntesis con cifra dentro: `(RIX 78,4 — Sólido 🟢)` → la cifra está en la misma frase, OK.
- Adjetivo en banda interpretativa canónica (`Sólido 🟢`, `Crítico 🔴`, etc.): si el adjetivo va seguido por uno de los emojis `🟢🟡🟠🔴💎` o precedido por `—` dentro de paréntesis → exento.
- Blockquotes (`>`), tablas (`|`), encabezados (`#`), glosario, metodología, citas literales entre comillas tipográficas (`"..."` / `«...»`): exentos en bloque desde paso 0 (líneas) y, dentro de líneas válidas, las frases entre comillas se marcan y se saltan.

### Paso 6 — Idempotencia y orden con R20

- R24 corre **después** de R20 en el orchestrator. Esto es deliberado: si R20 expandió `CEM` → `Gestión de Controversias (CEM)`, la frase ya contiene el sustantivo "Controversias" y el sujeto puede detectarse mejor. La cifra que valida el adjetivo no se ve afectada.
- R24 nunca toca números → R23 intacta.
- R24 nunca añade ni quita acrónimos → R20 intacta.
- R24 nunca toca tablas, encabezados ni numeración → R12/R14/R17 intactas.

## Casos de prueba mentales (para que valides el contrato antes de aprobar)

| Entrada | Decisión esperada | Acción |
|---|---|---|
| `CaixaBank presenta una reputación sólida.` | Sin cifra propia; sin cifra contigua del mismo sujeto. | **Remove**: `CaixaBank presenta una reputación.` + warning |
| `CaixaBank presenta una reputación sólida. Su RIX se sitúa en 71,2.` | Cifra de respaldo en frase posterior, mismo sujeto implícito. | **Reanchor**: `CaixaBank presenta una reputación sólida (referencia: 71,2). Su RIX se sitúa en 71,2.` |
| `CaixaBank muestra un RIX sólido de 78,4.` | Cifra propia. | **OK**, no toca. |
| `BBVA (62,8 — Sólido 🟢) lidera el grupo.` | Banda canónica (emoji adyacente). | **Exento**. |
| `Sólido desempeño en gobernanza.` | Sin cifra ni sujeto. | **Remove + capitalize**: `Desempeño en gobernanza.` + warning |
| `Merlin tiene una posición fuerte. Inditex también es fuerte, con RIX 83,1.` | Frase 1: sujeto Merlin, frase 2: sujeto distinto Inditex → no reancla cross-subject. | **Remove en frase 1** + warning. Frase 2 OK (cifra propia). |
| Línea en tabla `\| sólido \| 78,4 \|` | Skip de línea por `|`. | **Exento**. |

## Fuera de alcance

- R20, R21, R22, R23, R25 (intactos)
- Glosario y diccionario embebido en la regla 24 del prompt (intacto)
- `src/lib/rixMetricsGlossary.ts` (no se importa)
- Cualquier otro archivo (frontend, skills, guards)
- Detección semántica avanzada / NER real (uso heurístico determinista declarado)

## Verificación post-commit

Tras aplicar, Sanity IBEX y revisión de `edge_function_logs`:
- `[R24] skill=… reanchored=N removed=M`
- `[R24] warnings=[...]`
- 0 `[R24] enforceR24Adjectives failed`
- 3/3 verde, cero regresiones R20-R23/R25
- Inspección manual de las 2 frases que detecté la última vez (CaixaBank "robusta" y Merlin "sólida"): deben venir o reancladas con cifra o sin el adjetivo.

## Puntos abiertos que necesito que valides antes de implementar

1. **Reescritura con `(referencia: NN)`**: ¿formato OK o prefieres otra fórmula (`(RIX NN)` solo cuando la cifra es de RIX, `(SIM NN)` cuando es de submétrica)? Detectar tipo requiere mirar la palabra previa/posterior al número en la frase contigua; factible pero añade complejidad. Mi recomendación: empezar con `(referencia: NN)` por seguridad; iterar si queda feo.
2. **Lista de tickers IBEX hardcodeada**: ¿la enumero en código (set cerrado con los ~120 tickers vistos en R20 warnings) o me limito a heurística de mayúsculas? La hardcoded da mejor detección de sujeto cross-frase pero introduce mantenimiento. Mi recomendación: incluir el set core IBEX-35 (35 tickers) + dejar la heurística de proper noun para el resto.
3. **Neutralización al inicio de frase**: ¿OK eliminar y recapitalizar, o prefieres dejar el adjetivo intacto y solo registrar warning sin reescribir (modo "auditoría sin acción" en frases ambiguas)? Mi recomendación: eliminar siempre que la regla heurística sea segura; si no es segura (ej. el adjetivo es la palabra única antes del verbo), solo loggear warning sin tocar.
