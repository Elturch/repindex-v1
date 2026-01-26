

# Plan: Selector Unificado de Profundidad + Rol al Inicio del Chat

## Resumen del Problema

Actualmente:
- **Profundidad** (Quick/Complete/Exhaustive): Se selecciona **antes** de enviar ✅
- **Rol profesional** (CEO, Periodista, Inversor...): Se selecciona **después** de la respuesta ❌

El usuario quiere que ambas configuraciones se elijan **antes** de enviar la pregunta, para que el sistema genere directamente la respuesta adaptada al rol elegido.

---

## Diseño de la Solución

### Nueva Experiencia de Usuario

```text
┌────────────────────────────────────────────────────────────────┐
│  📊 Configura tu análisis                                      │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  PROFUNDIDAD                              PERSPECTIVA          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐  ┌─────────────────┐  │
│  │ ⚡ Rápido │ │ 📋 Completo│ │ 📚 Exhaustivo│  │ 🎯 General  ▼  │  │
│  └──────────┘ └──────────┘ └──────────┘  └─────────────────┘  │
│                                                                │
│  📝 Seleccionado: Completo + General                           │
└────────────────────────────────────────────────────────────────┘
```

**Comportamiento:**
1. Por defecto: "Completo" + "General" (sin adaptación de rol)
2. Al hacer clic en el selector de perspectiva, se abre un dropdown con los roles
3. Al enviar, se pasa tanto `depthLevel` como `roleId` al backend
4. El backend genera la respuesta ya adaptada al rol (sin necesidad de paso post-respuesta)

---

## Cambios Técnicos Requeridos

### 1. Modificar `ChatInput.tsx`

**Añadir:**
- Estado `selectedRole` (default: `'general'`)
- Selector de rol como dropdown junto al selector de profundidad
- Pasar `roleId` en las opciones de `onSend`

**Actualizar props interface:**
```typescript
interface ChatInputProps {
  onSend: (message: string, options?: { 
    bulletinMode?: boolean; 
    depthLevel?: DepthLevel;
    roleId?: string;  // NUEVO
  }) => void;
  // ... resto igual
}
```

### 2. Modificar `ChatContext.tsx`

**En `sendMessage`:**
- Recibir `roleId` en las opciones
- Si `roleId !== 'general'`, incluir el prompt del rol en la llamada al edge function
- El edge function generará la respuesta directamente adaptada

**Nuevo flujo:**
```typescript
const sendMessage = async (question, options) => {
  const roleId = options?.roleId || 'general';
  const role = getRoleById(roleId);
  
  await supabase.functions.invoke('chat-intelligence', {
    body: {
      question,
      depthLevel: options?.depthLevel,
      // NUEVO: rol pre-seleccionado
      roleId: roleId !== 'general' ? roleId : undefined,
      roleName: role?.name,
      rolePrompt: role?.prompt,
    }
  });
};
```

### 3. Modificar Edge Function `chat-intelligence`

**En `handleStandardChat`:**
- Si viene `roleId` y `rolePrompt`, aplicar la transformación de rol directamente
- Combinar las instrucciones de profundidad con las de rol

### 4. Actualizar traducciones

**Añadir claves:**
```typescript
// Role selector
roleLabel: string;           // "Perspectiva"
roleGeneral: string;         // "General"
selectRole: string;          // "Selecciona tu perspectiva profesional"
configureAnalysis: string;   // "Configura tu análisis"
selectedConfig: string;      // "Seleccionado: {depth} + {role}"
```

### 5. Mantener `RoleEnrichmentBar` como opción secundaria

- El componente seguirá existiendo para re-adaptar respuestas ya generadas
- Pero ya no será la forma principal de seleccionar rol

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/components/chat/ChatInput.tsx` | Añadir estado y selector de rol, actualizar props |
| `src/contexts/ChatContext.tsx` | Procesar `roleId` en `sendMessage`, pasar al edge function |
| `supabase/functions/chat-intelligence/index.ts` | Aplicar rol pre-seleccionado en generación inicial |
| `src/lib/chatTranslations.ts` | Nuevas claves de traducción para selector de rol |

---

## Detalle Visual del Nuevo Selector

### Selector de Rol (Dropdown)

```text
┌─────────────────────────────┐
│ 🎯 General               ▼  │  ← Botón que abre dropdown
└─────────────────────────────┘
        ↓ (al hacer clic)
┌─────────────────────────────┐
│ 🎯 General          ← activo │
├─────────────────────────────┤
│ ★ DESTACADOS                │
├─────────────────────────────┤
│ 👔 CEO / Alta Dirección     │
│ 📰 Periodista Económico     │
│ 📊 Analista de Mercados     │
│ 💰 Inversor                 │
│ 📢 Director Comunicación    │
├─────────────────────────────┤
│ + Ver todos los roles...    │
└─────────────────────────────┘
```

### Estados visuales

- **General seleccionado**: Botón neutro (outline)
- **Rol específico seleccionado**: Botón destacado con emoji y nombre del rol
- **Indicador de configuración**: Texto pequeño debajo mostrando "Completo + CEO"

---

## Comportamiento del Backend

### Cuando `roleId = 'general'`
- Sin cambios: respuesta estándar con formato de profundidad

### Cuando `roleId = 'ceo'` (u otro rol)
- El system prompt incluirá AMBAS instrucciones:
  1. Formato de profundidad (pirámide)
  2. Adaptación de rol (perspectiva CEO)

```typescript
const systemPrompt = `
${buildDepthPrompt(depthLevel, languageName)}

═══════════════════════════════════════════════════════════════════════════════
                    PERSPECTIVA PROFESIONAL: ${roleName}
═══════════════════════════════════════════════════════════════════════════════

${rolePrompt}
`;
```

---

## Resultado Esperado

### Antes:
```text
1. Usuario escribe pregunta
2. Selecciona profundidad (Quick/Complete/Exhaustive)
3. Envía
4. Recibe respuesta genérica
5. Hace clic en "CEO" en RoleEnrichmentBar
6. Espera segunda respuesta adaptada
```

### Después:
```text
1. Usuario selecciona profundidad + rol (Complete + CEO)
2. Escribe pregunta
3. Envía
4. Recibe respuesta YA ADAPTADA al CEO directamente
```

**Beneficios:**
- Una sola llamada al API en lugar de dos
- Experiencia más clara para el usuario
- El rol se integra mejor en el análisis inicial (no es un "parche" posterior)

