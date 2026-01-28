

## Plan: Corregir el contador de "Completados" en el panel de Barrido V2

### Diagnóstico confirmado

El contador de "Completados" muestra un número incorrecto por dos razones:

1. **Fórmula incorrecta**: Se usa `Math.floor(analysisStatus.withScore / 6)` que divide el total de registros con score entre 6 modelos. Esto asume distribución perfecta, pero no refleja la realidad.

2. **Semana incorrecta**: El panel muestra la semana más reciente (`2026-01-26`) que solo tiene 18 empresas (barrido en curso), ignorando el barrido completo del domingo (`2026-01-25`) con 156 empresas.

**Datos reales del domingo 25 de enero:**
- Total empresas: 156
- Empresas con al menos 1 modelo con score: 155
- Empresas con los 6 modelos completos: 102

---

### Cambios propuestos

**Archivo:** `src/components/admin/SweepMonitorPanel.tsx`

#### 1. Modificar `fetchAnalysisStatus()` para calcular correctamente

Cambiar la lógica para:
- Agrupar por `ticker` (empresa) en lugar de solo por modelo
- Contar empresas únicas con al menos 1 score
- Contar empresas únicas con los 6 modelos completos
- Añadir estas métricas al estado `analysisStatus`

```typescript
// Nuevos campos en AnalysisStatus
interface AnalysisStatus {
  // ... campos existentes
  uniqueCompaniesWithScore: number;      // Empresas con al menos 1 score
  uniqueCompaniesComplete: number;       // Empresas con 6/6 modelos
  totalUniqueCompanies: number;          // Total empresas únicas
}
```

#### 2. Actualizar la consulta SQL

En lugar de la consulta actual, obtener los datos agrupados por ticker:

```typescript
// Calcular empresas completadas correctamente
const tickerMap = new Map<string, { modelsWithScore: number; totalModels: number }>();

weekRecords.forEach(record => {
  const ticker = record['05_ticker'];
  const current = tickerMap.get(ticker) || { modelsWithScore: 0, totalModels: 0 };
  current.totalModels++;
  if (record['09_rix_score'] !== null) {
    current.modelsWithScore++;
  }
  tickerMap.set(ticker, current);
});

const uniqueCompaniesWithScore = [...tickerMap.values()].filter(c => c.modelsWithScore > 0).length;
const uniqueCompaniesComplete = [...tickerMap.values()].filter(c => c.modelsWithScore === 6).length;
const totalUniqueCompanies = tickerMap.size;
```

#### 3. Actualizar la UI del contador

Cambiar línea 1154 de:
```tsx
{analysisStatus ? Math.floor(analysisStatus.withScore / 6) : 0}
```

A:
```tsx
{analysisStatus?.uniqueCompaniesComplete || 0}
```

Y añadir indicador visual del porcentaje:
```tsx
<div className="text-2xl font-bold text-good">
  {analysisStatus?.uniqueCompaniesComplete || 0}
</div>
<div className="text-xs text-muted-foreground">
  Completados (6/6 modelos)
</div>
<div className="text-[10px] text-muted-foreground/70">
  de {analysisStatus?.totalUniqueCompanies || 0} empresas
</div>
```

---

### Consideración adicional: Qué semana mostrar

Actualmente el panel usa `06_period_from` ordenado descendente y toma el primero. Si el barrido nuevo apenas empezó, mostrará datos incompletos.

Propuesta: Añadir un selector de semana o mostrar siempre el **último barrido con >50% completado**.

---

### Archivos a modificar

- `src/components/admin/SweepMonitorPanel.tsx`
  - Actualizar interfaz `AnalysisStatus` con nuevos campos
  - Modificar `fetchAnalysisStatus()` para calcular métricas por empresa
  - Actualizar UI para mostrar el contador correcto

---

### Validación

Después de implementar, el panel debería mostrar:
- **Completados**: 102 (empresas con 6/6 modelos del domingo)
- **Con score parcial**: 53 (empresas con 1-5 modelos)
- **Sin score**: 1 (empresas sin ningún score aún)

