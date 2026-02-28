
Objetivo de esta iteración
- Dejar la exportación HTML/PDF “a prueba de cortes”: sin bloques truncados, sin cabeceras decorativas rotas, y con resultados de métricas con emojis tabulados de forma consistente y elegante.
- Aplicar los mismos cambios a ambas rutas de exportación (conversación completa y respuesta individual) para que no vuelva a haber inconsistencias.

Diagnóstico técnico confirmado (sobre código y datos reales)
1) El recorte de informes se explica por reglas de impresión demasiado rígidas
- En `src/contexts/ChatContext.tsx` cada `.message` tiene `page-break-inside: avoid` / `break-inside: avoid`.
- Cuando un bloque de asistente es muy largo (informes de 4.500+ palabras), el motor de impresión intenta no partirlo y termina cortando/rompiendo paginación.
- También hay reglas de tabla con `page-break-inside: avoid` que pueden causar clipping en tablas largas.

2) Las “cabeceras entre líneas dobles” no se parsean como estructura, quedan como texto crudo
- En contenido real aparecen patrones como:
  - `════════════════════`
  - `RESUMEN EJECUTIVO`
  - `════════════════════`
- `convertMarkdownToHtml` no tiene parser para estas bandas; pasan a párrafo, se pegan con texto adyacente y se desordenan (especialmente en print).

3) La tabulación de resultados con emojis cubre pocos casos
- El parser actual (`processEmojiResultBlocks`) solo detecta líneas que empiezan por emoji.
- En informes reales abundan líneas tipo:
  - `1. Calidad de la Narrativa — 61 pts 🟡`
- Ese formato no se convierte a grid/tabla, por eso siguen saliendo “sueltas”.

4) Hay dos motores de exportación distintos y desalineados
- `src/contexts/ChatContext.tsx` usa `src/lib/markdownToHtml.ts`.
- `src/components/ui/markdown-message.tsx` tiene su propio convertidor interno (duplicado), sin todas las mejoras recientes (p. ej., grids emoji).
- Resultado: dependiendo de dónde exportes, el PDF sale distinto.

Plan de implementación

Fase 1 — Blindaje de paginación para que no se corte nada
Archivos:
- `src/contexts/ChatContext.tsx`
- `src/lib/markdownToHtml.ts`
- `src/components/ui/markdown-message.tsx`

Cambios:
1.1 Relajar bloqueos de salto de página en contenedores grandes
- Quitar `break-inside/page-break-inside: avoid` de wrappers de mensaje completos.
- Mantener `avoid` solo en elementos pequeños que sí deben ir juntos (chips, cards cortas, cabeceras locales, filas concretas).

1.2 Reglas de impresión robustas para contenido largo
- Definir explícitamente:
  - `overflow-wrap: anywhere;`
  - `word-break: break-word;`
  - en `p`, headings, celdas de tabla y bloques decorativos.
- Evita cortes visuales por líneas largas sin espacios (especialmente separadores Unicode).

1.3 Tablas imprimibles multipágina
- Cambiar estrategia de tablas largas:
  - permitir `page-break-inside: auto` en tabla global,
  - mantener integridad por fila (`tr { break-inside: avoid; }`),
  - conservar `thead { display: table-header-group; }`.

Fase 2 — Parseo estructural de cabeceras decorativas con línea superior/inferior
Archivo:
- `src/lib/markdownToHtml.ts`

Cambios:
2.1 Nuevo parser previo a `wrapInParagraphs`
- Añadir `processDecorativeSectionHeaders` para detectar bloques:
  - línea de separación (repetición de `═`, `=`, `-`, `─`, etc.),
  - título intermedio,
  - misma línea de separación debajo.
- Transformarlo a HTML semántico (ej. `<div class="section-band">...</div>` o heading dedicado).

2.2 Estilo editorial sin riesgo de corte
- CSS nuevo para `section-band`:
  - doble línea controlada por bordes (no texto de caracteres repetidos),
  - título centrado y con line-height seguro,
  - `break-inside: avoid` solo para esa banda.
- Resultado: mismo look ejecutivo, sin texto recortado.

Fase 3 — Tabulación real de resultados con emojis (incluyendo métricas numeradas)
Archivo:
- `src/lib/markdownToHtml.ts`

Cambios:
3.1 Ampliar detección de bloques de resultados
- Mantener soporte actual para líneas que empiezan por emoji.
- Añadir soporte para líneas de métrica numerada con emoji al final:
  - patrón tipo `N. Nombre métrica — 61 pts 🟡`.
- Parsear en columnas estables: índice, métrica, valor, estado (emoji).

3.2 Render a tabla/grid profesional
- Crear estructura `emoji-metrics-table` (o grid equivalente) con:
  - alineación numérica tabular,
  - ancho fijo para estado emoji,
  - columnas consistentes en pantalla y print.

3.3 Compatibilidad con variaciones reales
- Soportar separadores `—`, `-`, `:` y unidades `pts`, `puntos`.
- Tolerar espacios dobles y acentos sin romper parseo.

Fase 4 — Unificación de motores de exportación (el cambio más importante para estabilidad)
Archivo clave:
- `src/components/ui/markdown-message.tsx`

Cambios:
4.1 Eliminar deriva por duplicación
- Sustituir el convertidor local duplicado por el convertidor compartido de `src/lib/markdownToHtml.ts`.
- Importar estilos compartidos (tablas, emoji grids, nuevas section bands) en lugar de mantener CSS paralelo incompatible.

4.2 Igualar output entre “Descargar informe” y “Descargar respuesta”
- Asegurar que ambos caminos consumen el mismo parser + mismas reglas print.
- Esto evita que una corrección funcione en `/chat` pero falle en descarga individual.

Fase 5 — Validación con casos reales de producción (los que ya fallan)
Validaciones obligatorias:
1) Informe largo (4.500+ palabras) con varios bloques:
- Verificar que no hay truncado de texto ni “cortes secos”.

2) Cabeceras decorativas:
- Caso `════════ / TÍTULO / ════════` debe renderizarse limpio, sin texto cortado.

3) Bloques de métricas con emojis:
- Líneas tipo `1. ... — 61 pts 🟡` deben verse tabuladas y alineadas.

4) Exportación por ambas rutas:
- Conversación completa (`ChatContext.downloadAsHtml`)
- Respuesta individual (`MarkdownMessage.generateExportHtml`)

Criterios de aceptación
- No hay cortes en PDFs/print de informes extensos.
- Las cabeceras “entre líneas” quedan limpias y uniformes (sin desbordes).
- Los resultados con emojis aparecen en formato tabulado, no como texto suelto.
- La salida visual es consistente en todas las opciones de exportación.
- Se mantiene la estética editorial definida por el proyecto (DM Sans, paleta corporativa, jerarquía ejecutiva).

Riesgos y mitigación
- Riesgo: sobre-detección de separadores y convertir texto que no toca.
  - Mitigación: exigir patrón de 3 líneas (línea+título+línea) con umbral mínimo de longitud.
- Riesgo: tablas extremadamente largas en print.
  - Mitigación: permitir cortes por tabla completa pero proteger filas y repetir encabezado.
- Riesgo: regresión visual por retirar reglas `avoid`.
  - Mitigación: mover `avoid` a bloques pequeños/clave en lugar de contenedores gigantes.
