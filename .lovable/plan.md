

# Plan: Dashboard de Barrido con Datos Reales y Claros

## Estado Actual del Sistema (Datos Reales)

| Métrica | Valor Real |
|---------|------------|
| Total empresas | 165 |
| Empresas fallidas | 6 (HTTP 504) |
| Procesos activos | 0 |
| Triggers pendientes | 0 |

### Por Modelo IA:
| Modelo | Completados | Pendientes | % |
|--------|-------------|------------|---|
| Perplexity | 159 | 6 | **96%** |
| Deepseek | 151 | 14 | 92% |
| Gemini | 152 | 13 | 92% |
| Qwen | 148 | 17 | 90% |
| ChatGPT | 145 | 20 | 88% |
| Grok | 111 | 54 | **67%** ← Problema |

### Empresas Fallidas (Errores Reales):
- DOM, ROVI, AMS, MAP, LOG, IZE → HTTP 504 timeout

---

## Nuevo Diseño del Dashboard

### Sección 1: Estado del Sistema
```text
┌─────────────────────────────────────────────────────────┐
│ 🔴 Sin procesos activos         [Lanzar Barrido] [↻]   │
│    Último barrido: 2025-W05 • hace 8 horas              │
└─────────────────────────────────────────────────────────┘
```

### Sección 2: Progreso por Modelo IA (Lo que pides)
```text
┌─────────────────────────────────────────────────────────┐
│ PROGRESO POR MODELO                                      │
├─────────────────────────────────────────────────────────┤
│ Perplexity   ████████████████████░  159/165  96%        │
│ Deepseek     █████████████████░░░░  151/165  92%        │
│ Gemini       █████████████████░░░░  152/165  92%        │
│ Qwen         ████████████████░░░░░  148/165  90%        │
│ ChatGPT      ███████████████░░░░░░  145/165  88%        │
│ Grok         ██████████░░░░░░░░░░░  111/165  67% ⚠     │
└─────────────────────────────────────────────────────────┘
```

### Sección 3: Errores (Los 6 Reales)
```text
┌─────────────────────────────────────────────────────────┐
│ ⚠ 6 EMPRESAS FALLIDAS                    [Reintentar]  │
├─────────────────────────────────────────────────────────┤
│ DOM   HTTP 504  hace 7h                                 │
│ ROVI  HTTP 504  hace 7h                                 │
│ AMS   HTTP 504  hace 8h                                 │
│ MAP   HTTP 504  hace 8h                                 │
│ LOG   HTTP 504  hace 8h                                 │
│ IZE   HTTP 504  hace 9h                                 │
└─────────────────────────────────────────────────────────┘
```

---

## Cambios Técnicos

### 1. Hook `useUnifiedSweepMetrics.ts`
Añadir query para obtener empresas fallidas con detalle:

```typescript
// Añadir a las queries paralelas:
supabase
  .from('sweep_progress')
  .select('ticker, status, error_message, updated_at')
  .eq('sweep_id', sweepId)
  .eq('status', 'failed'),
```

Exponer en el return:
```typescript
failedCompanies: {
  ticker: string;
  error: string;
  updatedAt: Date;
}[];
```

### 2. Componente `SweepHealthDashboard.tsx`
Reescribir completamente con 3 secciones claras:

**Sección 1: Estado del Sistema**
- Indicador visual: 🟢 Activo / 🔴 Inactivo
- Si hay procesos: mostrar cuántos y cuáles
- Botones: Lanzar/Forzar + Refresh

**Sección 2: Tabla de Modelos IA**
- Una fila por modelo con:
  - Nombre del modelo
  - Barra de progreso visual
  - Números: completados/total
  - Porcentaje
  - Icono warning si < 80%

**Sección 3: Panel de Errores**
- Solo si hay errores
- Lista de empresas fallidas con:
  - Ticker
  - Tipo de error
  - Tiempo desde el fallo
- Botón "Reintentar Fallidas"

---

## Código Específico

### Nueva estructura del dashboard:

```tsx
export function SweepHealthDashboard() {
  // ... hooks existentes ...

  return (
    <div className="space-y-4 mb-6">
      {/* SECCIÓN 1: Estado del Sistema */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Indicador de estado */}
              <div className={cn(
                "w-3 h-3 rounded-full",
                metrics.searchProcessing > 0 ? "bg-green-500 animate-pulse" : "bg-gray-400"
              )} />
              <div>
                <span className="font-medium">
                  {metrics.searchProcessing > 0 
                    ? `${metrics.searchProcessing} procesos activos`
                    : "Sin procesos activos"}
                </span>
                <div className="text-sm text-muted-foreground">
                  Barrido {metrics.sweepId}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleForce} disabled={forcing}>
                {forcing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                <span className="ml-1">Forzar</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN 2: Progreso por Modelo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Progreso por Modelo IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {metrics.byModel.map(model => (
            <div key={model.model} className="flex items-center gap-4">
              <span className="w-24 text-sm font-medium">{model.model}</span>
              <div className="flex-1">
                <Progress value={model.percentage} className="h-2" />
              </div>
              <span className="w-20 text-sm text-right">
                {model.withScore}/{model.total}
              </span>
              <span className={cn(
                "w-12 text-sm font-medium text-right",
                model.percentage < 80 ? "text-red-500" : 
                model.percentage < 95 ? "text-amber-500" : "text-green-500"
              )}>
                {model.percentage}%
              </span>
              {model.percentage < 80 && <AlertTriangle className="h-4 w-4 text-red-500" />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* SECCIÓN 3: Errores (solo si hay) */}
      {metrics.companiesFailed > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-red-700 flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                {metrics.companiesFailed} Empresas Fallidas
              </CardTitle>
              <Button size="sm" variant="destructive" onClick={handleRetryFailed}>
                Reintentar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {metrics.failedCompanies?.map(f => (
                <div key={f.ticker} className="flex items-center gap-2 text-red-700">
                  <span className="font-mono">{f.ticker}</span>
                  <span className="text-xs text-red-500">{f.error}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/hooks/useUnifiedSweepMetrics.ts` | Añadir query de empresas fallidas con detalle |
| `src/components/admin/SweepHealthDashboard.tsx` | Reescribir con 3 secciones claras |

## Resultado Esperado

1. **Estado del sistema**: Indicador claro de si hay procesos activos o no
2. **Progreso por IA**: Tabla con 6 filas, una por modelo, con barra + números + porcentaje
3. **Errores reales**: Las 6 empresas que realmente fallaron con HTTP 504, con opción de reintentar

Los datos coincidirán con la realidad porque vienen directamente de:
- `rix_runs_v2` para el progreso por modelo
- `sweep_progress` con `status='failed'` para los errores

