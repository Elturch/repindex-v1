
# Plan: Persistir Perfil y Profundidad en la Sesión del Chat

## Problema Identificado

En el archivo `ChatInput.tsx`, líneas 186-188, se resetean las confirmaciones después de cada mensaje:

```javascript
// Reset confirmations for next message
setDepthConfirmed(false);
setRoleConfirmed(false);
```

Esto obliga al usuario a volver a seleccionar el perfil y la profundidad en CADA pregunta, cuando solo debería hacerse al inicio de la conversación.

---

## Solución Propuesta

### Principio
**El perfil y profundidad se configuran UNA VEZ al inicio de la sesión y se mantienen para todos los mensajes siguientes.**

### Flujo de Usuario Esperado

```text
1. Usuario abre el chat (nueva conversación)
   → Panel de configuración visible con selectores pulsando
   → Botón enviar deshabilitado
   
2. Usuario selecciona profundidad + perfil
   → Configuración se guarda en el contexto Y en la base de datos
   → Botón enviar habilitado
   
3. Usuario envía primera pregunta
   → Panel de configuración se minimiza/oculta
   → Configuración persiste para toda la sesión
   
4. Usuario envía segunda pregunta
   → NO se pide volver a configurar
   → Usa la misma profundidad + perfil de la sesión
   
5. Usuario puede cambiar configuración si lo desea
   → Un botón discreto permite modificar (pero no se exige)
```

---

## Cambios Técnicos

### 1. Migración de Base de Datos

Añadir campos a `user_conversations` para persistir la configuración de sesión:

```sql
ALTER TABLE user_conversations 
ADD COLUMN session_depth_level text DEFAULT 'complete',
ADD COLUMN session_role_id text DEFAULT 'general';

COMMENT ON COLUMN user_conversations.session_depth_level IS 
'Nivel de profundidad configurado para toda la sesión: quick, complete, exhaustive';

COMMENT ON COLUMN user_conversations.session_role_id IS 
'ID del rol/perfil seleccionado para toda la sesión. Ej: ceo, periodista, general';
```

### 2. Modificar ChatContext.tsx

Añadir estado de configuración de sesión:

```text
Nuevos estados:
- sessionDepthLevel: DepthLevel ('quick' | 'complete' | 'exhaustive')
- sessionRoleId: string
- isSessionConfigured: boolean (true cuando ya se configuró)

Nuevas funciones:
- configureSession(depthLevel, roleId): Guarda en estado + DB
- Modificar loadHistory: Cargar configuración de sesión existente
- Modificar ensureConversationRecord: Guardar configuración inicial
```

### 3. Modificar ChatInput.tsx

Cambiar la lógica de configuración:

| Antes | Después |
|-------|---------|
| `depthConfirmed` y `roleConfirmed` como estado local | Usar `isSessionConfigured` del contexto |
| Reset después de cada envío | NO resetear - mantener configuración |
| Panel siempre visible | Panel minimizable después de configurar |
| Verificación obligatoria cada mensaje | Verificación solo si NO está configurado |

Lógica de envío modificada:
```javascript
const canSend = value.trim() && !isLoading && isSessionConfigured;

const handleSend = () => {
  if (canSend) {
    // Enviar con la configuración de SESIÓN (no local)
    onSend(value.trim(), { 
      depthLevel: sessionDepthLevel,  // del contexto
      roleId: sessionRoleId !== 'general' ? sessionRoleId : undefined
    });
    setValue("");
    // NO resetear configuración - persiste para toda la sesión
  }
};
```

### 4. Panel de Configuración Colapsable

Después de configurar, el panel se minimiza mostrando solo un resumen:

```text
┌──────────────────────────────────────────────────────┐
│ ⚡ Completo • 👔 CEO/Alta Dirección      [Cambiar ▾] │
└──────────────────────────────────────────────────────┘
```

El usuario puede hacer clic en "Cambiar" para expandir y modificar la configuración si lo desea.

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| Nueva migración SQL | Añadir `session_depth_level` y `session_role_id` a `user_conversations` |
| `src/contexts/ChatContext.tsx` | Añadir estado de sesión, cargar/guardar configuración, exponer `isSessionConfigured` |
| `src/components/chat/ChatInput.tsx` | Usar configuración del contexto, eliminar reset, hacer panel colapsable |

---

## Flujo de Datos

```text
┌─────────────────────┐
│   user_conversations │
│ ┌─────────────────┐ │
│ │ session_depth   │ │  ← Persistencia en DB
│ │ session_role_id │ │
│ └─────────────────┘ │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│    ChatContext      │
│ ┌─────────────────┐ │
│ │ sessionDepth    │ │  ← Estado de React
│ │ sessionRoleId   │ │
│ │ isConfigured    │ │
│ └─────────────────┘ │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│    ChatInput        │
│ ┌─────────────────┐ │
│ │ Lee contexto    │ │  ← UI lee del contexto
│ │ NO estado local │ │
│ └─────────────────┘ │
└─────────────────────┘
```

---

## Casos Especiales

### Usuario No Autenticado
- La configuración se mantiene en el estado de React (sessionStorage como fallback)
- Al cerrar el navegador, se pierde
- Al autenticarse, se migra a la DB

### Cargar Conversación Existente
- Se lee `session_depth_level` y `session_role_id` de `user_conversations`
- Se aplica automáticamente
- El panel aparece minimizado con la configuración cargada

### Nueva Conversación (clearConversation)
- Se resetea la configuración
- El panel vuelve a aparecer para nueva selección

---

## Resultado Esperado

1. **Primera pregunta**: Usuario selecciona perfil + profundidad → Envía
2. **Segunda pregunta**: Usuario solo escribe y envía → Misma configuración
3. **N-ésima pregunta**: Usuario solo escribe y envía → Misma configuración
4. **Cambio opcional**: Usuario puede modificar si quiere (pero no se exige)
