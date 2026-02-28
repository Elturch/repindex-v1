
Objetivo de esta iteración
- Mantener la regla de profundidad (mínimo 4.500 palabras cuando aplique análisis corporativo), pero evitar respuestas infladas y, sobre todo, eliminar de forma robusta cualquier fallo de salida (mensajes de límite, carpeta, documento aparte, etc.).
- Garantizar que el usuario siempre recibe una respuesta válida, continua y útil en chat.

Diagnóstico técnico confirmado (con evidencia del código y logs)
1) El filtro anti-frases prohibidas no cubre todas las variantes reales
- En logs recientes se coló: “supera el máximo de longitud permitido”.
- Los patrones actuales en `supabase/functions/chat-intelligence/index.ts` y `src/contexts/ChatContext.tsx` buscan sobre todo “límite” y no cubren bien “longitud”.
- Resultado: `hadForbiddenPattern=false` en ejecuciones donde sí se mostró texto prohibido.

2) Falta normalización robusta antes de validar
- El matching actual usa regex directas sobre texto crudo.
- Si el modelo emite acentos combinados/unicode variantes, el patrón puede fallar.
- Resultado: bypass del compliance gate aunque la frase sea semánticamente igual.

3) El embudo está hiperforzado y favorece respuestas excesivas
- En `handleStandardChat` hay instrucción explícita de mínimo 4.500 palabras para análisis de empresa.
- La estructura exige muchos bloques obligatorios + tablas + 8 métricas extensas.
- Resultado: tendencia a “sobreproducción”, mayor latencia y más probabilidad de incidencias de stream/continuaciones.

4) Continuación automática funcional pero mejorable
- Existe bucle de continuación, pero no hay control de “presupuesto de salida” por secciones.
- En continuaciones se arrastra un contexto muy grande, lo que penaliza estabilidad.
- Resultado: riesgo de degradación narrativa (respuestas largas pero menos “razonadas”).

5) Clasificación demasiado permisiva a “corporate_analysis”
- `categorizeQuestion` cae por defecto en `corporate_analysis`.
- Preguntas de prueba o prompts inyectados pueden acabar en pipeline de informe largo.
- Resultado: más exposición a respuestas no deseadas.

Plan de implementación propuesto

Fase 1 — Blindaje real de cumplimiento (no más mensajes de límite)
Archivo principal: `supabase/functions/chat-intelligence/index.ts`  
Archivo complementario: `src/contexts/ChatContext.tsx`

1.1 Normalización previa al filtrado
- Crear helper único de normalización para compliance:
  - lower-case,
  - `normalize("NFD")` + eliminación de diacríticos,
  - colapso de espacios múltiples,
  - normalización de comillas/símbolos.
- Aplicarlo en backend y frontend antes de evaluar patrones.

1.2 Ampliación de patrones prohibidos (familias semánticas)
- Añadir cobertura para variantes con “longitud”, no solo “límite”:
  - “máximo de longitud permitido”,
  - “supera la longitud máxima”,
  - “response generated in this platform exceeds…”, etc.
- Añadir patrones por intención, no solo frase exacta:
  - mención de archivo/carpeta/ruta/guardado externo,
  - promesas de entrega fuera del chat.

1.3 Escaneo incremental robusto en stream
- Mantener holdback, pero validar contra ventana normalizada incremental.
- Detectar frases aunque crucen chunks y aunque vengan con caracteres raros.
- Al detectar:
  - recortar al último boundary limpio,
  - bloquear emisión del segmento contaminado,
  - forzar continuación automática sin exponer texto prohibido.

1.4 Paridad backend/frontend
- Unificar listas de patrones y criterio de normalización (evitar desalineación).
- Frontend sigue como “última red de seguridad”, backend como “gate principal”.

Fase 2 — Calidad de salida: 4.500 sí, pero con control de tamaño y densidad
Archivo principal: `supabase/functions/chat-intelligence/index.ts`

2.1 Política de longitud por tipo de consulta (razonada)
- Mantener mínimo 4.500 para análisis corporativo completo.
- Introducir objetivo de rango (ej. 4.500–5.400) para evitar “Biblia en verso”.
- Si no es análisis corporativo completo, mantener respuesta focalizada (sin forzar macro-informe).

2.2 Presupuesto por secciones del embudo
- Definir guidance de distribución (resumen, pilares, cierre) para evitar expansión desbalanceada.
- Priorizar densidad analítica (hechos + interpretación), no repetición decorativa.

2.3 Cierre por suficiencia
- Añadir instrucción explícita de “terminar cuando el análisis quede completo y accionable”, sin alargar por inercia.
- Evitar duplicar ideas entre pilares.

Fase 3 — Continuación automática más estable
Archivo principal: `supabase/functions/chat-intelligence/index.ts`

3.1 Continuaciones con contexto mínimo efectivo
- En lugar de reinyectar demasiado contenido, usar un prompt de continuación más compacto:
  - estado de sección actual,
  - último fragmento limpio,
  - reglas estrictas de no repetición.
- Reducir carga y deriva en cada tramo.

3.2 Señales de finalización de contenido
- Terminar continuaciones cuando:
  - no hay truncado,
  - no hay contenido prohibido,
  - se cumplen mínimos y estructura útil.

3.3 Non-streaming con misma robustez
- Igualar el comportamiento de continuación y compliance en modo no streaming para que no haya rutas débiles.

Fase 4 — Guardrails de entrada para evitar pipeline incorrecto
Archivo principal: `supabase/functions/chat-intelligence/index.ts`

4.1 Endurecer categorización
- Evitar que prompts de prueba/inyección entren por defecto a `corporate_analysis`.
- Si no hay empresa/sector claro y el prompt parece instrucción de bypass, redirigir a respuesta segura corta.

4.2 Detección de instrucciones “responde literalmente…”
- Tratar como “test_limits” cuando corresponda, sin activar embudo largo.

Fase 5 — Observabilidad y validación operativa
Archivo principal: `supabase/functions/chat-intelligence/index.ts`

5.1 Telemetría adicional
- Registrar:
  - `forbiddenPatternMatched` (valor normalizado),
  - `normalizedMatchSample`,
  - `continuationCount`,
  - `targetWordRangeHit` (sí/no),
  - `finalWordCount`.

5.2 Criterios de aceptación
- Nunca aparece en UI texto de límite/carpeta/documento externo (incluyendo variantes “longitud”).
- Análisis corporativo completo: >= 4.500 palabras y dentro del rango objetivo sin relleno excesivo.
- Preguntas no corporativas: respuesta focalizada, sin activar macro-informe.
- Continuaciones internas transparentes al usuario (una sola respuesta coherente en chat).

Riesgos y mitigación
- Riesgo: falsos positivos por regex demasiado agresiva  
  Mitigación: matching por intención + whitelist de contextos válidos + pruebas con corpus real.
- Riesgo: incremento de latencia por continuaciones  
  Mitigación: menor contexto por tramo + topes de continuación + presupuestos de sección.
- Riesgo: desajuste backend/frontend  
  Mitigación: fuente única de patrones y normalización equivalente en ambos lados.

Impacto esperado
- Se elimina el patrón de fallos repetidos de salida.
- Se conserva profundidad ejecutiva real (4.500+) sin deriva a respuestas innecesariamente interminables.
- Mejora perceptible de calidad: respuestas “las que tienen que ser”, razonadas y estables.
