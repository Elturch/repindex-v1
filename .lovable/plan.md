

## Plan: Eliminar la Ficha de Cabecera duplicada del prompt del LLM

### Problema
La información de contexto del informe aparece dos veces:
1. **Arriba**: El componente `ReportInfoBar` (renderizado por el frontend) — correcto, se queda.
2. **Abajo**: Un bloque markdown `> **Consulta**: ... **Empresa**: ...` generado por el LLM porque el prompt se lo ordena — redundante, hay que eliminarlo.

### Cambio

**Archivo**: `supabase/functions/chat-intelligence/index.ts`

- **Eliminar** las líneas ~5770-5789 (toda la sección "FICHA DE CABECERA") del prompt del orquestador E5.
- **Actualizar** la línea ~5795 para que el TITULAR-RESPUESTA pase a ser "lo primero del informe" (en vez de "después de la ficha").
- **Actualizar** la línea ~5767 para quitar la referencia a la sección de cabecera como obligatoria.
- **Redeploy** de `chat-intelligence`.

Resultado: el LLM dejará de generar el bloque quote redundante y el informe empezará directamente con el titular en negrita. La metadata ya la muestra `ReportInfoBar` automáticamente.

