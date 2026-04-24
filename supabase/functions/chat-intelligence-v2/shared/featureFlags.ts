// Agente Rix v2 — Feature flags for egress optimization (T0+).
// =============================================================
// Two independent flags, both default to FALSE so deploy is a no-op:
//
//   CHAT_V2_LAZY_BRUTO       — when true, builder.ts uses LIGHT_SELECT
//                              (no *_bruto columns) by default and only
//                              fetches *_bruto on demand in skills that
//                              need citation extraction. Enabled in T2.
//
//   CHAT_V2_CITED_URLS_VIEW  — when true, citation extraction reads from
//                              public.rix_runs_v2_cited_urls instead of
//                              the *_bruto columns. Requires the view to
//                              exist (T1) and the 50/50 parity test to
//                              be green. Enabled in T3.
//
// Both flags are read from Deno.env at every call (cheap), so toggling
// them in the Supabase dashboard takes effect on the next request without
// redeploy.

function readBoolEnv(name: string): boolean {
  const raw = (Deno.env.get(name) ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

export function isLazyBrutoEnabled(): boolean {
  return readBoolEnv("CHAT_V2_LAZY_BRUTO");
}

export function isCitedUrlsViewEnabled(): boolean {
  return readBoolEnv("CHAT_V2_CITED_URLS_VIEW");
}

/**
 * Snapshot of all flags in one call. Useful for structured logging at
 * skill entry so we know exactly which paths the request followed.
 */
export function snapshotFlags(): Record<string, boolean> {
  return {
    lazy_bruto: isLazyBrutoEnabled(),
    cited_urls_view: isCitedUrlsViewEnabled(),
  };
}