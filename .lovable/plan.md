
# Plan: Clarificar el Tratamiento de CXM para Empresas No Cotizadas

## Objetivo

Añadir información clara en la página de Metodología que explique que **CXM (Corporate Execution Metric) no aplica a empresas no cotizadas** y que el RIX se calcula redistribuyendo su peso (10%) al resto de métricas. Esto evitará que los usuarios interpreten un CXM = 0 como una puntuación negativa.

## Diagnóstico Actual

| Elemento | Estado Actual |
|----------|---------------|
| Glosario canónico (`rixMetricsGlossary.ts`) | Ya menciona "Solo aplica a empresas cotizadas; si no cotiza, se redistribuyen pesos" en `technicalDescription` |
| Función `getMetricMappingTableMarkdown()` | Incluye nota pequeña: "CXM solo aplica a cotizadas" |
| Página de Metodología (`Methodology.tsx`) | No muestra esta información de forma visible |
| Cards de métricas | Muestran peso "10%" para CXM sin aclaración |

## Solución Propuesta

### Cambio 1: Añadir Callout en la Sección de Métricas

Añadir un callout informativo después de la grid de métricas que explique el tratamiento especial de CXM y CEM.

**Ubicación**: Después de la grid de métricas (línea ~365), antes del cierre de la sección.

**Contenido**:
```
Nota metodológica:
- CXM (Ejecución Corporativa) solo aplica a empresas cotizadas. Para no cotizadas, 
  su peso (10%) se redistribuye proporcionalmente entre las otras 7 métricas.
  Un valor de 0 en CXM no indica mal desempeño, sino que la métrica no es aplicable.
- CEM (Gestión de Controversias) usa puntuación inversa: 100 = sin controversias detectadas.
```

### Cambio 2: Actualizar la Descripción de CXM en la Card

Modificar la descripción ejecutiva de CXM en el glosario canónico para que incluya la aclaración de forma más visible.

**Archivo**: `src/lib/rixMetricsGlossary.ts`
**Ubicación**: Línea 152, campo `executiveDescription` de CXM

**Nueva descripción**:
```
"Mide la percepción de ejecución corporativa y su reflejo en indicadores de mercado. 
Solo aplica a empresas cotizadas; para no cotizadas, esta métrica no se evalúa y 
su peso se redistribuye al resto. Un CXM = 0 indica inaplicabilidad, no mal desempeño."
```

### Cambio 3: Añadir Badge Visual en la Card de CXM

Añadir un badge "(Solo cotizadas)" junto al peso de CXM para hacerlo visualmente evidente.

**Archivo**: `src/pages/Methodology.tsx`
**Ubicación**: Grid de métricas (líneas 342-365)

**Lógica**:
```
{metric.code === "CXM" && (
  <Badge variant="secondary" className="ml-2 text-xs">
    Solo cotizadas
  </Badge>
)}
```

## Archivos a Modificar

| Archivo | Cambio | Líneas |
|---------|--------|--------|
| `src/pages/Methodology.tsx` | Añadir callout metodológico + badge en CXM | ~365 |
| `src/lib/rixMetricsGlossary.ts` | Actualizar descripción ejecutiva de CXM | ~152 |

## Resultado Visual Esperado

Después de los cambios, la sección de métricas incluirá:

1. **En la card de CXM**: Badge visible "(Solo cotizadas)" junto al peso
2. **Callout amarillo/informativo**: Explicación clara bajo la grid con el tratamiento de CXM y CEM
3. **Descripción actualizada**: La card de CXM incluirá la aclaración de redistribución

## Impacto

| Aspecto | Antes | Después |
|---------|-------|---------|
| Claridad sobre CXM = 0 | Confuso (parece negativo) | Claro (indica inaplicabilidad) |
| Redistribución de pesos | No mencionada | Explicada visualmente |
| Consistencia con glosario | Parcial | Completa |
