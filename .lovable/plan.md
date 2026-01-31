

# Plan: Simplificar Agente Rix — Análisis Exhaustivo por Defecto + Solo Selector de Perfil

## Resumen del Cambio

El usuario quiere simplificar el flujo de configuración del Agente Rix:
1. **Eliminar selector de profundidad** → El modo `exhaustive` será siempre el predeterminado
2. **Mantener solo el selector de perfil** → Se escoge una vez al inicio de la conversación
3. **Opción de cambiar perfil al final** → Añadir `RoleEnrichmentBar` al final de cada respuesta (ya existe el componente pero no se está usando)
4. **Persistencia** → Si el usuario no cambia de perfil, continúa con el seleccionado al inicio

## Análisis del Estado Actual

| Componente | Estado Actual | Cambio Necesario |
|------------|---------------|------------------|
| `SessionConfigPanel.tsx` | Muestra selector de Profundidad + Rol | Eliminar profundidad, simplificar a solo Rol |
| `ChatContext.tsx` | `sessionDepthLevel` default = `'complete'` | Cambiar default a `'exhaustive'` |
| `ChatInput.tsx` | Espera `isSessionConfigured` con ambos | Simplificar lógica (solo rol) |
| `ChatMessages.tsx` | No muestra `RoleEnrichmentBar` | Añadir al final de cada respuesta |
| `RoleEnrichmentBar.tsx` | Existe pero no se usa | Integrarlo en las respuestas |

## Cambios Técnicos Detallados

### Cambio 1: Actualizar ChatContext — Default a Exhaustivo

**Archivo**: `src/contexts/ChatContext.tsx`
**Línea**: ~202

```typescript
// ANTES
const [sessionDepthLevel, setSessionDepthLevel] = useState<DepthLevel>('complete');

// DESPUÉS
const [sessionDepthLevel, setSessionDepthLevel] = useState<DepthLevel>('exhaustive');
```

También simplificar `configureSession` para que acepte solo `roleId` (profundidad siempre exhaustiva):

```typescript
const configureSession = useCallback(async (roleId: string) => {
  setSessionDepthLevel('exhaustive'); // Siempre exhaustivo
  setSessionRoleId(roleId);
  setIsSessionConfigured(true);
  // ... persistir en DB
}, [...]);
```

### Cambio 2: Simplificar SessionConfigPanel — Solo Selector de Perfil

**Archivo**: `src/components/chat/SessionConfigPanel.tsx`

Eliminar completamente:
- El selector de profundidad (`ToggleGroup` con quick/complete/exhaustive)
- Los estados `localDepth` y `depthSelected`
- Las validaciones de "ambos seleccionados"

Resultado: Panel compacto con solo el selector de rol profesional:

```
┌────────────────────────────────────────────────────────────┐
│ 🔴 CONFIGURA TU ANÁLISIS                                   │
│                                                            │
│ Perspectiva: [CEO] [Periodista] [Analista] [+ Más roles ▼] │
│                                                            │
│ ℹ️ Todos los análisis son exhaustivos (~2min)              │
└────────────────────────────────────────────────────────────┘
```

### Cambio 3: Actualizar ChatInput — Simplificar Validación

**Archivo**: `src/components/chat/ChatInput.tsx`
**Línea**: ~161

```typescript
// ANTES
const canSend = value.trim() && !isLoading && isSessionConfigured;

// DESPUÉS  
const canSend = value.trim() && !isLoading && isSessionConfigured;
// (sin cambios funcionales, pero el tooltip cambiará)
```

También actualizar tooltip:
```typescript
// ANTES
"Selecciona profundidad y perfil para enviar"

// DESPUÉS
"Selecciona tu perfil profesional para enviar"
```

### Cambio 4: Integrar RoleEnrichmentBar en ChatMessages

**Archivo**: `src/components/chat/ChatMessages.tsx`

Importar y usar el componente existente:

```typescript
import { RoleEnrichmentBar } from "./RoleEnrichmentBar";
import { useChatContext } from "@/contexts/ChatContext";

// Dentro del componente:
const { configureSession, sessionRoleId } = useChatContext();

// Al final de cada respuesta del asistente (después de MethodologyFooter):
{message.role === 'assistant' && !message.isStreaming && !compact && (
  <RoleEnrichmentBar
    onEnrich={(roleId) => configureSession(roleId)}
    disabled={isLoading}
    languageCode={languageCode}
  />
)}
```

Esto permite al usuario cambiar de perfil para las siguientes preguntas directamente desde cualquier respuesta.

### Cambio 5: Actualizar Traducciones

**Archivo**: `src/lib/chatTranslations.ts`

Actualizar textos en español e inglés:

```typescript
// es:
configureAnalysis: 'Configura tu análisis',
selectConfigBeforeSending: 'Selecciona tu perfil profesional',
// Nueva clave:
allAnalysisExhaustive: 'Todos los análisis son exhaustivos (~2min)',
changeProfile: 'Cambiar perspectiva',

// en:
configureAnalysis: 'Configure your analysis',
selectConfigBeforeSending: 'Select your professional profile',
allAnalysisExhaustive: 'All analyses are exhaustive (~2min)',
changeProfile: 'Change perspective',
```

### Cambio 6: Adaptar Vista Colapsada del Panel

El panel colapsado (después de configurar) mostrará solo el perfil:

```
┌────────────────────────────────────────────────────────────┐
│ 📚 Exhaustivo • 👨‍💼 CEO                    [Cambiar]       │
└────────────────────────────────────────────────────────────┘
```

En lugar de:
```
│ ⚡ Rápido • 👤 General                     [Cambiar]       │
```

## Archivos a Modificar

| Archivo | Cambio | Líneas Aprox. |
|---------|--------|---------------|
| `src/contexts/ChatContext.tsx` | Default a `exhaustive`, simplificar `configureSession` | 202, 274-295 |
| `src/components/chat/SessionConfigPanel.tsx` | Eliminar selector profundidad, solo rol | Refactorización completa |
| `src/components/chat/ChatInput.tsx` | Actualizar tooltip | 293-295 |
| `src/components/chat/ChatMessages.tsx` | Añadir `RoleEnrichmentBar` al final de respuestas | ~276-294 |
| `src/lib/chatTranslations.ts` | Nuevas claves y textos actualizados | ~109-112, 200-212 |

## Flujo de Usuario Resultante

```
text
┌─────────────────────────────────────────────────────────────────────┐
│  INICIO DE CONVERSACIÓN                                              │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Selecciona tu perspectiva profesional:                        │  │
│  │ [CEO] [Periodista] [Analista] [Inversor] [DirCom] [+Más]     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Pregunta: "¿Cómo está la reputación de Iberdrola?"                 │
│  [▶ Enviar]                                                         │
├─────────────────────────────────────────────────────────────────────┤
│  RESPUESTA (análisis exhaustivo automático)                         │
│                                                                      │
│  📊 [Informe extenso de 2500+ palabras...]                          │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│  🎭 Generar informe ejecutivo completo                              │
│  Pulsa un rol para recibir un informe expandido:                    │
│  [CEO] [Periodista] [Analista] [+ Más roles]                        │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  💬 Siguiente pregunta:                                              │
│  [_______________________________________________] [Enviar]          │
│                                                                      │
│  📚 Exhaustivo • 👨‍💼 CEO                        [Cambiar]            │
└─────────────────────────────────────────────────────────────────────┘
```

## Consideraciones de Compatibilidad

1. **Base de datos**: El campo `session_depth_level` seguirá guardándose como `'exhaustive'` para mantener la trazabilidad
2. **Conversaciones existentes**: Cargarán su configuración guardada, pero nuevas conversaciones usarán exhaustivo
3. **API Cost**: El modo exhaustivo consume más tokens (~5 min, más tokens de respuesta), esto ya está aceptado por el usuario

