import { supabase } from "@/integrations/supabase/client";
import { isDevOrPreview } from "@/lib/env";

let inflight: Promise<void> | null = null;

/**
 * Ensures a Supabase session exists when running in Lovable Preview / localhost.
 * Calls the `dev-preview-session` edge function (origin-allowlisted) which returns
 * tokens for a fixed admin user. Idempotent — no-op if already authenticated or in production.
 */
export async function ensureDevSession(): Promise<void> {
  if (!isDevOrPreview()) return;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data: existing } = await supabase.auth.getSession();
      if (existing?.session) return;

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/dev-preview-session`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        console.warn("[devAutoLogin] edge function failed", res.status, await res.text());
        return;
      }

      const { access_token, refresh_token } = await res.json();
      if (!access_token || !refresh_token) {
        console.warn("[devAutoLogin] missing tokens in response");
        return;
      }

      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) {
        console.warn("[devAutoLogin] setSession error", error);
      } else {
        console.log("[devAutoLogin] preview session established");
      }
    } catch (e) {
      console.warn("[devAutoLogin] unexpected", e);
    }
  })();

  return inflight;
}