// Agent version selector (v1 vs v2) — preview-only A/B switch.
// Persisted in localStorage so the choice survives reloads.
// Production builds always use v1, regardless of localStorage state.

export type AgentVersion = "v1" | "v2";

const STORAGE_KEY = "repindex.agentVersion";
const TRAFFIC_SPLIT_KEY = "rix_traffic_split";
const SESSION_DECISION_KEY = "repindex.agentVersion.session";
let trafficLogged = false;

/** True when running in Lovable preview, lovable.app domains, or localhost. */
export function isPreviewEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com") ||
    host.includes("lovable.dev")
  );
}

/**
 * Read the percentage (0–100) of traffic that should be routed to v2 in
 * production. Source of truth (in priority order):
 *   1. localStorage["rix_traffic_split"]  (e.g. "10" → 10%)
 *   2. Vite env VITE_RIX_TRAFFIC_SPLIT
 *   3. 0  (everyone on v1)
 */
export function getTrafficSplit(): number {
  if (typeof window === "undefined") return 0;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(TRAFFIC_SPLIT_KEY);
  } catch { /* ignore */ }
  if (!raw) {
    try {
      const env = (import.meta as any)?.env?.VITE_RIX_TRAFFIC_SPLIT;
      if (typeof env === "string" || typeof env === "number") raw = String(env);
    } catch { /* ignore */ }
  }
  if (!raw) return 0;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Decide which agent version this *production* session should use, based
 * on the configured traffic split. Decision is cached in sessionStorage so
 * the same user stays on the same engine for the whole session.
 */
function decideProductionVersion(): AgentVersion {
  const split = getTrafficSplit();
  if (split <= 0) return "v1";
  let decided: AgentVersion | null = null;
  try {
    const cached = window.sessionStorage.getItem(SESSION_DECISION_KEY);
    if (cached === "v1" || cached === "v2") decided = cached;
  } catch { /* ignore */ }
  if (!decided) {
    decided = Math.random() * 100 < split ? "v2" : "v1";
    try { window.sessionStorage.setItem(SESSION_DECISION_KEY, decided); } catch { /* ignore */ }
  }
  if (!trafficLogged) {
    trafficLogged = true;
    // eslint-disable-next-line no-console
    console.info(`[RIX] Traffic split: ${split}%, this session: ${decided}`);
  }
  return decided;
}

/**
 * Read the active agent version.
 *  • Preview (lovable / localhost): URL ?agent=v2 wins, then localStorage
 *    toggle, then v1. Manual toggle ALWAYS prevails over traffic split.
 *  • Production: deterministic per-session pick based on getTrafficSplit().
 */
export function getAgentVersion(): AgentVersion {
  if (typeof window === "undefined") return "v1";
  // Production: progressive migration via traffic split.
  if (!isPreviewEnvironment()) return decideProductionVersion();
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("agent");
    if (fromUrl === "v2" || fromUrl === "v1") return fromUrl;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "v2" || stored === "v1") return stored;
  } catch {
    /* ignore */
  }
  return "v1";
}

/** Persist the agent version choice. Triggers a custom event so listeners refresh. */
export function setAgentVersion(version: AgentVersion): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, version);
    window.dispatchEvent(new CustomEvent("repindex:agent-version-change", { detail: version }));
  } catch {
    /* ignore */
  }
}

/** Map an agent version to its edge function name. */
export function getEdgeFunctionName(version?: AgentVersion): "chat-intelligence" | "chat-intelligence-v2" {
  const v = version ?? getAgentVersion();
  return v === "v2" ? "chat-intelligence-v2" : "chat-intelligence";
}