
# Plan: Corrección de Gráficos que No se Muestran en Chat

## Diagnóstico Final

### Evidencia Recopilada

1. **Backend funciona correctamente**:
   - Logs del edge function muestran: `Built sector comparison chart for Automoción vs Banca y Servicios Financieros vs Energía y Gas: yes`
   - `chartData generated: comparison`

2. **Network requests confirman envío**:
   ```json
   {"type":"start","metadata":{...,"chartData":{"type":"comparison","data":[{"name":"Energía y Gas","score":62.8},{"name":"Banca y Servici...","score":61.4},{"name":"Automoción","score":58.8}],"title":"📊 Automoción vs Banca y Servicios Financieros vs Energía y Gas","subtitle":"RIX promedio - Semana del 2026-01-25"}}}
   ```

3. **Frontend NO procesa el evento `start`**:
   - El log `[ChatContext] Received start event with chartData:` NO aparece en console
   - Los gráficos NO aparecen en la UI

### Bug Identificado

El problema está en cómo el browser procesa el SSE stream. Cuando el primer chunk llega, puede contener el evento `start` pero el buffer split puede no procesarlo correctamente en todos los casos debido al timing del `ReadableStream`.

Sin embargo, revisando más cuidadosamente el código, identifico que **hay un problema adicional**: el código actual asume que `startMetadata` estará disponible cuando se ejecute `setMessages` al final, pero la variable `startMetadata` se declara con `let` dentro del scope del `while(true)` loop y el closure puede no capturar correctamente su valor actualizado.

### Problema Real: Scope y Timing

En líneas 566-567:
```typescript
let finalMetadata: any = null;
let startMetadata: any = null;
```

Y en línea 651:
```typescript
chartData: startMetadata?.chartData || finalMetadata?.chartData,
```

El código PARECE correcto, pero el evento `start` puede no estar siendo parseado correctamente porque:

1. **El evento `start` puede llegar en el mismo chunk inicial que múltiples eventos `chunk`**
2. **El parsing con `split('\n')` puede fallar si el SSE no termina exactamente en `\n\n`**

---

## Solución en 3 Partes

### Parte 1: Añadir Logging de Debugging Robusto

Necesitamos ver exactamente qué está pasando. Añadir logs antes y después del parsing.

**Archivo:** `src/contexts/ChatContext.tsx`

```typescript
// Dentro del for loop (líneas 579-616)
for (const line of lines) {
  // Skip empty lines and keep-alive comments
  if (!line.trim() || line.startsWith(':')) continue;
  
  if (line.startsWith('data: ')) {
    const data = line.slice(6).trim();
    if (data === '[DONE]') continue;

    console.log('[ChatContext SSE] Raw data line:', data.substring(0, 100) + '...');

    try {
      const parsed = JSON.parse(data);
      console.log('[ChatContext SSE] Parsed event type:', parsed.type);
      
      if (parsed.type === 'start') {
        startMetadata = parsed.metadata || {};
        console.log('[ChatContext SSE] START event received, chartData present:', !!startMetadata.chartData);
        if (startMetadata.chartData) {
          console.log('[ChatContext SSE] chartData type:', startMetadata.chartData.type);
          console.log('[ChatContext SSE] chartData data length:', startMetadata.chartData.data?.length);
        }
      } else if (parsed.type === 'chunk' && parsed.text) {
        // ... existing chunk handling
      } else if (parsed.type === 'done') {
        console.log('[ChatContext SSE] DONE event received');
        // ... existing done handling
      }
    } catch (parseError) {
      console.error('[ChatContext SSE] Parse error:', parseError, 'for data:', data.substring(0, 200));
    }
  }
}
```

### Parte 2: Añadir Log en setMessages Final

Para confirmar que `startMetadata` tiene valor cuando se asigna:

**Archivo:** `src/contexts/ChatContext.tsx` (línea 633)

```typescript
// Mark streaming as complete and add final metadata including methodology
console.log('[ChatContext SSE] Final metadata assignment:');
console.log('  - startMetadata:', !!startMetadata, startMetadata?.chartData ? 'HAS chartData' : 'NO chartData');
console.log('  - finalMetadata:', !!finalMetadata);

setMessages(prev => {
  // ...existing code
});
```

### Parte 3: Verificar que InlineChartRenderer recibe datos

**Archivo:** `src/components/chat/ChatMessages.tsx` (línea 233)

```typescript
{/* Inline Chart - shown before text content when not streaming */}
{(() => {
  console.log('[ChatMessages] Checking chartData for message:', idx, {
    hasMetadata: !!message.metadata,
    hasChartData: !!message.metadata?.chartData,
    isStreaming: message.isStreaming,
    chartType: message.metadata?.chartData?.type,
    chartDataLength: message.metadata?.chartData?.data?.length
  });
  return message.metadata?.chartData && !message.isStreaming ? (
    <InlineChartRenderer 
      chartData={message.metadata.chartData} 
      compact={compact} 
    />
  ) : null;
})()}
```

---

## Cambios en Archivos

| Archivo | Cambio | Propósito |
|---------|--------|-----------|
| `src/contexts/ChatContext.tsx` | Añadir logs de debugging en SSE parsing | Identificar exactamente dónde falla |
| `src/contexts/ChatContext.tsx` | Log antes de setMessages final | Confirmar estado de startMetadata |
| `src/components/chat/ChatMessages.tsx` | Log en renderizado de chart | Confirmar que chartData llega al componente |

---

## Alternativa: Si el problema es el buffer SSE

Si los logs revelan que el evento `start` nunca se parsea, el problema podría ser que el primer chunk del ReadableStream contiene el evento `start` pero sin el newline final que el split necesita.

**Solución adicional** en el parsing:

```typescript
// Antes de procesar líneas, asegurar que procesamos también el buffer restante
buffer += decoder.decode(value, { stream: true });

// Procesar líneas completas (terminan en \n)
const lines = buffer.split('\n');

// Procesar todas las líneas excepto la última (que puede estar incompleta)
for (let i = 0; i < lines.length - 1; i++) {
  const line = lines[i];
  // ... process line
}

// Mantener solo la última línea en buffer (puede estar incompleta)
buffer = lines[lines.length - 1] || '';
```

---

## Estimación

- **Complejidad**: Baja (solo logging y posible fix de parsing)
- **Riesgo**: Muy bajo (cambios de debugging no afectan funcionalidad)
- **Tiempo**: ~30 minutos

## Siguiente Paso

Una vez implementados los logs, necesitamos que el usuario ejecute otra consulta y nos comparta los console logs para identificar exactamente en qué punto falla la captura de `chartData`.
