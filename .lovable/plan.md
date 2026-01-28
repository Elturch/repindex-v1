
# ✅ PLAN ACTUALIZADO - Agente Rix con Regresión Always-On

## Cambios del 28 ene 2026

### 1. Regresión SIEMPRE ACTIVA (no solo por keywords)
- **Antes**: La regresión solo se llamaba cuando la pregunta contenía keywords como "regresión", "correlación", "predictor"
- **Ahora**: La regresión se carga SIEMPRE para niveles `complete` y `exhaustive` (se omite en `quick` para velocidad)
- **Beneficio**: El agente siempre tiene contexto de tendencias, correlaciones precio-métricas, lo que enriquece TODAS las respuestas

### 2. Timeout de Regresión
- Añadido timeout de 15 segundos para no ralentizar demasiado las respuestas
- Si falla, continúa sin datos de regresión

### 3. SSE Streaming
- El streaming SSE ya estaba implementado correctamente en el backend
- El frontend detecta Content-Type y maneja tanto SSE como JSON
- Si el streaming falla, hay fallback automático a Gemini

---

## Implementación Anterior (Regresión Real)

### Edge Function: `rix-regression-analysis`
- Calcula correlación de Pearson real entre métricas RIX (semana t) y variación de precio (semana t+1)
- Usa paginación para acceder a TODOS los datos (~8,000 registros)
- Devuelve correlación por métrica con p-value, significancia y R²

### Resultados del Análisis REAL
- **~8,000 registros** analizados
- **133 empresas** con precios
- **21+ semanas** de datos
- **Hallazgo**: Las métricas RIX miden **percepción algorítmica**, NO predicen precio bursátil directamente
- El valor está en la detección de narrativas y señales reputacionales

---

## Arquitectura Técnica

### Backend (chat-intelligence)
- SSE streaming real con fallback OpenAI → Gemini
- Paginación inteligente según depthLevel (2,000 → 10,000 registros)
- Contexto de regresión siempre disponible

### Frontend (ChatContext)
- Detección de Content-Type (JSON vs SSE)
- Acumulación de chunks en tiempo real
- Metadata de metodología para footer de validación

