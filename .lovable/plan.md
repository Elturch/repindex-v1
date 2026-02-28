
Objetivo: eliminar por completo (en cualquier caso) respuestas de tipo “supera el límite” y garantizar entrega íntegra del informe en chat, aunque requiera varias continuaciones internas.

Diagnóstico confirmado
- La alucinación sí sale del modelo durante el stream (session replay lo muestra literalmente, incluyendo “documento aparte” y “/Informes_RIX/...”).  
- En `supabase/functions/chat-intelligence/index.ts` ya existe regla anti-truncación en prompts y `max_completion_tokens=40000`, pero eso no basta.
- Causa técnica principal: el backend no detecta truncado por `finish_reason="length"` ni ejecuta continuación automática.
- Causa técnica secundaria: el stream se reenvía en tiempo real sin “compliance gate”, así que si aparece una frase prohibida, ya llegó al usuario.

Plan de implementación

1) Detección formal de truncado y fin incompleto
- Archivo: `supabase/functions/chat-intelligence/index.ts`
- Extender `streamOpenAIResponse` y `streamGeminiResponse` para devolver también:
  - `finishReason` (ej. `length`, `stop`, etc.)
  - `wasTruncated` (boolean derivado)
- Extender `callAIWithFallback` (modo no streaming) para devolver `finishReason` y `wasTruncated`.
- Resultado: el sistema sabrá de forma explícita cuándo el modelo cortó por límite.

2) Continuación automática multi-tramo (sin intervención del usuario)
- Archivo: `supabase/functions/chat-intelligence/index.ts`
- Crear helper unificado (ej. `generateCompleteReportWithContinuation`) con:
  - máximo de tramos (p.ej. 4–6),
  - prompt de continuación estricto: “Continúa exactamente desde la última frase útil, sin repetir, sin prólogos, sin mencionar límites/plataforma/archivos”.
- Lógica:
  - generar tramo 1,
  - si `wasTruncated=true`, pedir tramo 2 y concatenar,
  - repetir hasta `finishReason !== "length"` o alcanzar tope seguro.
- Esto aplica a streaming y no-streaming para comportamiento consistente.

3) Guardrail anti-alucinación por contenido (regex de cumplimiento)
- Archivo: `supabase/functions/chat-intelligence/index.ts`
- Implementar validador de texto prohibido con variantes amplias:
  - “supera el límite”, “límite máximo permitido”, “límite técnico”,
  - “documento aparte”, “carpeta segura”, “/Informes_RIX”, “te lo dejé guardado”, etc.
- Si detecta patrón prohibido:
  - no dar por válida la respuesta,
  - ejecutar regeneración/continuación correctiva automática con instrucción de cumplimiento,
  - solo cerrar cuando el contenido final esté limpio.
- Importante: incluir también la variante exacta reportada por ti (“La respuesta supera el límite máximo permitido en esta plataforma.”).

4) Compliance gate en streaming (para que nunca se vea texto prohibido)
- Archivo: `supabase/functions/chat-intelligence/index.ts`
- Cambiar estrategia de emisión:
  - buffer interno con “holdback window” (cola de caracteres),
  - validar antes de hacer `enqueue` al cliente,
  - emitir solo texto que ya pasó el filtro.
- Si aparece patrón prohibido en buffer:
  - cortar ese tramo internamente,
  - lanzar continuación correctiva,
  - seguir stream sin exponer el texto prohibido.
- Resultado: aunque el modelo intente esa frase, no llega a UI.

5) Refuerzo adicional de prompts (defensa en profundidad)
- Archivo: `supabase/functions/chat-intelligence/index.ts`
- Mantener reglas actuales y ampliar redacción:
  - prohibición explícita de “límite máximo permitido en esta plataforma”,
  - prohibición de prometer exportaciones/ficheros no existentes,
  - instrucción de continuidad silenciosa (“si falta espacio, continúa directamente en el siguiente tramo interno”).
- Esto reduce probabilidad; la garantía real la dan los puntos 1–4.

6) Metadatos de observabilidad para depurar futuros casos
- Archivo: `supabase/functions/chat-intelligence/index.ts`
- Añadir en logs/metadata:
  - `segmentsGenerated`,
  - `hadTruncation`,
  - `hadForbiddenPattern`,
  - `finalProvider`,
  - `finalOutputLength`.
- Permite auditar rápidamente si hubo cortes internos y cómo se resolvieron.

7) Ajuste de UX en frontend para transparencia técnica (sin cambiar experiencia de usuario)
- Archivo: `src/contexts/ChatContext.tsx` (solo si hace falta mostrar estado)
- Mantener un único mensaje de asistente.
- Opcional: mostrar loading más claro (“Completando informe…”) mientras backend encadena tramos.
- No exponer nunca mensajes de “límite” al usuario.

Validación propuesta (criterios de aceptación)
- Caso A (empresa + respuesta muy larga): nunca aparece texto de límite/carpeta; informe completo entregado.
- Caso B (forzar truncado): backend concatena automáticamente múltiples tramos en una sola respuesta final visible.
- Caso C (regex de frase prohibida): el texto prohibido no llega al chat.
- Caso D (fallback OpenAI→Gemini): mantiene mismas garantías de no-truncación/no-alucinación.
- Revisar logs de `chat-intelligence` para verificar `hadTruncation=true` y respuesta final correcta cuando aplique.

Impacto
- Archivos principales: 
  - `supabase/functions/chat-intelligence/index.ts` (núcleo de la solución),
  - opcional `src/contexts/ChatContext.tsx` (solo UX de carga).
- Sin cambios de esquema DB.
- Sin cambios funcionales de negocio: solo robustez de entrega y eliminación de este fallo crítico.

Riesgos y mitigación
- Mayor latencia en respuestas muy largas: mitigado con streaming buffered y mensajes de progreso.
- Riesgo de bucles de continuación: mitigado con tope de tramos + salida segura.
- Riesgo de falsos positivos en regex: usar lista acotada y normalización de texto (acentos/case).

Resultado esperado
- Cero apariciones de “supera el límite…” o “guardado en carpeta…”.
- Entrega exhaustiva real dentro del chat, incluso cuando el contenido exceda un único tramo de generación.
