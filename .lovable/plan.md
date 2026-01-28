

## Plan: Agente Vigilante de Calidad de Datos RIX

### Diagnóstico Confirmado

He verificado los datos reales del barrido del domingo 25 de enero (semana `2026-01-18`):

| Métrica | Valor | Problema |
|---------|-------|----------|
| Total empresas | 156 | OK |
| Empresas con 6/6 modelos | **102** | SOLO 65% de cobertura completa |
| Empresas con 1-5 modelos | **53** | 34% cobertura parcial |
| Empresas con 0 scores | **1** | ART completamente fallida |

**Desglose por modelo:**
| Modelo | Con Score | Sin Datos | Tasa Éxito |
|--------|-----------|-----------|------------|
| Perplexity | 151 | 5 | 97% |
| Qwen | 150 | 6 | 96% |
| Deepseek | 148 | 8 | 95% |
| Gemini | 148 | 8 | 95% |
| ChatGPT | 147 | 2+7 | 94% |
| **Grok** | **120** | **36** | **77%** |

**Problema crítico:** Grok falla silenciosamente (sin registrar errores) en ~23% de los casos, probablemente por error HTTP 422 con el formato de `tools` en el endpoint `/v1/responses`.

---

### Objetivo del Agente Vigilante

Crear un sistema automatizado que:
1. **Detecte** datos incompletos o de baja calidad después de cada barrido
2. **Diagnostique** qué modelos fallaron y por qué
3. **Repare** automáticamente relanzando búsquedas para los modelos fallidos
4. **Reporte** métricas precisas para visibilidad del admin

---

### Arquitectura Propuesta

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       AGENTE VIGILANTE DE CALIDAD                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐           │
│  │  1. DETECTAR  │───▶│ 2. DIAGNOSTICAR│───▶│  3. REPARAR   │           │
│  │   (Análisis)  │    │   (Clasificar) │    │  (Re-lanzar)  │           │
│  └───────────────┘    └───────────────┘    └───────────────┘           │
│         │                    │                    │                     │
│         ▼                    ▼                    ▼                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    data_quality_reports (nueva tabla)           │   │
│  │  - sweep_id, ticker, model, status, error_type, retry_count     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  TRIGGERS:                                                              │
│  - CRON: Lunes 08:00 CET (después del barrido del domingo)              │
│  - CRON: Martes 08:00 CET (segunda pasada de reparación)                │
│  - Manual: Botón en /admin                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Cambios Propuestos

#### 1. Nueva Edge Function: `rix-quality-watchdog`

**Archivo:** `supabase/functions/rix-quality-watchdog/index.ts`

Esta función será el "agente vigilante" que:

**Modo `analyze`:**
- Consulta `rix_runs_v2` para la semana más reciente
- Agrupa por empresa y modelo
- Identifica registros con `20_res_gpt_bruto IS NULL` (sin datos de búsqueda)
- Clasifica el tipo de fallo:
  - `no_response`: API no devolvió contenido
  - `timeout`: El request expiró
  - `rate_limit`: Límite de API alcanzado
  - `payload_error`: Error de formato (ej: Grok 422)
  - `api_key_issue`: Problema de autenticación
- Inserta resumen en nueva tabla `data_quality_reports`

**Modo `repair`:**
- Obtiene empresas con modelos incompletos
- Para cada empresa-modelo faltante:
  - Llama a `rix-search-v2` con parámetro `single_model` (nuevo)
  - Solo relanza el modelo que falló, no los 6
- Actualiza el registro en `rix_runs_v2` con los nuevos datos
- Máximo 10 reparaciones por invocación (para evitar timeouts)

**Modo `report`:**
- Devuelve estadísticas consolidadas para el panel admin

#### 2. Modificar `rix-search-v2` para soportar reparaciones individuales

**Archivo:** `supabase/functions/rix-search-v2/index.ts`

Añadir modo `single_model`:
- Parámetro: `{ ticker, issuer_name, single_model: 'Grok' }`
- En lugar de ejecutar los 6 modelos, solo ejecuta el modelo especificado
- Actualiza solo esa columna en el registro existente (no crea duplicado)

#### 3. Nueva tabla para seguimiento de calidad

**SQL Migration:**
```sql
CREATE TABLE data_quality_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sweep_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  ticker TEXT NOT NULL,
  model_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'missing', -- missing, repaired, failed_repair
  error_type TEXT, -- no_response, timeout, rate_limit, payload_error, api_key
  original_error TEXT,
  repair_attempts INTEGER DEFAULT 0,
  repaired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(sweep_id, ticker, model_name)
);

CREATE INDEX idx_dqr_sweep ON data_quality_reports(sweep_id);
CREATE INDEX idx_dqr_status ON data_quality_reports(status);
```

#### 4. CRON Jobs para ejecución automática

**Programar vía `pg_cron`:**
- **Lunes 08:00 CET:** `rix-quality-watchdog?action=analyze` - Detecta problemas
- **Lunes 09:00 CET:** `rix-quality-watchdog?action=repair` - Primera reparación
- **Martes 08:00 CET:** `rix-quality-watchdog?action=repair` - Segunda pasada

#### 5. Panel de Calidad en /admin

**Archivo:** `src/components/admin/SweepMonitorPanel.tsx`

Añadir nueva sección "Calidad de Datos" con:

**Métricas corregidas:**
- Total empresas en sweep
- Empresas con 6/6 modelos completos (100% coverage)
- Empresas con cobertura parcial (desglose)
- Empresas sin datos

**Tabla de diagnóstico:**
| Modelo | OK | Fallidos | Reparados | Pendientes | Tasa Éxito |
|--------|-----|----------|-----------|------------|------------|
| Perplexity | 151 | 5 | 4 | 1 | 99% |
| Grok | 120 | 36 | 28 | 8 | 95% |

**Botones de acción:**
- "Analizar Calidad" → Ejecuta `analyze`
- "Reparar Fallidos" → Ejecuta `repair`
- "Ver Detalles" → Modal con lista de empresas afectadas

#### 6. Corregir incoherencias del panel actual

**Problema 1:** El panel muestra la semana `2026-01-19` cuando debería mostrar `2026-01-18`
- **Solución:** Ordenar por número de registros, no solo por fecha más reciente

**Problema 2:** "Completados" usa formula incorrecta
- **Solución:** Ya corregido con `uniqueCompaniesComplete`, pero verificar que consulta la semana correcta

**Problema 3:** No distingue entre "sin datos" y "analizable"
- **Solución:** Ya implementado, pero asegurar visibilidad clara

---

### Archivos a crear/modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `supabase/functions/rix-quality-watchdog/index.ts` | **CREAR** | Agente vigilante principal |
| `supabase/functions/rix-search-v2/index.ts` | MODIFICAR | Añadir modo `single_model` para reparaciones |
| `supabase/config.toml` | MODIFICAR | Añadir config de nueva función |
| SQL Migration | CREAR | Tabla `data_quality_reports` |
| `src/components/admin/SweepMonitorPanel.tsx` | MODIFICAR | Panel de calidad + corrección de métricas |

---

### Flujo de Reparación Automática

```text
DOMINGO 03:00-23:00 CET
│
├─ rix-batch-orchestrator ejecuta barrido de 174 empresas
│  └─ rix-search-v2 ejecuta 6 modelos por empresa
│
LUNES 08:00 CET
│
├─ rix-quality-watchdog (analyze)
│  ├─ Detecta: 54 empresas con cobertura < 100%
│  ├─ Clasifica: 36 fallos Grok, 8 Deepseek, 8 Gemini, etc.
│  └─ Inserta en data_quality_reports
│
LUNES 09:00 CET
│
├─ rix-quality-watchdog (repair)
│  ├─ Obtiene 10 empresas prioritarias (menos modelos OK)
│  ├─ Relanza SOLO modelos fallidos (no los 6)
│  └─ Actualiza registros en rix_runs_v2
│
MARTES 08:00 CET
│
├─ rix-quality-watchdog (repair) - Segunda pasada
│  ├─ Procesa siguientes 10-20 empresas
│  └─ Marca como "failed_repair" si 3+ intentos fallidos
│
RESULTADO: Cobertura 95%+ antes del viernes (generación de noticias)
```

---

### Priorización de Reparaciones

El agente priorizará empresas y modelos así:

1. **Prioridad CRÍTICA:** Empresas con 0-2 modelos OK (completamente incompletas)
2. **Prioridad ALTA:** Empresas con 3-4 modelos OK (análisis parcial posible)
3. **Prioridad MEDIA:** Empresas con 5 modelos OK (solo falta 1)

Dentro de cada prioridad, ordenar por:
- Empresas IBEX 35 primero
- Luego por `retry_count` ascendente (evitar bucles en problemáticas)

---

### Validación del Éxito

Después de implementar, estas métricas deben mejorar:

| Métrica | Antes | Objetivo |
|---------|-------|----------|
| Empresas 6/6 modelos | 65% (102/156) | >95% (148+/156) |
| Modelos Grok OK | 77% (120/156) | >95% (148+/156) |
| Fallos silenciosos | Muchos | 0 (todos registrados) |
| Tiempo hasta cobertura completa | N/A | <48h post-barrido |

---

### Consideración Técnica: Por qué falla Grok

El endpoint `/v1/responses` de xAI con `tools: [{type: 'web_search_preview'}]` devuelve **HTTP 422** en algunos casos. El código actual no captura correctamente este error.

**Solución en reparación:** 
- Añadir retry con backoff exponencial específico para Grok
- Si falla 3 veces, marcar como `failed_repair` y usar solo 5 modelos para esa empresa
- Registrar el error exacto para diagnóstico

