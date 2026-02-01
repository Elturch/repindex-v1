

# Plan: Simplificar Dashboard de Barrido

## Problema Actual

El panel tiene **9 secciones diferentes** con información duplicada y cruzada:
- Empresas completas vs registros con score → misma info, diferente granularidad
- Alertas de ghost + alertas de pendientes + triggers → 3 alertas separadas
- Progreso por modelo + métricas numéricas → duplicación
- Demasiados colores y estados visuales

## Diseño Simplificado

Una sola card con información clara y jerarquizada:

```text
┌────────────────────────────────────────────────────────────────┐
│  [●] Barrido 2025-W05                            87% ████████░ │
│      174 empresas • 152 completas • 22 pendientes              │
├────────────────────────────────────────────────────────────────┤
│  GPT 95%  │  Gemini 92%  │  Grok 88%  │  ... (solo si < 100%)  │
├────────────────────────────────────────────────────────────────┤
│  [Forzar] [Refresh]                    Actualizado: hace 2 min │
└────────────────────────────────────────────────────────────────┘

Si hay problemas (ghost, triggers, errores):
┌─ ⚠ 3 empresas sin datos • Pulsa Forzar para reparar ───────────┐
```

## Lo Que Se Elimina

| Elemento | Motivo |
|----------|--------|
| Grid de 5 métricas (completas, parciales, por analizar, sin datos, procesando) | Redundante con el header |
| Sección "Análisis: X/Y (Z%)" | Confuso, basta con empresas |
| Sección "Búsqueda: X/Y (Z%)" | Confuso, nivel demasiado bajo |
| Alerta amarilla de pendientes | Redundante con subtítulo |
| Nota del CRON | No aporta al usuario |
| Botón "Procesar Triggers" | Se integra en "Forzar" |
| Botón "Reset Total" | Peligroso, mover a menú oculto |

## Lo Que Se Mantiene (Simplificado)

1. **Header**: Estado + ID + porcentaje grande
2. **Subtítulo dinámico**: Una línea que dice qué falta (si algo)
3. **Barra de progreso**: Visual limpio
4. **Modelos**: Solo los que no están al 100%, en línea compacta
5. **Alertas críticas**: Solo ghost companies (se colapsan si no hay)
6. **Botones**: Solo "Forzar" + "Refresh"

## Cambios Técnicos

### Archivo: `src/components/admin/SweepHealthDashboard.tsx`

**Eliminar secciones**:
- Grid de 5 métricas (líneas 342-364)
- Sección de record-level progress (líneas 366-385)
- Alerta amarilla de pendientes (líneas 387-395)
- Nota del CRON (líneas 433-436)
- Botón "Procesar Triggers" separado (líneas 406-417)
- Botón "Reset Total" (líneas 419-432)

**Simplificar modelos**:
- Solo mostrar modelos con porcentaje < 100%
- Formato inline: "GPT 95% • Gemini 92% • Grok 88%"

**Simplificar header**:
- Una sola línea de subtítulo que resume el estado
- Mover porcentaje al lado de la barra de progreso

**Nueva estructura**:
```tsx
<Card>
  <CardHeader>
    {/* Icono estado + Título + Porcentaje */}
  </CardHeader>
  <CardContent>
    {/* Alerta ghost solo si > 0 */}
    
    {/* Barra de progreso */}
    <Progress value={mainProgress} />
    
    {/* Modelos pendientes (solo si alguno < 100%) */}
    {modelsIncomplete.length > 0 && (
      <div className="text-sm text-muted-foreground">
        {modelsIncomplete.map(m => `${m.model} ${m.percentage}%`).join(' • ')}
      </div>
    )}
    
    {/* Botones + timestamp */}
    <div className="flex justify-between items-center">
      <Button onClick={handleForce}>Forzar</Button>
      <span>Actualizado: hace X min</span>
    </div>
  </CardContent>
</Card>
```

## Resultado Visual

**Antes**: 9 secciones, ~15 colores, datos redundantes
**Después**: 4 secciones, 3 colores, información clara

El usuario ve de un vistazo:
- Estado del barrido (icono + color)
- Porcentaje total
- Qué modelos están retrasados (si alguno)
- Un botón para actuar

