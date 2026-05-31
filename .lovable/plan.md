## Cambio único

**Archivo:** `supabase/functions/rix-analyze-v2/index.ts` (líneas ~546-597)

**Acción:** Quitar el `await` del bloque `fetch-momentum-tips` para que no bloquee el análisis. El campo `49_reputacion_vs_precio` queda `null` en el barrido en curso — aceptado.

### Detalle

El bloque actual (resumido):
```ts
let momentumAnalysis: string | null = null;
if (cotiza && precioCierre && precioCierre !== 'NC') {
  try {
    const momentumResponse = await fetch(`.../fetch-momentum-tips`, {...});
    if (momentumResponse.ok) {
      const momentumData = await momentumResponse.json();
      // ... construye formattedAnalysis ...
      momentumAnalysis = formattedAnalysis;
    }
  } catch (...) { ... }
}
```

Pasa a fire-and-forget:
```ts
// Fire-and-forget: no bloquear el análisis. 49_reputacion_vs_precio
// se rellenará null hoy; en W24 movemos esto a trigger post-análisis.
if (cotiza && precioCierre && precioCierre !== 'NC') {
  try {
    const p = fetch(`.../fetch-momentum-tips`, {
      method: 'POST',
      headers: {...},
      body: JSON.stringify({...}),
      signal: AbortSignal.timeout(8000),
    }).catch(() => {}); // swallow errors
    // @ts-ignore EdgeRuntime is available in Deno Deploy
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(p);
    }
  } catch { /* noop */ }
}
let momentumAnalysis: string | null = null; // siempre null en esta vía rápida
```

Resto del fichero **sin tocar**. `updateData['49_reputacion_vs_precio']` seguirá recibiendo `momentumAnalysis` (null) o el fallback de `analysis.accion_vs_reputacion` según la lógica existente.

### Validación

Tras deploy: cada `analyzeRecord` se acorta ~4-7s. Logs deben dejar de mostrar `Momentum tips received` durante el barrido. NULLs deberían caer notablemente más rápido en los próximos 30 min.

Sin migraciones. Sin cambios de UI. Sin tocar orchestrator.
