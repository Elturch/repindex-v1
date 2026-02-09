

# Rix Press: Sistema de Redaccion Periodistica con IA

## Resumen

Crear un modo "Rix Press" dentro del Agente Rix que permite a usuarios autorizados generar notas de prensa profesionales basadas en los datos e investigaciones de RepIndex. Solo usuarios con el rol `press` podran activar este modo. Se usa Gemini 3 Pro (via Lovable AI Gateway) para redaccion de alta calidad humanizada.

---

## Parte 1: Nuevo rol `press` en la base de datos

### Problema
El enum `app_role` actual solo tiene `admin`, `manager`, `user`. Necesitamos un rol `press` para controlar acceso a Rix Press.

### Solucion
- Ampliar el enum `app_role` con el valor `press`
- No se crea tabla nueva: se reutiliza `user_roles` (un usuario puede tener multiples roles)

```sql
ALTER TYPE app_role ADD VALUE 'press';
```

---

## Parte 2: Panel Admin para asignar rol Press

### Archivo: `src/pages/Admin.tsx`

Anadir una seccion en el panel de admin (en la tab de Users o como nueva tab "Rix Press") que:
- Lista todos los usuarios de `user_profiles`
- Muestra un toggle/switch para activar/desactivar el rol `press` por usuario
- Usa la Edge Function `admin-api` existente (patron security proxy) para insertar/eliminar en `user_roles`

### Archivo: `src/components/admin/RixPressUsersPanel.tsx` (NUEVO)

Componente dedicado que:
- Consulta `user_profiles` + `user_roles` para mostrar estado actual
- Toggle por usuario que llama a `admin-api` con accion `toggle_press_role`
- Muestra badge "Press" junto a usuarios habilitados

---

## Parte 3: Deteccion del permiso en el frontend

### Archivo: `src/contexts/ChatContext.tsx`

- Anadir estado `hasRixPressAccess: boolean` al contexto
- Al montar (cuando el usuario esta autenticado), consultar `user_roles` para verificar si tiene rol `press`
- Exponer `hasRixPressAccess` y `isRixPressMode` en el contexto
- Anadir `toggleRixPressMode()` para activar/desactivar el modo

### Archivo: `src/components/chat/ChatInput.tsx`

- Si `hasRixPressAccess` es true, mostrar un boton "Rix Press" (icono Newspaper) junto al boton de Boletin
- Al activarlo, se pone `pressMode: true` en las opciones de envio
- Visual: boton con estilo diferenciado (gradiente azul oscuro, icono de periodico)
- El placeholder del textarea cambia a algo como "Escribe el tema o pregunta para tu nota de prensa..."

### Archivo: `src/components/chat/SessionConfigPanel.tsx`

- Si `hasRixPressAccess`, mostrar indicador "Modo Rix Press activo" cuando esta activado

---

## Parte 4: Edge Function - Modo Press en chat-intelligence

### Archivo: `supabase/functions/chat-intelligence/index.ts`

Cuando `pressMode: true` en el request body:

1. **Validacion server-side**: Verificar que el `user_id` tiene rol `press` en `user_roles` (no confiar en el frontend)
2. **Prompt especializado**: Usar un system prompt de periodismo profesional:
   - Tono: nota de prensa formal pero accesible
   - Estructura: titular, subtitular, lead, cuerpo, datos de apoyo, cierre con metodologia
   - Fuente: "segun datos del Radar Reputacional RepIndex"
   - Citar scores especificos, dimensiones, modelos de IA
   - Incluir contexto sectorial y comparativo
   - Humanizado: evitar jerga excesiva, hacer accesible al lector generalista
3. **Modelo**: Usar `google/gemini-3-pro-preview` via Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) en lugar de las APIs directas
4. **RAG completo**: Igual que el modo normal, buscar en Vector Store + rix_runs_v2 para fundamentar con datos reales
5. **Streaming**: Mantener el mismo sistema SSE del chat normal
6. **Metadata**: Marcar respuesta con `type: 'press'` para renderizado especial

---

## Parte 5: Renderizado especial de notas de prensa

### Archivo: `src/components/chat/ChatMessages.tsx`

Cuando `message.metadata?.type === 'press'`:
- Renderizar con estilo periodistico: fondo ligeramente diferente, tipografia serif para el contenido
- Badge "Rix Press" con icono de periodico
- Boton de exportar como HTML formateado (reutilizar patron de boletin)

---

## Parte 6: Admin API - Toggle press role

### Archivo: `supabase/functions/admin-api/index.ts`

Anadir handler para la accion `toggle_press_role`:
- Recibe `userId` y `enabled` (boolean)
- Si `enabled`: INSERT en `user_roles` con rol `press`
- Si `!enabled`: DELETE de `user_roles` donde rol = `press`
- Validacion: solo ejecutable desde dominios autorizados (patron proxy existente)

---

## Archivos a crear/modificar

| Archivo | Accion |
|---------|--------|
| Migracion SQL | Crear - Anadir `press` al enum `app_role` |
| `src/components/admin/RixPressUsersPanel.tsx` | Crear - Panel admin para gestionar usuarios press |
| `src/pages/Admin.tsx` | Modificar - Anadir tab/seccion Rix Press |
| `src/contexts/ChatContext.tsx` | Modificar - Anadir `hasRixPressAccess`, `isRixPressMode`, `toggleRixPressMode` |
| `src/components/chat/ChatInput.tsx` | Modificar - Boton Rix Press condicional |
| `src/components/chat/ChatMessages.tsx` | Modificar - Renderizado tipo press |
| `supabase/functions/chat-intelligence/index.ts` | Modificar - Prompt periodistico + validacion rol + Gemini 3 Pro via Lovable AI Gateway |
| `supabase/functions/admin-api/index.ts` | Modificar - Handler toggle_press_role |

---

## Flujo completo

```text
Admin Panel (/admin)
    |
    |-- Toggle "Press" role para usuario X
    |-- admin-api -> INSERT/DELETE user_roles
    |
    v
Usuario X abre /chat
    |
    |-- ChatContext detecta rol 'press' en user_roles
    |-- Muestra boton "Rix Press" en ChatInput
    |
    v
Usuario activa modo Rix Press + escribe pregunta
    |
    |-- pressMode: true en el request
    |
    v
chat-intelligence Edge Function
    |
    |-- Verifica rol 'press' server-side
    |-- RAG: Vector Store + rix_runs_v2
    |-- Prompt periodistico especializado
    |-- Modelo: Gemini 3 Pro (Lovable AI Gateway)
    |-- Streaming SSE
    |
    v
Nota de prensa renderizada con estilo periodistico
    |-- Badge "Rix Press"
    |-- Exportable como HTML
```

## Resultado esperado

- Solo usuarios con rol `press` ven el boton en el chat
- Las notas de prensa son de calidad periodistica profesional
- Fundamentadas al 100% en datos reales de RepIndex (Vector Store + RIX scores)
- Administradores pueden gestionar accesos desde /admin
- Validacion doble: frontend (ocultar boton) + backend (verificar rol)

