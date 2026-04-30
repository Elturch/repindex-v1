
# SPEC P-AUTH-DEV — Auto-login dev/preview por edge function whitelisted

## 1. Objetivo

Permitir que en el entorno de **preview/lovableproject** entres logueado en `/chat` con una sesión Supabase **real** (JWT válido + refresh token), sin abrir el email del magic link, para poder ejecutar SMOKE del patch P2-A en `chat-intelligence-v2`.

**Fuera de alcance:** producción (`repindex.ai`, `repindex-v1.lovable.app`), cualquier user no whitelisted, cualquier flujo expuesto al usuario final.

## 2. Diagnóstico del estado actual

- `/login` (`src/pages/Login.tsx` L30‑35) ya redirige a `/dashboard` automáticamente si `isDevOrPreview()` → **te deja ver la UI pero sin sesión**.
- `ProtectedRoute` (L34‑37) también bypasea auth en preview → renderiza `<ChatIntelligence/>` sin JWT.
- Por eso, al enviar una query, las llamadas a `chat-intelligence-v2` y `user_activity_logs` devuelven **401**: no hay `session.access_token` en el cliente Supabase.
- No existe `src/lib/devAutoLogin.ts` (sólo lo menciona `.env.example`).

## 3. Diseño

### 3.1 Triple gate de seguridad (server)

La edge function `dev-preview-login` rechaza la petición salvo que se cumplan **TODOS**:

1. **Gate Origin/Referer** — el header `Origin` debe matchear estrictamente:
   - `localhost`, `127.0.0.1`
   - `*.lovableproject.com`
   - `*.lovable.app` con `preview` en el subdominio
   - `*.lovable.dev`
   - **Cualquier otro origen ⇒ 403** (`repindex.ai`, `repindex-v1.lovable.app`, dominios desconocidos).
2. **Gate Email Allowlist** — el body trae `email`; debe estar en `DEV_PREVIEW_LOGIN_ALLOWLIST` (secret CSV, p. ej. `maturci@gmail.com`). Caso contrario ⇒ 403.
3. **Gate Shared Secret** — el body trae `secret`; debe igualar `DEV_PREVIEW_LOGIN_SECRET`. Caso contrario ⇒ 403. Mismo secret se inyecta al cliente como build secret `VITE_DEV_PREVIEW_LOGIN_SECRET` (no es sensible filtrarlo al bundle del *preview* porque la function ya filtra por origen, pero defensa en profundidad).

Cualquier 403 se loggea con `Origin`, `email`, `reason` para auditoría.

### 3.2 Generación de sesión real (server)

Mismo patrón que `send-user-magic-link`:

1. `auth.admin.getUserById` → verifica que el user existe y `is_active`.
2. Auto-confirma email si hace falta.
3. `auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: <origen> } })` → devuelve `properties.hashed_token` (formato OTP token) **o** `action_link` (URL completa con `#access_token=...`).
4. Devuelve al cliente:
   ```json
   { "ok": true, "action_link": "https://<preview>/dashboard#access_token=...&refresh_token=...&type=magiclink" }
   ```
   El cliente extrae los tokens del fragment y llama `supabase.auth.setSession({ access_token, refresh_token })`. Sesión persistida en `localStorage` del origen preview, lista para `/chat`.

### 3.3 Botón cliente (UI)

En `src/pages/Login.tsx`, dentro del bloque actual de auto‑redirect, **añadir condicional**:

- Si `isDevOrPreview()` **Y** `import.meta.env.VITE_DEV_PREVIEW_LOGIN_EMAIL` está definido → renderiza una pantalla con un botón único `"🔓 Dev preview login: <email>"`.
- Si falta el env, fallback a la redirección actual a `/dashboard` (comportamiento actual intacto).
- Click → llama `supabase.functions.invoke('dev-preview-login', { body: { email, secret }})` → `setSession()` → `navigate('/chat')`.

No se modifica `ProtectedRoute`, ni `AuthContext`, ni `App.tsx`, ni nada de prod.

## 4. Contratos

### Edge function `POST /functions/v1/dev-preview-login`

**Request body:**
```ts
{ email: string; secret: string; redirect_to?: string }
```

**Headers:** `Origin` (validado), `apikey` (anon, automático del SDK).

**Responses:**
- `200 { ok: true, action_link: string }`
- `403 { ok: false, error: 'forbidden_origin' | 'forbidden_email' | 'forbidden_secret' }`
- `404 { ok: false, error: 'user_not_found' }`
- `500 { ok: false, error: string }`

`verify_jwt = false` (no hay sesión todavía cuando se llama).

### Secrets nuevos

- `DEV_PREVIEW_LOGIN_SECRET` (runtime) — string aleatoria larga.
- `DEV_PREVIEW_LOGIN_ALLOWLIST` (runtime) — CSV de emails: `maturci@gmail.com`.
- `VITE_DEV_PREVIEW_LOGIN_EMAIL` (build, opcional) — email a pre-rellenar en el botón.
- `VITE_DEV_PREVIEW_LOGIN_SECRET` (build) — mismo valor que `DEV_PREVIEW_LOGIN_SECRET`.

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Edge function expuesta públicamente | Triple gate: origen + email allowlist + shared secret. |
| Build secret `VITE_*` filtrado al bundle de prod | El bundle de prod sirve `repindex.ai`, donde el botón nunca se renderiza (`isDevOrPreview()` falla). Aunque alguien encuentre el secret en JS, la function filtra por `Origin`. |
| User whitelisted compromete su gmail → escalada | Allowlist es manual y corta (1‑2 emails). Rotar `DEV_PREVIEW_LOGIN_SECRET` cuando ya no sea necesario. |
| `generateLink` falla por usuario inexistente | Devuelve 404 limpio. |
| Race con session listener existente | `setSession` dispara `onAuthStateChange` → `AuthContext.fetchProfile` ya gestiona ese caso. |

## 6. Garantías post-cambio

- ❌ Cero cambios en `ChatContext.tsx`, `chat-intelligence-v2`, `agentVersion.ts`, `getEdgeFunctionName`, `ProtectedRoute`, `AuthContext`, `App.tsx`, RLS, schema.
- ❌ Cero cambios en path V1, P1‑C.1 (`buildPerCompanyDimensionsBlock`), P2‑A (clasificación de `fallbackVector`).
- ❌ Cero cambios en flujo magic link de producción (`send-user-magic-link` intacta).
- ✅ Sólo se añade: 1 edge function nueva + 1 botón opcional en `/login`.

## 7. Archivos tocados (preview del DIFF, sin aplicar)

### A. NUEVO — `supabase/functions/dev-preview-login/index.ts` (~120 líneas)

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function isDevOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const h = new URL(origin).hostname;
    if (h === "localhost" || h === "127.0.0.1") return true;
    if (h.endsWith(".lovableproject.com")) return true;
    if (h.endsWith(".lovable.dev")) return true;
    if (h.endsWith(".lovable.app") && h.includes("preview")) return true;
    return false;
  } catch { return false; }
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const origin = req.headers.get("origin");
  if (!isDevOrigin(origin)) {
    console.warn("[dev-preview-login] forbidden_origin", { origin });
    return new Response(
      JSON.stringify({ ok: false, error: "forbidden_origin" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const { email, secret, redirect_to } = await req.json();
    const expectedSecret = Deno.env.get("DEV_PREVIEW_LOGIN_SECRET");
    const allowlist = (Deno.env.get("DEV_PREVIEW_LOGIN_ALLOWLIST") ?? "")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

    if (!expectedSecret || secret !== expectedSecret) {
      console.warn("[dev-preview-login] forbidden_secret", { origin, email });
      return new Response(
        JSON.stringify({ ok: false, error: "forbidden_secret" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalized = String(email ?? "").trim().toLowerCase();
    if (!allowlist.includes(normalized)) {
      console.warn("[dev-preview-login] forbidden_email", { origin, email: normalized });
      return new Response(
        JSON.stringify({ ok: false, error: "forbidden_email" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, srk, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify user exists & active
    const { data: profile } = await admin
      .from("user_profiles")
      .select("id, is_active")
      .eq("email", normalized)
      .maybeSingle();

    if (!profile || !profile.is_active) {
      return new Response(
        JSON.stringify({ ok: false, error: "user_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Auto-confirm if needed
    const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
    if (authUser?.user && !authUser.user.email_confirmed_at) {
      await admin.auth.admin.updateUserById(profile.id, { email_confirm: true });
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: normalized,
      options: { redirectTo: redirect_to || `${origin}/chat` },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error("[dev-preview-login] generateLink error", linkErr);
      return new Response(
        JSON.stringify({ ok: false, error: "link_generation_failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[dev-preview-login] ✅ session issued", { origin, email: normalized });
    return new Response(
      JSON.stringify({ ok: true, action_link: linkData.properties.action_link }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[dev-preview-login] unexpected", e);
    return new Response(
      JSON.stringify({ ok: false, error: "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

### B. EDIT — `src/pages/Login.tsx`

Cambio mínimo en el `useEffect` de L30‑42 (sustituye el redirect ciego en preview por: si hay env de dev → render botón, si no → redirect actual). Añade un nuevo bloque condicional de UI antes del `return` final.

```diff
@@ src/pages/Login.tsx  (L29-42)
   // In dev/preview mode, skip login entirely and go to dashboard
   useEffect(() => {
-    if (isDevOrPreview()) {
+    // If in dev/preview AND no DEV button env configured, fall back to old behavior
+    if (isDevOrPreview() && !import.meta.env.VITE_DEV_PREVIEW_LOGIN_EMAIL) {
       const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
       navigate(from, { replace: true });
       return;
     }
     // Redirect if already authenticated
     if (!isLoading && isAuthenticated) {
       const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
       navigate(from, { replace: true });
     }
   }, [isAuthenticated, isLoading, navigate, location]);
```

Y un nuevo handler + botón visible cuando `isDevOrPreview() && VITE_DEV_PREVIEW_LOGIN_EMAIL` (insertado dentro del `<Card>`, antes del bloque `loginState === 'sent' ? ...` o como rama nueva al inicio del ternario):

```diff
+  const [devLoading, setDevLoading] = useState(false);
+  const handleDevLogin = useCallback(async () => {
+    setDevLoading(true);
+    setErrorMessage('');
+    try {
+      const devEmail = import.meta.env.VITE_DEV_PREVIEW_LOGIN_EMAIL as string;
+      const devSecret = import.meta.env.VITE_DEV_PREVIEW_LOGIN_SECRET as string;
+      const { data, error } = await supabase.functions.invoke('dev-preview-login', {
+        body: {
+          email: devEmail,
+          secret: devSecret,
+          redirect_to: `${window.location.origin}/chat`,
+        },
+      });
+      if (error || !data?.ok) {
+        setErrorMessage(`Dev login failed: ${data?.error || error?.message || 'unknown'}`);
+        return;
+      }
+      // Extract tokens from action_link fragment and setSession
+      const url = new URL(data.action_link);
+      const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
+      const access_token = hash.get('access_token');
+      const refresh_token = hash.get('refresh_token');
+      if (!access_token || !refresh_token) {
+        // Fallback: just navigate to the action_link
+        window.location.href = data.action_link;
+        return;
+      }
+      const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
+      if (setErr) {
+        setErrorMessage(`setSession failed: ${setErr.message}`);
+        return;
+      }
+      navigate('/chat', { replace: true });
+    } finally {
+      setDevLoading(false);
+    }
+  }, [navigate]);
```

Y la rama UI (insertada como primera rama del ternario en CardContent):

```diff
+  {isDevOrPreview() && import.meta.env.VITE_DEV_PREVIEW_LOGIN_EMAIL ? (
+    <div className="text-center py-6 space-y-4">
+      <div className="text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400">
+        Dev / Preview only
+      </div>
+      <Button onClick={handleDevLogin} disabled={devLoading} className="w-full">
+        {devLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : '🔓 '}
+        Login as {import.meta.env.VITE_DEV_PREVIEW_LOGIN_EMAIL}
+      </Button>
+      {errorMessage && (
+        <div className="flex items-center gap-2 text-destructive text-sm justify-center">
+          <AlertCircle className="h-4 w-4" /> <span>{errorMessage}</span>
+        </div>
+      )}
+    </div>
+  ) : leadSaveResult ? (
+    /* ... existing branches unchanged ... */
+  ) : ...
```

**Total:** 1 archivo nuevo (~120 LoC) + 1 archivo editado (~50 LoC añadidas, 1 línea modificada).

## 8. Plan de SMOKE post-APPLY

1. **Tú**: añade los 4 secrets en Lovable (`DEV_PREVIEW_LOGIN_SECRET`, `DEV_PREVIEW_LOGIN_ALLOWLIST=maturci@gmail.com`, `VITE_DEV_PREVIEW_LOGIN_EMAIL=maturci@gmail.com`, `VITE_DEV_PREVIEW_LOGIN_SECRET=<mismo valor>`).
2. Edge function se despliega automática.
3. Abres `https://id-preview--bc807963-c063-4e58-b3fe-21a2a28cd8bf.lovable.app/login` → ves botón ámbar "Login as maturci@gmail.com".
4. Click → en ~1s te redirige a `/chat` con sesión real (verás tu avatar/profile cargado).
5. Lanzas `"Análisis de reputación del sector banca española"` con toggle V2.
6. Validas que NO aparece la tarjeta "V1 (FALLBACK)" y que en consola sale `[RIX-V2][fallback-decision]` con `vector: 'client_timeout'` + `blockFallback: true` si hay timeout.

**Verificación de no-regresión prod:**
- Abrir `https://repindex.ai/login` → flujo magic link normal, **sin** botón dev (porque `isDevOrPreview() === false` aunque el env esté en el bundle).
- `curl -X POST https://...supabase.co/functions/v1/dev-preview-login -H 'Origin: https://repindex.ai' -d '{"email":"x","secret":"x"}'` → debe devolver `403 forbidden_origin`.

## 9. Pendiente de tu OK

NO he tocado nada. Espero **`APPLY P-AUTH-DEV`** para:
1. Crear `supabase/functions/dev-preview-login/index.ts`.
2. Editar `src/pages/Login.tsx`.
3. Pedirte (vía add_secret) los 2 secrets runtime cuando confirmes los valores.

Los 2 build secrets `VITE_*` los tienes que añadir tú en **Project Settings → Environment Variables** (no puedo gestionarlos vía tool).
