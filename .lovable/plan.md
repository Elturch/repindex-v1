# Plan de Desarrollo RepIndex

## ✅ Completado: Sistema de Visibilidad de Errores de API

**Fecha**: 2026-01-28

Se implementó un panel de errores de API en `SweepMonitorPanel.tsx` que proporciona:

1. **Resumen por modelo**: Conteo de errores y tipo principal de error por cada IA (ChatGPT, Grok, Deepseek, etc.)
2. **Clasificación automática**: Los errores se clasifican en 6 tipos:
   - `auth`: Errores de autenticación (401, API key)
   - `rate_limit`: Límites de tasa (429, quota)
   - `timeout`: Timeouts de conexión
   - `payload`: Errores de estructura (422, 400, deserialize)
   - `connection`: Errores de red
   - `unknown`: No clasificados
3. **Tabla de errores recientes**: Muestra los últimos 10 errores con ticker, modelo, tipo y timestamp
4. **Diagnóstico automático**: Alertas especiales para errores críticos (ej: errores de payload)

### Archivos Modificados
- `src/components/admin/SweepMonitorPanel.tsx`: Panel de errores de API con UI completa

### Hallazgo Importante
Se detectó que **Grok tiene errores HTTP 422** debido a un problema con el esquema de `tools` (missing field `parameters`). Esto es un bug separado en `rix-search-v2` que debe corregirse.

---

## Próximas Mejoras Potenciales

1. **Corregir bug de Grok**: El esquema de tools enviado a xAI tiene formato incorrecto
2. **Acción de reintentar**: Añadir botón para reintentar análisis fallidos directamente desde el panel
3. **Alertas proactivas**: Notificaciones cuando el % de errores supere un umbral
