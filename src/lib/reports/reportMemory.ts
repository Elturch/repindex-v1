import { supabase } from "@/integrations/supabase/client";
import type { FilterState } from "./filterState";

/**
 * Memoria de informes RIX por usuario, persistida en Supabase (tabla `rix_reports`).
 * El "active id" sigue en localStorage porque es estado efímero del visor.
 */

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

interface RowShape {
  id: string;
  session_id: string;
  title: string;
  question: string;
  filters: unknown;
  summary: unknown;
  created_at: string;
}

function rowToEntry(row: RowShape): ReportMemoryEntry {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).getTime(),
    title: row.title,
    question: row.question,
    sessionId: row.session_id,
    filters: row.filters as FilterState,
    summary: (row.summary ?? undefined) as ReportMemoryEntry["summary"],
  };
}

export async function listReports(userId: string): Promise<ReportMemoryEntry[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("rix_reports")
    .select("id, session_id, title, question, filters, summary, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_REPORTS);
  if (error) {
    console.error("[reportMemory] listReports", error);
    return [];
  }
  return (data ?? []).map(rowToEntry);
}

export async function addReport(
  userId: string,
  entry: Omit<ReportMemoryEntry, "id" | "createdAt">,
): Promise<ReportMemoryEntry | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("rix_reports")
    .insert({
      user_id: userId,
      session_id: entry.sessionId,
      title: entry.title,
      question: entry.question,
      filters: entry.filters as unknown as Record<string, unknown>,
      summary: (entry.summary ?? null) as unknown as Record<string, unknown> | null,
    })
    .select("id, session_id, title, question, filters, summary, created_at")
    .single();
  if (error || !data) {
    console.error("[reportMemory] addReport", error);
    return null;
  }
  const full = rowToEntry(data as RowShape);
  setActiveId(full.id);
  return full;
}

export async function removeReport(userId: string, id: string): Promise<void> {
  if (!userId) return;
  const { error } = await supabase
    .from("rix_reports")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) console.error("[reportMemory] removeReport", error);
  if (getActiveId() === id) setActiveId(null);
}

export async function clearAll(userId: string): Promise<void> {
  if (!userId) return;
  const { error } = await supabase
    .from("rix_reports")
    .delete()
    .eq("user_id", userId);
  if (error) console.error("[reportMemory] clearAll", error);
  setActiveId(null);
}

export async function getReport(userId: string, id: string): Promise<ReportMemoryEntry | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("rix_reports")
    .select("id, session_id, title, question, filters, summary, created_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToEntry(data as RowShape);
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
