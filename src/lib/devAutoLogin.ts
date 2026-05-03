import { supabase } from "@/integrations/supabase/client";
import { isDevOrPreview } from "@/lib/env";

let inflight: Promise<boolean> | null = null;
let lastSuccessAt = 0;

const SUPABASE_URL = "https://jzkjykmrwisijiqlwuua.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a2p5a21yd2lzaWppcWx3dXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyODgsImV4cCI6MjA3Mzc3MDI4OH0.9Uw6nBNjo7zOHPyC8zcJLaEvaoLzBNf65U5QOb0XVQU";

async function callDevPreviewSession(): Promise<{ access_token?: string; refresh_token?: string } | null> {
  const url = `${SUPABASE_URL}/functions/v1/dev-preview-session`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };

  // Retry up to 3 times with backoff to survive cold starts and the Lovable
  // fetch proxy occasionally swallowing the very first POST.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers, body: "{}" });
      if (!res.ok) {
        console.warn(`[devAutoLogin] attempt ${attempt} failed`, res.status, await res.text());
      } else {
        const json = await res.json();
        if (json?.access_token && json?.refresh_token) return json;
        console.warn("[devAutoLogin] response missing tokens", json);
      }
    } catch (e) {
      console.warn(`[devAutoLogin] attempt ${attempt} error`, e);
    }
    await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  return null;
}

/**
 * Ensures a Supabase session exists when running in Lovable Preview / localhost.
 * Calls the `dev-preview-session` edge function (origin-allowlisted) which returns
 * tokens for a fixed admin user. Idempotent — no-op if already authenticated or in production.
 */
export async function ensureDevSession(force = false): Promise<boolean> {
  if (!isDevOrPreview()) return false;
  // Throttle: skip if we already established a session in the last 30s.
  if (!force && Date.now() - lastSuccessAt < 30_000) return true;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data: existing } = await supabase.auth.getSession();
      if (existing?.session?.user) {
        lastSuccessAt = Date.now();
        return true;
      }

      const tokens = await callDevPreviewSession();
      if (!tokens) return false;

      const { error } = await supabase.auth.setSession({
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token!,
      });
      if (error) {
        console.warn("[devAutoLogin] setSession error", error);
        return false;
      }

      const { data: verified } = await supabase.auth.getUser();
      if (verified?.user) {
        lastSuccessAt = Date.now();
        console.log("[devAutoLogin] preview session established for", verified.user.email);
        return true;
      }
      console.warn("[devAutoLogin] session set but getUser empty");
      return false;
    } catch (e) {
      console.warn("[devAutoLogin] unexpected", e);
      return false;
    } finally {
      // Allow future retries.
      setTimeout(() => { inflight = null; }, 0);
    }
  })();

  return inflight;
}