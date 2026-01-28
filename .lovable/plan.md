

## Plan: Indicador de Estado de Análisis V2 para Panel de Admin

### Contexto del Problema

El panel "Barrido RIX" actualmente muestra el progreso de **búsquedas** (tabla `sweep_progress`), que aparece como 100% completado (174/174 empresas). Sin embargo, hay un segundo paso crítico: el **análisis** de cada respuesta de búsqueda que genera los scores RIX.

**Datos actuales invisibles:**
| Modelo | Total | Con Score | Pendientes Análisis |
|--------|-------|-----------|---------------------|
| Grok | 18 | 0 | **18 (100%)** |
| ChatGPT | 18 | 14 | 4 |
| Perplexity | 18 | 12 | 6 |
| Gemini | 18 | 14 | 4 |
| Qwen | 18 | 17 | 1 |
| Deepseek | 18 | 17 | 1 |

Esto explica por qué Grok y otros modelos aparecen incompletos en los boletines.

---

### Solución Propuesta

Agregar un nuevo panel "Estado de Análisis V2" dentro de `SweepMonitorPanel.tsx` que muestre:

1. **Resumen general**: Total de registros pendientes de análisis vs completados
2. **Desglose por modelo**: 6 modelos con barras de progreso individuales
3. **Botón de reparación**: Lanzar `reprocess_pending` directamente desde el panel

---

### Cambios Técnicos

#### 1. Nuevo Estado y Tipo de Datos

```typescript
interface AnalysisStatus {
  totalRecords: number;
  withScore: number;
  pendingAnalysis: number;
  byModel: {
    model: string;
    total: number;
    withScore: number;
    pending: number;
  }[];
  sweepWeek: string;
}
```

#### 2. Nueva Función para Consultar Estado

```typescript
const fetchAnalysisStatus = async () => {
  // Query rix_runs_v2 for the latest week
  const { data, error } = await supabase
    .from('rix_runs_v2')
    .select('02_model_name, 09_rix_score, analysis_completed_at, 06_period_from')
    .order('06_period_from', { ascending: false });
  
  // Aggregate by model and calculate pending vs completed
};
```

#### 3. Nuevo Componente Visual

Ubicación: Debajo del panel de "Progreso general" existente

```
┌─────────────────────────────────────────────────────────────┐
│ 🧪 Estado de Análisis V2                    [Actualizar] [🔧]│
├─────────────────────────────────────────────────────────────┤
│ Semana: 2026-W05 (19 ene - 25 ene)                          │
│                                                              │
│ ■■■■■■■■■■░░ 873/1,044 (83.6%) análisis completos           │
│                                                              │
│ Por Modelo:                                                  │
│ ChatGPT     ■■■■■■■■░░ 161/174 (92.5%)                      │
│ Deepseek    ■■■■■■■■■░ 165/174 (94.8%)                      │
│ Gemini      ■■■■■■■■░░ 162/174 (93.1%)                      │
│ Grok        ■■■■■■░░░░ 120/174 (68.9%)  ⚠️ 54 pendientes    │
│ Perplexity  ■■■■■■■■░░ 163/174 (93.6%)                      │
│ Qwen        ■■■■■■■■■░ 167/174 (95.9%)                      │
│                                                              │
│ [Completar Análisis Pendientes] [Ver Detalle por Empresa]   │
└─────────────────────────────────────────────────────────────┘
```

#### 4. Botón de Reparación

```typescript
const handleRepairAnalysis = async () => {
  await supabase.functions.invoke('rix-analyze-v2', {
    body: { action: 'reprocess_pending', batch_size: 5 }
  });
};
```

---

### Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/admin/SweepMonitorPanel.tsx` | Agregar sección de análisis V2 con estado, visual y botones |

---

### Beneficios

1. **Visibilidad completa**: Ver el estado real de análisis, no solo búsquedas
2. **Identificación de problemas**: Detectar qué modelos tienen más fallos (Grok)
3. **Acción directa**: Lanzar reparaciones sin necesidad de comandos manuales
4. **Monitoreo en tiempo real**: Actualización durante procesos de reparación

