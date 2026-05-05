import type { FilterState } from "./filterState";

/**
 * Memoria local de informes RIX cargados en el visor.
 * Persistida en localStorage. No reemplaza la persistencia del backend
 * (cada informe sigue ligado a su sessionId en chat_messages); solo
 * permite alternar entre informes recientes desde el visor.
 */

const STORAGE_KEY = "rix:viewer:memory";
const ACTIVE_KEY = "rix:viewer:activeId";
const MAX_REPORTS = 30;

export interface ReportMemoryEntry {
  id: string;
  createdAt: number;
  title: string;
  question: string;
  sessionId: string;
  filters: FilterState;
  summary?: {
    intent?: string;
    entity?: string;
    window?: string;
  };
}

function safeRead(): ReportMemoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(list: ReportMemoryEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_REPORTS)));
  } catch {
    /* noop */
  }
}

export function listReports(): ReportMemoryEntry[] {
  return safeRead().sort((a, b) => b.createdAt - a.createdAt);
}

export function addReport(entry: Omit<ReportMemoryEntry, "id" | "createdAt">): ReportMemoryEntry {
  const full: ReportMemoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  const next = [full, ...safeRead()].slice(0, MAX_REPORTS);
  safeWrite(next);
  setActiveId(full.id);
  return full;
}

export function removeReport(id: string) {
  safeWrite(safeRead().filter((r) => r.id !== id));
  if (getActiveId() === id) setActiveId(null);
}

export function clearAll() {
  safeWrite([]);
  setActiveId(null);
}

export function getReport(id: string): ReportMemoryEntry | null {
  return safeRead().find((r) => r.id === id) ?? null;
}

export function getActiveId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* noop */
  }
}

/** Genera un título compacto a partir de los filtros para el listado. */
export function buildReportTitle(filters: FilterState, companies: { ticker: string; issuer_name: string }[]): string {
  const intentLabels: Record<string, string> = {
    vision_general: "Visión general",
    ranking: "Ranking",
    comparativa: "Comparativa",
    evolucion: "Evolución",
    divergencia: "Divergencia",
    perfil: "Perfil",
  };
  const intent = intentLabels[filters.intent.value] ?? "Informe";

  let entity = "IBEX-35";
  if (filters.tickers.value.length > 0) {
    const names = filters.tickers.value
      .map((t) => companies.find((c) => c.ticker === t)?.issuer_name ?? t);
    entity = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
  } else if (filters.subsector.value.length > 0) {
    entity = filters.subsector.value[0];
  } else if (filters.sector.value.length > 0) {
    entity = filters.sector.value[0];
  } else if (filters.universe.value.length > 0) {
    entity = filters.universe.value[0];
  }

  return `${intent} · ${entity}`;
}