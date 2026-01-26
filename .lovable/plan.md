
# Plan: Corregir Botón Agente Rix en Dashboard

## Diagnóstico

El botón del FloatingChat no responde a clics en `/dashboard` debido a un **conflicto de z-index**:

| Componente | z-index | Ubicación |
|------------|---------|-----------|
| FloatingChat button | `z-50` | `src/components/chat/FloatingChat.tsx:151` |
| Dashboard Select/Popover | `z-50` | `src/pages/Dashboard.tsx:596` |
| ChatOnboardingTooltip | `z-50` | `src/components/chat/ChatOnboardingTooltip.tsx:46` |

Los portales de Radix (Select, Popover) pueden crear overlays invisibles que interceptan clics cuando tienen el mismo z-index.

## Solución

Aumentar el z-index del FloatingChat a `z-[60]` para garantizar que siempre esté por encima de otros componentes UI.

## Cambios Requeridos

### 1. FloatingChat Button Container (línea 151)

```typescript
// ANTES:
className="fixed bottom-6 right-6 z-50"

// DESPUÉS:
className="fixed bottom-6 right-6 z-[60]"
```

### 2. FloatingChat Panel Container (línea ~207)

```typescript
// ANTES:
className="fixed bottom-6 right-6 z-50 flex flex-col ..."

// DESPUÉS:
className="fixed bottom-6 right-6 z-[60] flex flex-col ..."
```

### 3. ChatOnboardingTooltip (línea 46)

```typescript
// ANTES:
className="absolute bottom-full right-0 mb-3 w-72 z-50"

// DESPUÉS:
className="absolute bottom-full right-0 mb-3 w-72 z-[60]"
```

## Archivo a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/components/chat/FloatingChat.tsx` | Líneas 151 y ~207: `z-50` → `z-[60]` |
| `src/components/chat/ChatOnboardingTooltip.tsx` | Línea 46: `z-50` → `z-[60]` |

## Resultado Esperado

- El botón Agente Rix responderá a clics en todas las páginas
- Funcionará tanto en preview como en producción
- No afectará otros componentes UI (Select, Popover seguirán funcionando normalmente)

## Tiempo Estimado

2-3 minutos para implementar.
