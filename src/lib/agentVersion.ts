// Agent version selector (v1 vs v2) — preview-only A/B switch.
// Persisted in localStorage so the choice survives reloads.
// Production builds always use v1, regardless of localStorage state.

export type AgentVersion = "v1" | "v2";

const STORAGE_KEY = "repindex.agentVersion";

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

/** Read the active agent version. URL ?agent=v2 wins, then localStorage, then v1. */
export function getAgentVersion(): AgentVersion {
  if (typeof window === "undefined") return "v1";
  // Production: always v1, ignore any toggle state.
  if (!isPreviewEnvironment()) return "v1";
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