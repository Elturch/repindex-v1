
# Plan: Sistema de Ordenamiento por Columnas en la Vista de Lista del Dashboard

## Objetivo
Añadir flechas de ordenamiento en los encabezados de la tabla para permitir a los usuarios ordenar por cualquier métrica (RIX, NVM, DRM, SIM, RMM, CEM, GAM, DCM, CXM) de mayor a menor y viceversa.

---

## Implementación

### 1. Nuevo Estado de Ordenamiento

Añadir estado para controlar la columna activa y la dirección:

```typescript
const [sortConfig, setSortConfig] = useState<{
  key: 'rix' | 'nvm' | 'drm' | 'sim' | 'rmm' | 'cem' | 'gam' | 'dcm' | 'cxm';
  direction: 'asc' | 'desc';
}>({ key: 'rix', direction: 'desc' });
```

---

### 2. Modificar la Lógica de Ordenamiento

Actualizar el `useMemo` de `sortedRixRuns` para usar el nuevo estado:

| Antes | Después |
|-------|---------|
| Ordenar siempre por `rix_score` descendente | Ordenar por la columna seleccionada en `sortConfig.key` |
| Sin opción de invertir | Usar `sortConfig.direction` para ascendente/descendente |

La lógica será:
- Si `sortConfig.key === 'rix'`: ordenar por `displayRixScore ?? rix_score`
- Si es una métrica (nvm, drm, etc.): ordenar por `[key]_score`
- Aplicar dirección `asc` o `desc`

---

### 3. Componente de Encabezado Ordenable

Crear un componente reutilizable para los headers con flecha:

```text
┌─────────────────────────────────────┐
│  RIX ▼  │  NVM  │  DRM  │  SIM  │   │  ← Flecha visible solo en columna activa
└─────────────────────────────────────┘
```

Al hacer clic:
- Si la columna ya está activa → invertir dirección
- Si es otra columna → activarla con orden descendente (mayor primero)

Iconos a usar:
- `ArrowUp` de lucide-react para ascendente
- `ArrowDown` de lucide-react para descendente
- `ArrowUpDown` para columnas inactivas (indicador sutil de que es ordenable)

---

### 4. UI de los Headers

Modificar los `<TableHead>` de las métricas para que sean interactivos:

```tsx
<TableHead 
  className="text-center w-16 cursor-pointer hover:bg-muted/50"
  onClick={() => handleSort('nvm')}
>
  <div className="flex items-center justify-center gap-1">
    <span>NVM</span>
    {sortConfig.key === 'nvm' ? (
      sortConfig.direction === 'desc' ? 
        <ArrowDown className="h-3 w-3" /> : 
        <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowUpDown className="h-3 w-3 opacity-30" />
    )}
  </div>
</TableHead>
```

---

### 5. Función de Cambio de Ordenamiento

```typescript
const handleSort = (key: typeof sortConfig.key) => {
  setSortConfig(current => ({
    key,
    direction: current.key === key 
      ? (current.direction === 'desc' ? 'asc' : 'desc')
      : 'desc'  // Nueva columna siempre empieza por mayor
  }));
};
```

---

## Columnas Ordenables

| Columna | Key | Campo de Datos |
|---------|-----|----------------|
| RIX | `rix` | `displayRixScore ?? rix_score` |
| NVM | `nvm` | `nvm_score` |
| DRM | `drm` | `drm_score` |
| SIM | `sim` | `sim_score` |
| RMM | `rmm` | `rmm_score` |
| CEM | `cem` | `cem_score` |
| GAM | `gam` | `gam_score` |
| DCM | `dcm` | `dcm_score` |
| CXM | `cxm` | `cxm_score` |

Las columnas **Empresa**, **Modelo IA**, **Ibex Family** y **Sector** no serán ordenables (son texto/clasificaciones, no métricas numéricas).

---

## Comportamiento Visual

1. **Estado inicial**: RIX descendente (mayor arriba) - comportamiento actual preservado
2. **Columna activa**: Flecha sólida (↓ o ↑) junto al nombre
3. **Columnas inactivas**: Icono tenue de ↕ indicando que son ordenables
4. **Hover**: Fondo sutil para indicar que es clickeable
5. **Reset automático**: Al cambiar filtros de batch/sector, mantener el ordenamiento

---

## Archivo a Modificar

- `src/pages/Dashboard.tsx`
  - Añadir import de `ArrowUp`, `ArrowDown`, `ArrowUpDown` de lucide-react
  - Nuevo estado `sortConfig`
  - Nueva función `handleSort`
  - Modificar `sortedRixRuns` useMemo para usar `sortConfig`
  - Actualizar los 9 `<TableHead>` de métricas para ser interactivos

---

## Resultado Esperado

El usuario podrá:
1. Ver la tabla ordenada por RIX (mayor primero) por defecto
2. Hacer clic en cualquier columna de métrica para ordenar por ella
3. Hacer clic de nuevo en la misma columna para invertir el orden
4. Ver claramente qué columna está activa y en qué dirección

La funcionalidad es sutil, no invasiva, y no afecta al resto de la página.
