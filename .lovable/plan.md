Plan de corrección:

1. Corregir el anclaje de fechas de informes
- En `src/lib/reports/filterState.ts`, añadir helpers ISO basados en UTC para operar siempre sobre `YYYY-MM-DD`.
- Reescribir `reanchorWindow` para que `last_week`, `last_month`, `last_quarter` y `ytd` no dependan de la zona horaria local.
- Mantener intactas las ventanas `custom` elegidas por el usuario.

2. Aplicar ese anclaje en `/informes`
- En `src/pages/RixReports.tsx`, sustituir el cálculo manual con `new Date(...T00:00:00)` por `reanchorWindow`.
- Así el informe por defecto terminará exactamente en el último barrido disponible, por ejemplo `2026-05-17`, no `2026-05-16`.

3. Corregir los chips 7d / 30d / 90d / YTD
- En `src/components/reports/FilterPanel.tsx`, reemplazar los cálculos manuales por `reanchorWindow`.
- Evitar formatear ISO dates con `new Date(YYYY-MM-DD)` para mostrarlas, porque también puede desplazar el día.
- Mostrar las fechas ISO directamente donde ya están en formato `YYYY-MM-DD`.

4. Blindar el auto-envío del informe en `/visor`
- En `src/pages/RixViewer.tsx`, hacer que el auto-envío espere a tres condiciones: usuario autenticado, sesión activa correcta y carga de histórico terminada.
- Evitar duplicados por `reportId`.
- Mantener visible el estado “generando” mientras el informe está pendiente.

5. Hacer visible el fallo si el backend no llega a responder
- En `src/contexts/ChatContext.tsx`, comprobar errores al guardar el mensaje de usuario.
- Si el guardado falla, insertar un mensaje visible de error y no dejar la sesión con una pregunta guardada sin respuesta.
- Si V2 se corta por timeout o aborto, mostrar también un mensaje de asistente persistible/visible, no solo un toast efímero.

Validación prevista:
- Confirmar en código que no queda `new Date(${lastBatchDate}T00:00:00)` en informes.
- Confirmar que una ventana 30d con último barrido `2026-05-17` termina en `2026-05-17`.
- Confirmar que `/visor` no llama a `sendMessage` hasta que `sessionId` coincide y `isLoadingHistory` es falso.

Fuera de alcance:
- No tocar base de datos.
- No tocar APIs externas.
- No modificar `sundayResolver`, pipeline de barrido ni prompts del agente.