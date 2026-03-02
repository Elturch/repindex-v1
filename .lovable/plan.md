

# Plan: Datos que Faltan en el Pipeline y Mejoras para Resultados Perfectos

## Auditoria: Datos disponibles en la BD que el pipeline NO usa

He cotejado cada tabla relevante con lo que E2 (DataPack) realmente extrae. Estos son los datos valiosos que se quedan fuera:

### 1. `22_explicacion` — Explicaciones por metrica de cada modelo
**Que es**: Texto detallado donde cada IA explica POR QUE dio ese score a cada metrica. Ejemplo real de TEF/DeepSeek: "Calidad de la Narrativa (NVM=45, Mejorable): Tono general neutro-positivo, baja controversia explicita, pero dependiente de conjeturas..."
**Por que importa**: Es la EVIDENCIA cualitativa mas rica que existe. E3 (Lector) extrae hechos de los textos brutos (respuestas de busqueda), pero las explicaciones son el razonamiento del analista sobre cada dimension. Sin esto, las recomendaciones de E5 no pueden explicar POR QUE una metrica esta baja.
**Estado actual**: E2 lo trae en la query (`"22_explicacion"`) pero NO lo incluye en el DataPack. Se descarta.

### 2. `25_explicaciones_detalladas` — Bloque de explicacion profunda
**Que es**: Explicacion extendida complementaria. Puede estar vacio en algunos modelos pero cuando existe, contiene matices adicionales.
**Estado actual**: Se trae en la query pero se descarta.

### 3. `48_precio_accion` y `49_reputacion_vs_precio` — Datos de mercado
**Que es**: Precio de la accion y analisis narrativo de la relacion reputacion-precio. Ejemplo real: "El precio de Telefonica (3,85 EUR) muestra momentum positivo, +19% desde minimo 52 semanas... PER estimado 9,68 contrasta con RIX Score bajo (48/100)."
**Por que importa**: Para empresas cotizadas, el vinculo reputacion-precio es el dato mas accionable para un CEO o inversor. E5 no puede hablar de impacto en mercado sin esto.
**Estado actual**: No se trae en la query de E2.

### 4. `50_precio_accion_interanual` — Variacion interanual del precio
**Que es**: Texto con contexto de variacion anual del precio.
**Estado actual**: No se trae.

### 5. `11_puntos_clave` — Puntos clave del analisis (JSONB array)
**Que es**: Lista de bullet points con los hallazgos principales de cada modelo. Ejemplo: "Baja densidad informativa en la ventana", "Controversia y riesgo legal bajos", "Inconsistencias en cargos afectan DCM".
**Por que importa**: Son las conclusiones destiladas por cada IA. E3 extrae hechos de textos brutos de 3.000 chars, pero los puntos clave son conclusiones ya procesadas. Son ideales para el consenso entre modelos.
**Estado actual**: No se incluye en el DataPack aunque se trae en la query.

### 6. `corporate_snapshots` — Datos corporativos incompletos
**Que se trae**: ceo_name, president_name, headquarters_city, company_description
**Que falta**: `chairman_name`, `other_executives` (JSONB), `employees_approx`, `founded_year`, `last_reported_revenue`, `fiscal_year`, `mission_statement`, `investor_relations_url`
**Por que importa**: "100.870 empleados", "Mision: Ofrecer la mejor experiencia digital" son datos reales que dan cuerpo al memento sin inventar nada.

### 7. `corporate_news` — Noticias sin contexto
**Que se trae**: headline, published_date, ticker
**Que falta**: `lead_paragraph`, `category`
**Por que importa**: El lead_paragraph da contexto real ("Como reforzar la seguridad digital en un entorno complejo"). Sin el, E5 solo tiene titulares sueltos y no puede razonar sobre el contenido noticioso.

### 8. Categorias de las metricas (`25_nvm_categoria`, etc.)
**Que es**: Clasificacion cualitativa por modelo y metrica: "Bueno", "Mejorable", "Insuficiente"
**Por que importa**: Permite construir tablas de consenso tipo "4/6 IAs califican CEM como Bueno, 2 como Mejorable". Es evidencia cruzada pura sin invencion.
**Estado actual**: Se traen en la query pero NO se incluyen en el DataPack.

## Plan de Mejora: 5 cambios concretos

### Cambio 1: Ampliar el DataPack (E2) con datos que ya se traen pero se descartan

Anadir al interface `DataPack`:

```text
explicaciones_metricas: { modelo: string; explicacion: string }[];
puntos_clave: { modelo: string; puntos: string[] }[];
categorias_metricas: { modelo: string; nvm: string|null; drm: string|null; sim: string|null; rmm: string|null; cem: string|null; gam: string|null; dcm: string|null; cxm: string|null }[];
mercado: { precio: number|null; reputacion_vs_precio: string|null; variacion_interanual: string|null } | null;
```

En `buildDataPack`, tras construir el snapshot, iterar sobre `latestWeek` para extraer:
- `22_explicacion` → `explicaciones_metricas[]` (truncar a 1.500 chars por modelo)
- `11_puntos_clave` → `puntos_clave[]` (parsear JSONB)
- Categorias → `categorias_metricas[]`
- `48_precio_accion`, `49_reputacion_vs_precio`, `50_precio_accion_interanual` → `mercado`

Tambien ampliar la query de snapshot para incluir `48_precio_accion`, `49_reputacion_vs_precio`, `50_precio_accion_interanual`.

### Cambio 2: Enriquecer el memento corporativo (E2)

Ampliar la query de `corporate_snapshots` para traer:
- `chairman_name`, `other_executives`, `employees_approx`, `founded_year`, `last_reported_revenue`, `fiscal_year`, `mission_statement`

Ampliar la query de `corporate_news` para traer:
- `lead_paragraph`, `category`

Actualizar el interface `DataPack.memento` y `DataPack.noticias` con los campos adicionales.

### Cambio 3: E3 (Lector) — Usar explicaciones + puntos clave ademas de textos brutos

Actualmente E3 solo recibe `raw_texts` (respuestas de busqueda). Anadir al prompt de E3 dos bloques adicionales:

```text
EXPLICACIONES POR MÉTRICA (razonamiento de cada IA):
=== ChatGPT ===
NVM=45 Mejorable: "Tono neutro-positivo, baja controversia..."
DRM=52 Mejorable: "Se citan fuentes primarias (CNMV)..."
...

PUNTOS CLAVE (conclusiones destiladas):
=== ChatGPT ===
- Baja densidad informativa en la ventana
- Controversia y riesgo legal bajos
...
```

Esto permite a E3 extraer hechos MUCHO mas ricos sin inventar nada: las explicaciones ya dicen exactamente por que cada metrica tiene ese valor.

Tambien anadir al output de E3 un nuevo campo:
```text
consenso_categorias: { metrica: string; bueno: number; mejorable: number; insuficiente: number }[]
```
Construido determinísticamente (sin LLM) contando las categorias por metrica entre los 6 modelos.

### Cambio 4: E4 (Comparador) — Inyectar explicaciones y mercado

Ampliar el prompt de E4 con:

1. **Consenso de categorias** (dato puro, sin LLM): "CEM: 5 Bueno + 1 Mejorable = consenso robusto"
2. **Datos de mercado** cuando existan: "Precio 3.85 EUR, +19% desde minimo 52 semanas, PER 9.68"
3. **Top 3 puntos clave mas repetidos** entre modelos

Anadir al schema de salida de E4:
```text
"contexto_mercado": "Precio X, PER Y, el RIX Score bajo contrasta con valoracion positiva" | null,
"consenso_categorias": [{"metrica":"CEM","calificacion_dominante":"Bueno","modelos_coincidentes":5}]
```

### Cambio 5: E5 (Orquestador) — Inyectar todo el contexto nuevo

Ampliar el `userPrompt` de E5 con tres bloques adicionales:

```text
=== EXPLICACIONES POR METRICA (E2) ===
{explicaciones_metricas en formato compacto}

=== DATOS DE MERCADO (E2) ===
{mercado si existe, "No cotiza" o "Sin datos de precio" si no}

=== CONSENSO DE CATEGORIAS (E3) ===
{tabla: Metrica | Bueno | Mejorable | Insuficiente}
```

Actualizar el system prompt de E5 con reglas adicionales:

1. **Regla de explicaciones**: "Cuando cites una metrica debil, explica POR QUE usando las explicaciones de los modelos. Ejemplo: 'La Autoridad de Fuentes (41 pts) es baja porque, segun DeepSeek, predominan fuentes T1 (75%) pero faltan T2 diversas.'"

2. **Regla de mercado**: "Si hay datos de mercado (precio, PER, variacion), incluye un parrafo breve en el Resumen Ejecutivo conectando reputacion con cotizacion. SOLO datos del DATAPACK, nunca inventes ratios."

3. **Regla de consenso categorias**: "Usa el consenso de categorias para reforzar la evidencia cruzada. '5 de 6 IAs califican la Gestion de Controversias como Buena' es mas convincente que 'CEM = 78'."

4. **Regla de noticias con contexto**: "Cuando menciones noticias corporativas, incluye el lead paragraph si existe. No resumas lo que no has leido."

## Archivo modificado

`supabase/functions/chat-intelligence/index.ts`:

1. **DataPack interface** (~linea 996): Anadir `explicaciones_metricas`, `puntos_clave`, `categorias_metricas`, `mercado`. Ampliar `memento` y `noticias`.
2. **buildDataPack** (~lineas 1050-1285): Ampliar query de snapshot con precio. Extraer explicaciones, puntos clave, categorias. Ampliar queries de corporate_snapshots y corporate_news.
3. **extractQualitativeFacts E3** (~lineas 1296-1360): Inyectar explicaciones y puntos clave en el prompt. Anadir construccion determinista de `consenso_categorias`.
4. **runComparator E4** (~lineas 1372-1484): Inyectar consenso categorias, datos mercado y puntos clave repetidos.
5. **buildOrchestratorPrompt E5** (~lineas 1487-1619): Inyectar bloques de explicaciones, mercado y consenso en userPrompt. Anadir reglas de uso en systemPrompt.

## Resultado esperado

| Antes | Despues |
|-------|---------|
| "SIM = 41, Mejorable" sin explicar | "Autoridad de Fuentes (41): predominan fuentes T1 (CNMV, Cinco Dias) pero falta diversidad T2. Solo DeepSeek y Perplexity detectan fuentes institucionales primarias." |
| Sin datos de mercado | "El precio (3,85 EUR, +19% vs minimo anual) contrasta con un RIX de 48: el mercado valora la operativa, pero la reputacion algoritmica tiene margen de mejora." |
| Noticias como titulares sueltos | "Telefonica publico en diciembre un posicionamiento sobre seguridad digital: 'reforzar la seguridad en un entorno cada vez mas complejo'. Esto conecta con su GAM (Gobernanza) de 55." |
| "CEM es una fortaleza" | "5 de 6 IAs califican la Gestion de Controversias como Buena (consenso robusto). Solo Perplexity la rebaja a Mejorable." |
| Recomendaciones genericas | "Mejorar la Coherencia Informativa (DCM=38, gap -31 vs competidores): DeepSeek detecta confusion de cargos ('Murtra') que afecta la coherencia interna. La evolucion muestra que DCM subio 5 pts tras corregir datos en el anterior informe anual." |

## Principios que se mantienen intactos

- **Cero invencion**: todo dato viene de la BD, todo razonamiento se ancla en un gap numerico o cita textual real.
- **Competidores solo verificados**: sin cambios en esa logica.
- **Streaming, compliance gate, auto-continuacion**: sin cambios.
- **Fallbacks**: si no hay explicaciones, E3/E5 trabajan con lo que tengan. Si no hay precio, se omite sin mencion.

