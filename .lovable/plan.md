
## Objetivo
Que el botón “Sí, contactadme” (y “No, gracias”) **guarde siempre** el lead en `public.interested_leads` y que en caso de fallo el usuario vea un mensaje claro (no “silencio”), además de poder auditar rápidamente el motivo real (permisos, constraint de `email`, CORS, etc.).

---

## Lo que ya sé (con evidencia)
- En el panel `/admin` (Preview) no aparecen leads porque el `select('*') from interested_leads` devuelve vacío desde el cliente.
- En la base de datos, la tabla `public.interested_leads` tiene **0 filas** ahora mismo (consulta: `count(*) = 0`).
- El cambio reciente en `Login.tsx` evita el “falso OK” (ya no hace `setLeadSaved(...)` si hay `error`), pero:
  - En la pantalla `not_registered` **no se muestra `errorMessage` en ningún sitio**, así que si el insert falla el usuario puede percibirlo como “el botón no funciona”.

---

## Hipótesis principales (ordenadas por probabilidad)
1) **El lead sí intenta guardarse pero falla** y el usuario no ve el error porque el UI de consentimiento no pinta `errorMessage`.
2) **El `upsert(..., { onConflict: 'email' })` falla** porque `email` *no tiene* constraint/índice UNIQUE (error típico: *“there is no unique or exclusion constraint matching the ON CONFLICT specification”*).
3) **Permisos DB**: aunque RLS permita, podría faltar `GRANT INSERT` para `anon`/`authenticated` (error típico: *“permission denied for table interested_leads”*).
4) **El dominio repindex.ai está sirviendo un build distinto** (código o claves Supabase distintas). Esto se detecta viendo en red a qué `https://*.supabase.co/rest/v1/...` apunta y qué key usa.

---

## Plan de auditoría y corrección (lo implementaré en el código cuando apruebes)
### Fase A — Hacer visible el error real (UI/UX) para dejar de “adivinar”
1. **Login.tsx**: en el bloque `loginState === 'not_registered'`:
   - Renderizar un aviso visible si `errorMessage` existe (debajo de botones).
   - (Opcional) añadir `toast` destructivo cuando falle el guardado.
2. Mantener el estado en `not_registered` tras fallo (ya lo haces), pero con feedback claro.

**Resultado esperado**: si falla por constraint/permisos/CORS, veremos el error inmediatamente en pantalla (y en consola).

---

### Fase B — Asegurar que la escritura siempre funciona (solución robusta)
Para eliminar dependencias de RLS/privilegios/constraints en cliente, haré que el guardado pase por una Edge Function con Service Role (servidor):

3. Crear Edge Function `save-interested-lead`:
   - Endpoint público con CORS correcto.
   - Validación estricta:
     - `email` válido
     - `contact_consent` boolean
     - `source` limitado a valores esperados (por ejemplo `login_attempt`)
   - Inserta/actualiza en `public.interested_leads` usando `SUPABASE_SERVICE_ROLE_KEY`.
   - Devuelve `{ ok: true, leadId }` o `{ ok: false, error }`.

4. Cambiar `Login.tsx` para usar **primero**:
   - `supabase.functions.invoke('save-interested-lead', { body: { email, contact_consent, ... }})`
   - Si ok ⇒ `setLeadSaved(...)`
   - Si error ⇒ mostrar mensaje y permitir reintento

**Ventaja**: aunque mañana cambie RLS o se rompa un GRANT, el guardado seguirá funcionando.

---

### Fase C — Corregir la base de datos si hay un problema estructural (si aplica)
5. Verificar en DB (y corregir con migración si falta):
   - **UNIQUE(email)** en `interested_leads` si queremos usar `upsert` por `email`.
     - Si no queremos UNIQUE, cambiamos el enfoque: usar `insert` y dejar histórico (pero entonces el panel debe agrupar).
   - **GRANT INSERT/UPDATE** a roles `anon`/`authenticated` si faltan.
   - Confirmar políticas RLS en `INSERT` siguen correctas.

Nota: aunque adoptemos Edge Function, igualmente conviene arreglar el UNIQUE/GRANT para coherencia y evitar fallos si se usa PostgREST en otros sitios.

---

### Fase D — Verificación end-to-end (repindex.ai + /admin)
6. Validación funcional:
   - Probar en `repindex.ai/login` con email no registrado:
     - una vez con consentimiento
     - otra sin consentimiento
   - Confirmar:
     - aparece confirmación
     - y en `/admin` se ven filas nuevas (y contadores suben)
7. Si `/admin` solo lo revisas en Preview, añadiremos una comprobación adicional:
   - un “botón diagnóstico” en el panel (solo admin) que muestre:
     - `SUPABASE_URL` efectivo
     - `window.location.origin`
     - y resultado del último `select count(*)` para confirmar que estás mirando el mismo backend.

---

## Cambios previstos (archivos)
- `src/pages/Login.tsx`
  - Mostrar `errorMessage` también en la pantalla de consentimiento
  - Cambiar guardado a Edge Function (solución robusta)
- `supabase/functions/save-interested-lead/index.ts`
  - Nueva función para insertar/upsert con Service Role + CORS
- (Posible) `supabase/migrations/*`
  - Añadir UNIQUE(email) y/o GRANTs si se detecta que faltan

---

## Riesgos / consideraciones
- Si `email` no es UNIQUE y queremos mantener un único registro por email, hay que añadir el índice UNIQUE antes de usar `upsert` por `email`.
- La Edge Function debe estar bien protegida contra abuso (mínimo: validación, y opcionalmente rate-limit simple por IP/UA si fuese necesario).

---

## Qué necesito de ti (no técnico)
- Confirmar si quieres **1 lead por email** (se actualiza si vuelve a intentarlo) o **histórico de intentos** (múltiples filas por email).
  - Recomendación: 1 lead por email para un panel simple, a menos que quieras analítica de reintentos.

Si quieres que continúe en una nueva petición (para ejecutar esta auditoría y aplicar los cambios), dímelo y sigo.
