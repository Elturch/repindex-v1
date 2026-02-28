

# Eliminar boton de Boletin Ejecutivo y codigo relacionado

## Resumen

Eliminar el boton de generar boletin ejecutivo (icono FileText) del chat input y limpiar todo el codigo asociado en el frontend. El backend (chat-intelligence) se deja intacto para no romper compatibilidad.

## Archivos afectados

### 1. `src/components/chat/ChatInput.tsx`
- Eliminar el estado `bulletinModeActive` y `setBulletinModeActive`
- Eliminar la funcion `handleBulletinClick`
- Eliminar el `useEffect` que resetea el bulletin mode
- Eliminar el boton con icono `FileText` y su Tooltip
- Eliminar `bulletinMode` del objeto `options` en `onSend`
- Eliminar la referencia a `bulletinModeActive` en el placeholder y className del Textarea
- Eliminar `bulletinMode` de la interfaz `ChatInputProps.onSend`
- Eliminar el import de `FileText` de lucide-react

### 2. `src/components/chat/FloatingChat.tsx`
- Eliminar `bulletinMode` del tipo de `handleSendMessage`

### 3. `src/contexts/ChatContext.tsx`
- Eliminar `bulletinMode` del tipo de `sendMessage`
- Eliminar la logica de extraccion de `bulletinCompanyName`
- Eliminar `bulletinMode` y `bulletinCompanyName` del body enviado a la API
- Eliminar la funcion helper `getTimeoutForRequest` de su logica de bulletin (mantener timeouts por depth)
- Eliminar el tipo `'bulletin'` de `MessageMetadata.type`
- Eliminar el toast de "Boletin generado"

### 4. `src/components/chat/ChatMessages.tsx`
- Eliminar el import de `CompanyBulletinViewer`
- Eliminar la rama condicional que renderiza `CompanyBulletinViewer` para mensajes tipo bulletin

### 5. `src/components/chat/CompanyBulletinViewer.tsx`
- Eliminar el archivo completo

### 6. `src/lib/chatTranslations.ts`
- Eliminar las propiedades `generateBulletin`, `bulletinPromptPrefix` e `inputPlaceholderBulletin` de la interfaz `ChatTranslations` y de los 10 idiomas

## Lo que NO se toca

- **`supabase/functions/chat-intelligence/index.ts`**: La funcion `handleBulletinRequest` y la logica de `bulletinMode` en el backend se mantienen intactas. Simplemente nunca recibira `bulletinMode: true` desde el frontend, asi que el codigo queda inerte pero no rompe nada.

