

## Problema detectado

Hay **dos campos ausentes** en el `ReportInfoBar` que aparece sobre cada respuesta del asistente:

1. **Pregunta del usuario**: Se muestra la pregunta **normalizada** (reescrita por el sistema) en lugar de la pregunta **original** que escribió el usuario. Esto ocurre porque el backend asigna `user_question: question` donde `question` es el texto normalizado.

2. **Perfil profesional**: El campo `perspective` (ej. "Director de Comunicación") nunca se incluye en el `report_context` del backend, ni se renderiza en el `ReportInfoBar` del frontend. Además, el frontend no envía el `sessionRoleId` al backend — la línea `const role = options?.roleId ? getRoleById(options.roleId) : undefined` solo usa el roleId pasado por opciones explícitas, no el rol de sesión configurado en `SessionConfigPanel`.

## Cambios necesarios

### 1. Frontend: usar `sessionRoleId` como fallback en `sendMessage` (ChatContext.tsx)

Línea ~476: cambiar la resolución del role para incluir el fallback al rol de sesión:
```ts
const role = options?.roleId 
  ? getRoleById(options.roleId) 
  : sessionRoleId && sessionRoleId !== 'general' 
    ? getRoleById(sessionRoleId) 
    : undefined;
```

### 2. Backend: usar `originalQuestion` para `user_question` y añadir `perspective` (chat-intelligence/index.ts)

**a)** En `handleStandardChat`, añadir parámetro `originalQuestion` y propagarlo.

**b)** En los 3 sitios donde se construye `report_context`:
- Línea ~2376 (skills pipeline): `user_question: originalQuestion || question || null`
- Línea ~4471 (legacy index): `user_question: body.originalQuestion || classifier.pregunta_original || null`
- Línea ~4843 (legacy company): `user_question: body.originalQuestion || classifier.pregunta_original || null`

**c)** Añadir campo `perspective` en los 3 `report_context`:
```ts
perspective: roleName || null,
```

**d)** Pasar `originalQuestion` desde el entry point (línea ~7148) a `handleStandardChat`.

### 3. Frontend: añadir `perspective` al `ReportInfoBar` (ReportInfoBar.tsx)

**a)** Añadir a la interfaz `ReportContext`:
```ts
perspective?: string | null;
```

**b)** Renderizar el perfil en el bar con icono `Theater`:
```tsx
{context.perspective && (
  <span className="flex items-center gap-1 font-medium text-foreground/80">
    <Theater className="h-3 w-3 shrink-0" />
    {context.perspective}
  </span>
)}
```

**c)** Añadir al HTML export en `generateInfoBarHtml`.

### 4. Actualizar `ReportContext` en ChatContext.tsx

Añadir `perspective?: string | null` a la interfaz `ReportContext` duplicada en ChatContext.tsx.

### Archivos a modificar
- `src/contexts/ChatContext.tsx` — fallback a sessionRoleId
- `supabase/functions/chat-intelligence/index.ts` — originalQuestion + perspective en report_context
- `src/components/chat/ReportInfoBar.tsx` — renderizar perspective + interfaz
- `src/components/ui/markdown-message.tsx` — pasar perspective al HTML export (si aplica)

