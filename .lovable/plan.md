

## Plan: Eliminar selector de roles — siempre usar "general"

### Contexto
Nadie usa los roles. El informe siempre debe orientarse a alta dirección (CEO, DirCom, Marketing) sin que el usuario tenga que elegir. El rol "general" ya cubre este enfoque.

### Cambios

#### 1. Eliminar `SessionConfigPanel` del chat
**`src/components/chat/ChatInput.tsx`** — Quitar el import y el renderizado de `<SessionConfigPanel />` (línea 8 y 199).

#### 2. Simplificar `ChatContext`
**`src/contexts/ChatContext.tsx`** — Eliminar del estado y de la interfaz:
- `sessionRoleId` (hardcodear `'general'`)
- `isSessionConfigured` (siempre `true`)
- `configureSession` (función vacía o eliminar)
- Limpiar la lógica de `roleId` en `sendMessage` (nunca enviar roleId al edge function)
- Eliminar la restauración de `session_role_id` al cargar conversaciones

#### 3. Eliminar el archivo `SessionConfigPanel.tsx`
**`src/components/chat/SessionConfigPanel.tsx`** — Borrar completamente.

#### 4. Limpiar edge function (opcional pero recomendado)
**`supabase/functions/chat-intelligence/index.ts`** — El `handleEnrichRequest` y `generateRoleSpecificQuestions` quedan como código muerto. No se elimina ahora para no arriesgar regresiones, pero el roleId dejará de llegar desde el cliente.

#### 5. Limpiar archivos auxiliares
**`src/lib/chatRoles.ts`** — Mantener solo la definición de `general` (el edge function puede seguir usándolo internamente). Opcionalmente marcar todas las demás como `enabled: false`.

### Archivos afectados
1. `src/components/chat/ChatInput.tsx` — quitar SessionConfigPanel
2. `src/contexts/ChatContext.tsx` — simplificar estado de roles
3. `src/components/chat/SessionConfigPanel.tsx` — eliminar
4. `src/lib/chatRoles.ts` — limpiar (opcional)

