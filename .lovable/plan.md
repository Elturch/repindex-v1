

# Plan: Selección Obligatoria de Rol y Tipo de Informe

## Resumen

Hacer que el usuario **deba interactuar explícitamente** con los selectores de profundidad y rol antes de poder enviar una pregunta. Aunque los valores por defecto estén visibles, el botón de enviar estará deshabilitado hasta que el usuario confirme sus elecciones.

---

## Diseño de la Solución

### Estados de Confirmación

Se añadirán dos estados booleanos:
- `depthConfirmed`: Se pone a `true` cuando el usuario hace clic en cualquier opción de profundidad
- `roleConfirmed`: Se pone a `true` cuando el usuario interactúa con el selector de rol

### Comportamiento Visual

| Estado | Visual | Botón Enviar |
|--------|--------|--------------|
| Sin confirmar | Selectores con borde punteado/animación sutil | Deshabilitado |
| Confirmado | Selectores con estilo normal (como ahora) | Habilitado |

### Indicador Visual de "Pendiente"

Los selectores no confirmados tendrán:
- Borde punteado o animación de pulso suave
- Texto indicativo: "Selecciona tipo de informe" / "Selecciona perspectiva"
- Badge o icono de advertencia pequeño

---

## Cambios Técnicos

### Archivo: `src/components/chat/ChatInput.tsx`

**1. Añadir estados de confirmación:**
```typescript
const [depthConfirmed, setDepthConfirmed] = useState(false);
const [roleConfirmed, setRoleConfirmed] = useState(false);
```

**2. Modificar handlers de selección:**
```typescript
// Depth selector
onValueChange={(v) => {
  if (v) {
    setDepthLevel(v as DepthLevel);
    setDepthConfirmed(true);  // Confirmar al hacer clic
  }
}}

// Role selector
onValueChange={(v) => {
  setSelectedRoleId(v);
  setRoleConfirmed(true);  // Confirmar al hacer clic
}}
```

**3. Deshabilitar botón de envío si no hay confirmación:**
```typescript
<Button
  onClick={handleSend}
  disabled={!value.trim() || isLoading || !depthConfirmed || !roleConfirmed}
  // ...
>
```

**4. Añadir estilos visuales para estados pendientes:**
```typescript
// Para el contenedor de profundidad
className={cn(
  "flex-1",
  !depthConfirmed && "ring-2 ring-amber-400/50 ring-offset-1 animate-pulse"
)}

// Para el selector de rol
className={cn(
  "w-full h-auto py-2 transition-all",
  !roleConfirmed && "ring-2 ring-amber-400/50 ring-offset-1",
  // ... resto de estilos
)}
```

**5. Añadir mensaje indicativo:**
```typescript
{(!depthConfirmed || !roleConfirmed) && (
  <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 mt-2">
    <AlertCircle className="h-3.5 w-3.5" />
    <span>{tr.selectConfigBeforeSending}</span>
  </div>
)}
```

**6. Reset de confirmaciones al enviar (para próximo mensaje):**
```typescript
const handleSend = () => {
  if (value.trim() && !isLoading && depthConfirmed && roleConfirmed) {
    // ... lógica existente
    setValue("");
    setBulletinModeActive(false);
    // Reset confirmaciones para el siguiente mensaje
    setDepthConfirmed(false);
    setRoleConfirmed(false);
  }
};
```

### Archivo: `src/lib/chatTranslations.ts`

**Añadir nueva clave de traducción:**
```typescript
selectConfigBeforeSending: string;  // "Selecciona el tipo de informe y perspectiva antes de enviar"
```

---

## Resultado Visual

### Antes de confirmar:

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Configura tu análisis                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TIPO DE INFORME ← pulso suave        PERSPECTIVA ← pulso suave│
│  ┌╌╌╌╌╌╌╌╌╌╌┐ ┌╌╌╌╌╌╌╌╌╌╌┐ ┌╌╌╌╌╌╌╌╌╌╌┐  ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐   │
│  │ ⚡ Rápido │ │📋 Completo│ │📚 Exhaustivo│  │ 🎯 General  ▼  │   │
│  └╌╌╌╌╌╌╌╌╌╌┘ └╌╌╌╌╌╌╌╌╌╌┘ └╌╌╌╌╌╌╌╌╌╌┘  └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘   │
│                                                                 │
│  ⚠️ Selecciona el tipo de informe y perspectiva antes de enviar │
└─────────────────────────────────────────────────────────────────┘

[🌐][📄][🎤] [Escribe tu pregunta...                    ] [➤ gris]
                                                          ↑ deshabilitado
```

### Después de confirmar:

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Configura tu análisis                     📋 ~1min • 👔 CEO │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TIPO DE INFORME ✓                    PERSPECTIVA ✓             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐  ┌─────────────────┐   │
│  │ ⚡ Rápido │ │📋 Completo│ │📚 Exhaustivo│  │ 👔 CEO       ▼  │   │
│  └──────────┘ └──────────┘ └──────────┘  └─────────────────┘   │
│                       ↑ seleccionado        ↑ seleccionado      │
└─────────────────────────────────────────────────────────────────┘

[🌐][📄][🎤] [Analiza la reputación de Telefónica      ] [➤ azul]
                                                          ↑ habilitado
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/components/chat/ChatInput.tsx` | Estados de confirmación, validación, estilos visuales |
| `src/lib/chatTranslations.ts` | Nueva clave `selectConfigBeforeSending` |

---

## Tiempo Estimado

- Implementación: ~10 minutos
- Total: ~10 minutos

