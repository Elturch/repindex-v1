# Plan: Drumroll Basado en Resultados Reales - IMPLEMENTADO ✅

## Estado: COMPLETADO

La función `generateDrumrollQuestion` ahora:
1. ✅ Recibe `AnalysisInsights` estructurados en lugar de texto
2. ✅ Extrae métricas reales (RIX, NVM, DRM, etc.) de `rix_runs`
3. ✅ Calcula tendencias comparando semanas
4. ✅ Detecta divergencias entre modelos de IA
5. ✅ Propone informes específicos basados en hallazgos concretos

## Cambios Implementados

### 1. Nueva función `extractAnalysisInsights`
- Filtra datos de `rix_runs` para la empresa analizada
- Identifica las 2 métricas más débiles y las 2 más fuertes
- Calcula tendencia (up/down/stable) comparando últimas 2 semanas
- Detecta nivel de divergencia entre modelos (low/medium/high)

### 2. Prompt del Drumroll Actualizado
- Incluye datos estructurados: RIX promedio, métricas débiles/fuertes, tendencia
- Fuerza al LLM a proponer informes que referencien datos concretos
- Ejemplos específicos según el tipo de hallazgo

### 3. Integración en `handleStandardChat`
- Extrae insights ANTES de generar el drumroll
- Loguea los insights extraídos para debugging
- Solo genera drumroll si hay insights disponibles

## Resultado

```text
Usuario: "Analiza Telefónica" 
→ Análisis detecta: DRM = 45/100, tendencia -8 pts
→ Drumroll: "¿Por qué Telefónica tiene baja Evidencia Documental (DRM: 45)? Diagnóstico y plan de mejora"
```

