/**
 * FASE 1 — Pivote total a rix_runs_v2.
 *
 * `rix_trends` queda DEPRECATED (sin escritor desde el DROP TRIGGER sync_rix_trends).
 * Este helper lee `rix_runs_v2` y devuelve filas con la misma forma que tenía
 * `rix_trends`, para que las superficies que ya consumían ese shape no necesiten
 * reescribirse desde cero.
 *
 * Campos devueltos (compatibles con rix_trends):
 *   ticker, company_name, model_name, batch_week,
 *   rix_score, stock_price, sector_category, ibex_family_code, is_traded
 *
 * Reglas:
 * - Sólo se usa rix_runs_v2 (6 IAs). NUNCA fallback a rix_runs / rix_trends.
 * - Si V2 no tiene la semana pedida, devolvemos array vacío (estado vacío
 *   controlado en la superficie consumidora).
 */
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export interface TrendShimRow {
  ticker: string;
  company_name: string;
  model_name: string;
  batch_week: string; // yyyy-MM-dd
  rix_score: number;
  stock_price: number | null;
  sector_category: string | null;
  ibex_family_code: string | null;
  is_traded: boolean;
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

function parseStockPrice(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  // Heurística simple análoga a normalize_stock_price (sin contexto histórico):
  if (n >= 100000) return n / 100000;
  if (n >= 10000) return n / 1000;
  if (n >= 1000) return n / 100;
  return n;
}

async function fetchIssuerMap() {
  const { data } = await supabase
    .from("repindex_root_issuers")
    .select("ticker, sector_category, ibex_family_code, cotiza_en_bolsa, issuer_name");
  const map = new Map<string, { sector_category: string | null; ibex_family_code: string | null; cotiza_en_bolsa: boolean; issuer_name: string | null }>();
  (data || []).forEach((r: any) => {
    map.set(r.ticker, {
      sector_category: r.sector_category ?? null,
      ibex_family_code: r.ibex_family_code ?? null,
      cotiza_en_bolsa: r.cotiza_en_bolsa ?? false,
      issuer_name: r.issuer_name ?? null,
    });
  });
  return map;
}

function rowToShim(row: any, issuerMap: Map<string, any>): TrendShimRow | null {
  const ticker = row["05_ticker"];
  const model = row["02_model_name"];
  const rix = row["51_rix_score_adjusted"] ?? row["09_rix_score"];
  const batch = row.batch_execution_date;
  if (!ticker || !model || rix === null || rix === undefined || !batch) return null;
  const issuer = issuerMap.get(ticker);
  return {
    ticker,
    company_name: row["03_target_name"] || issuer?.issuer_name || ticker,
    model_name: model,
    batch_week: format(new Date(batch), "yyyy-MM-dd"),
    rix_score: Number(rix),
    stock_price: parseStockPrice(row["48_precio_accion"]),
    sector_category: issuer?.sector_category ?? null,
    ibex_family_code: issuer?.ibex_family_code ?? null,
    is_traded: issuer?.cotiza_en_bolsa ?? false,
  };
}

/**
 * Devuelve la lista de batch_week disponibles en rix_runs_v2,
 * normalizadas a yyyy-MM-dd, ordenadas DESC.
 */
export async function getAvailableWeeksV2(): Promise<string[]> {
  const weeks = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select("batch_execution_date")
      .order("batch_execution_date", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach((r: any) => {
      if (r.batch_execution_date) weeks.add(format(new Date(r.batch_execution_date), "yyyy-MM-dd"));
    });
    if (data.length < PAGE_SIZE) break;
  }
  return Array.from(weeks).sort((a, b) => b.localeCompare(a));
}

/**
 * Devuelve filas tipo rix_trends para una semana concreta (batch_week yyyy-MM-dd).
 * Si la semana no existe en V2 → array vacío (estado vacío controlado).
 */
export async function fetchTrendShimByWeek(week: string): Promise<TrendShimRow[]> {
  const dayStart = `${week}T00:00:00.000Z`;
  const dayEnd = `${week}T23:59:59.999Z`;
  const issuerMap = await fetchIssuerMap();
  const all: TrendShimRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select(
        '"02_model_name","03_target_name","05_ticker","09_rix_score","51_rix_score_adjusted","48_precio_accion",batch_execution_date'
      )
      .gte("batch_execution_date", dayStart)
      .lte("batch_execution_date", dayEnd)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach((row: any) => {
      const shim = rowToShim(row, issuerMap);
      if (shim) all.push(shim);
    });
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

/**
 * Devuelve filas tipo rix_trends para un ticker concreto a lo largo de N semanas.
 * Útil para gráficas de evolución.
 */
export async function fetchTrendShimByTicker(
  ticker: string,
  weeksBack: number = 12
): Promise<TrendShimRow[]> {
  const issuerMap = await fetchIssuerMap();
  const all: TrendShimRow[] = [];
  const seenWeeks = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("rix_runs_v2")
      .select(
        '"02_model_name","03_target_name","05_ticker","09_rix_score","51_rix_score_adjusted","48_precio_accion",batch_execution_date'
      )
      .eq("05_ticker", ticker)
      .order("batch_execution_date", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach((row: any) => {
      const shim = rowToShim(row, issuerMap);
      if (shim) {
        seenWeeks.add(shim.batch_week);
        all.push(shim);
      }
    });
    if (data.length < PAGE_SIZE || seenWeeks.size >= weeksBack) break;
  }
  const keepWeeks = new Set(
    Array.from(seenWeeks).sort((a, b) => b.localeCompare(a)).slice(0, weeksBack)
  );
  return all.filter((r) => keepWeeks.has(r.batch_week));
}

/**
 * Devuelve filas tipo rix_trends filtrando por nombre de empresa parcial
 * en una semana concreta. Para reemplazar consultas ilike("company_name", ...).
 */
export async function fetchTrendShimByCompanyMatch(
  week: string,
  companyNeedles: string[]
): Promise<TrendShimRow[]> {
  const all = await fetchTrendShimByWeek(week);
  if (companyNeedles.length === 0) return all;
  const lcNeedles = companyNeedles.map((n) => n.toLowerCase());
  return all.filter((r) =>
    lcNeedles.some((n) => r.company_name.toLowerCase().includes(n))
  );
}
