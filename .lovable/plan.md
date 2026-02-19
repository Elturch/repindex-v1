
# Mover botón "Informe" al final de la burbuja, alineado a la derecha

## Cambio único — `src/components/chat/ChatMessages.tsx`

### Qué se mueve
El bloque actual (líneas 220-231) elimina el botón de su posición `absolute top-2 right-2` y lo reubica **después del bloque Drumroll** (línea 390), como el último elemento dentro de la burbuja del asistente.

### Posición nueva
Después del cierre del bloque Drumroll (`</div>` en línea 390), antes del cierre de la burbuja (`</div>` en línea 391), se añade:

```tsx
{/* Download button — bottom-right of assistant bubbles */}
{message.role === 'assistant' && !message.isStreaming && message.metadata?.type !== 'bulletin' && (
  <div className={`${compact ? 'mt-2 pt-2' : 'mt-3 pt-3'} border-t border-border/30 flex justify-end`}>
    <Button
      variant="ghost"
      size="sm"
      onClick={() => downloadMessage(message)}
      className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground"
    >
      <Download className="h-3.5 w-3.5" />
      {!compact && <span className="text-[11px] font-medium">Descargar informe</span>}
    </Button>
  </div>
)}
```

### Por qué este diseño
- **`justify-end`**: alinea el botón a la derecha, igual que estaba antes.
- **`border-t border-border/30`**: separa visualmente el botón del resto del contenido de la burbuja, como hacía el bloque de metodología.
- **Sin `absolute`**: el botón forma parte del flujo normal del documento, no interfiere con el padding del contenido superior.
- El texto pasa de "Informe" a "Descargar informe" para ser más descriptivo y autoexplicativo para el usuario final.

### Archivos modificados
| Archivo | Cambio |
|---|---|
| `src/components/chat/ChatMessages.tsx` | Eliminar `absolute top-2 right-2` (líneas 220-231) · Añadir botón al final de la burbuja tras el Drumroll |

### Lo que NO cambia
- Lógica de descarga (`downloadMessage`) — idéntica.
- Todos los demás bloques de la burbuja (Feedback, Metodología, Rol, Drumroll).
- Modo compacto: el botón aparece sin texto, solo el icono.
