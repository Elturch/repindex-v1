He comprobado que el mecanismo nuevo sí puede crear sesión en mi navegador de prueba: `dev-preview-session` devuelve 200, `supabase.auth.setSession` se ejecuta y `ChatContext` pasa a `isAuthenticated: true` con el usuario `maturci@gmail.com`.

Pero en tu sesión concreta aparece todavía `Failed to fetch` y luego `no authenticated user`. Eso apunta a que la primera carga del Preview está usando una versión antigua/cacheada o que el auto-login falla silenciosamente antes de que `AuthProvider` actualice el estado.

Plan de corrección:

1. Hacer el auto-login más robusto en frontend
   - Llamar a `dev-preview-session` con los mismos headers que espera Supabase Functions: `apikey`, `Content-Type` y `x-client-info`.
   - Usar fallback con `supabase.functions.invoke('dev-preview-session')` si el `fetch` directo falla.
   - Tras `setSession`, validar con `supabase.auth.getUser()` que la sesión quedó realmente materializada.
   - Emitir logs claros: inicio, origen, status HTTP, tokens recibidos, usuario final.

2. Eliminar la carrera con `AuthProvider`
   - Añadir una señal global de “dev session ready”.
   - Hacer que `AuthProvider` espere a esa promesa en Preview antes de decidir que no hay usuario.
   - Esto evita que `ChatContext` arranque con `user: null` y bloquee el envío aunque la sesión llegue milisegundos después.

3. Endurecer CORS del Edge Function
   - Incluir todos los headers habituales del SDK actual: `authorization`, `apikey`, `content-type`, `x-client-info`, `x-supabase-*`.
   - Mantener la allowlist estricta de orígenes de Preview/local.
   - No habilitarlo para `repindex.ai` ni dominios publicados.

4. Añadir fallback manual de recuperación en Preview
   - Si el auto-login falla, mostrar un estado claro en `/chat`: “Inicializando sesión de Preview…” o un botón “Reintentar sesión de Preview”.
   - No redirigir a login ni permitir que el usuario escriba mientras no exista `currentUserId` real.

5. Verificar de nuevo la consulta solicitada
   - Abrir `/chat` en Preview.
   - Confirmar en consola que la sesión se establece.
   - Ejecutar: `dame el top 5 del ibex-35 de esta semana`.
   - Confirmar que ya no aparece `no authenticated user`.
   - Extraer y mostrarte el header y los 5 resultados visibles.

No tocaré la autenticación de producción. El cambio queda limitado a Preview/local mediante `isDevOrPreview()` y el allowlist del Edge Function.