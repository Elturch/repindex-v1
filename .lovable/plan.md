
# Plan: Monitorización de Tipos de Informe del Agente Rix por Usuario

## Resumen Ejecutivo

El objetivo es añadir trazabilidad completa del **tipo de informe** (Rápido, Completo, Exhaustivo) en el sistema de monitorización de costes IA para visualizar con precisión cuánto consume cada usuario según la profundidad de análisis que solicita.

---

## Diagnóstico Actual

### Estado Presente
- Los logs de `chat-intelligence` se guardan en `api_usage_logs` con tres `action_type`: `chat`, `enrich`, `bulletin`
- **NO se registra el `depth_level`** en los logs de costes (solo se guarda en `chat_intelligence_sessions`)
- El dashboard de API Costs no diferencia entre informe rápido ($0.30 aprox) vs exhaustivo ($0.90 aprox)
- Los usuarios aparecen agregados sin distinguir su patrón de uso

### Impacto del Gap
| Tipo de Informe | Tokens Input (promedio) | Tokens Output (promedio) | Coste Estimado |
|-----------------|-------------------------|--------------------------|----------------|
| Rápido (quick) | ~20,000 | ~600 | ~$0.25 |
| Completo (complete) | ~50,000 | ~2,000 | ~$0.60 |
| Exhaustivo (exhaustive) | ~80,000 | ~4,000 | ~$0.95 |

La diferencia de coste es de **~4x** entre el informe más ligero y el más pesado.

---

## Solución Propuesta

### Fase 1: Backend - Enriquecer Logs con `depth_level`

**Archivo**: `supabase/functions/chat-intelligence/index.ts`

**Cambios**:
1. Modificar las llamadas a `logApiUsage()` para incluir `depth_level` en el metadata:

```typescript
// En action_type: 'chat' (línea ~3001-3014)
await logApiUsage({
  supabaseClient,
  edgeFunction: 'chat-intelligence',
  provider: chatResult.provider,
  model: chatResult.model,
  actionType: 'chat',
  inputTokens: chatResult.inputTokens,
  outputTokens: chatResult.outputTokens,
  userId,
  sessionId,
  metadata: { 
    depth_level: depthLevel,  // NEW
    role: selectedRole?.id    // NEW (optional)
  },
});
```

2. Aplicar el mismo patrón a `enrich` y `bulletin` action types

### Fase 2: Backend API - Agregar Endpoint de Análisis por Profundidad

**Archivo**: `supabase/functions/admin-api-data/index.ts`

**Nuevo endpoint**: `GET /depth-analytics`

```typescript
// Route: GET /depth-analytics - Usage by depth level
if (req.method === 'GET' && path === '/depth-analytics') {
  const period = url.searchParams.get('period') || '30d';
  const { start, end } = getDateFilter(period);

  const usageLogs = await fetchAllUsageLogs(
    supabaseAdmin, start, end,
    'user_id, session_id, estimated_cost_usd, input_tokens, output_tokens, metadata, created_at'
  );

  // Aggregate by depth_level
  const depthMap = { quick: {...}, complete: {...}, exhaustive: {...} };
  
  // Aggregate by user + depth_level
  const userDepthMap = new Map();
  
  // Return structured analytics
  return { data: { by_depth, by_user_depth, trends } };
}
```

### Fase 3: Frontend - Panel "Agente Rix por Profundidad"

**Archivo nuevo**: `src/components/admin/ChatDepthAnalytics.tsx`

**Componentes**:

1. **Cards Resumen por Tipo**:
   - 🚀 Rápido: X llamadas, $Y coste, Z usuarios
   - ⚡ Completo: X llamadas, $Y coste, Z usuarios  
   - 🔥 Exhaustivo: X llamadas, $Y coste, Z usuarios

2. **Tabla "Consumo por Usuario"**:
   | Usuario | Email | Rápidos | Completos | Exhaustivos | Coste Total | Patrón |
   |---------|-------|---------|-----------|-------------|-------------|--------|
   | user_1 | ana@... | 12 | 8 | 2 | $15.40 | 🎯 Balanceado |
   | user_2 | carlos@... | 0 | 2 | 15 | $18.20 | 🔥 Heavy User |

3. **Badge "Patrón de Uso"**:
   - 🎯 Balanceado: Mix equitativo
   - 🚀 Eficiente: Predominan rápidos
   - 🔥 Heavy User: Predominan exhaustivos
   - 📊 Analítico: Predominan completos

4. **Gráfico de Tendencia**:
   - Líneas por `depth_level` mostrando evolución temporal
   - Permite identificar cambios de comportamiento

### Fase 4: Integración en AIModelsDashboard

**Archivo**: `src/components/admin/AIModelsDashboard.tsx`

**Cambios**:
- Añadir sección colapsable "Agente Rix - Detalle por Profundidad" dentro del proceso `chat`
- Mostrar breakdown interno: Quick vs Complete vs Exhaustive
- Indicador visual de distribución (barra de progreso tricolor)

---

## Detalles Técnicos

### Estructura del Metadata Enriquecido
```json
{
  "depth_level": "exhaustive",
  "role": "ceo",
  "company_detected": "Telefónica",
  "ticker": "TEF"
}
```

### Cálculo del Patrón de Uso
```typescript
function getUserPattern(quick: number, complete: number, exhaustive: number): string {
  const total = quick + complete + exhaustive;
  const exhaustiveRatio = exhaustive / total;
  const quickRatio = quick / total;
  
  if (exhaustiveRatio > 0.6) return '🔥 Heavy User';
  if (quickRatio > 0.6) return '🚀 Eficiente';
  if (complete > quick && complete > exhaustive) return '📊 Analítico';
  return '🎯 Balanceado';
}
```

### Retrocompatibilidad
- Los logs existentes sin `depth_level` en metadata se clasificarán como `"unknown"` o se inferirán por tokens (>70K = exhaustive, >40K = complete, else = quick)

---

## Archivos a Modificar/Crear

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `supabase/functions/chat-intelligence/index.ts` | Modificar | Añadir `depth_level` a metadata en 3 puntos |
| `supabase/functions/admin-api-data/index.ts` | Modificar | Nuevo endpoint `/depth-analytics` |
| `src/components/admin/ChatDepthAnalytics.tsx` | Crear | Panel de análisis por profundidad |
| `src/components/admin/AIModelsDashboard.tsx` | Modificar | Integrar breakdown en proceso "Agente Rix" |
| `src/components/admin/ApiCostDashboard.tsx` | Modificar | Añadir filtro por `depth_level` en tabla de usuarios |

---

## Resultado Esperado

### Vista Dashboard "Modelos IA"

```text
💬 Agente Rix                          54 calls    $32.07    2.7M tokens
   ├─ 🚀 Rápido (quick)               18 calls    $4.50     540K tokens
   ├─ ⚡ Completo (complete)           28 calls    $16.80    1.4M tokens
   └─ 🔥 Exhaustivo (exhaustive)       8 calls    $10.77    760K tokens
```

### Vista "Consumo por Usuario"

```text
Top Usuarios por Coste (Chat Intelligence)
┌─────────────────────────────────────────────────────────────────────────┐
│ Usuario           │ 🚀 Quick │ ⚡ Complete │ 🔥 Exhaustive │ Total   │ Patrón     │
├───────────────────┼──────────┼─────────────┼───────────────┼─────────┼────────────┤
│ ana@empresa.com   │ 5 ($1.25)│ 10 ($6.00)  │ 3 ($2.85)     │ $10.10  │ 📊 Analítico│
│ pedro@corp.es     │ 0        │ 2 ($1.20)   │ 8 ($7.60)     │ $8.80   │ 🔥 Heavy   │
│ maria@startup.io  │ 12($3.00)│ 4 ($2.40)   │ 0             │ $5.40   │ 🚀 Eficiente│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Orden de Implementación

1. **Edge Function chat-intelligence** - Añadir metadata (5 min)
2. **Edge Function admin-api-data** - Nuevo endpoint (15 min)
3. **ChatDepthAnalytics.tsx** - Componente nuevo (20 min)
4. **AIModelsDashboard.tsx** - Integrar breakdown (10 min)
5. **Deploy y verificación** (5 min)

Total estimado: ~55 minutos
