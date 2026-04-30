/**
 * FASE 1 — Edge shim para leer rix_runs_v2 con el shape de rix_trends.
 *
 * Idéntico al helper frontend (`src/lib/rixV2TrendShim.ts`) pero en Deno.
 * `rix_trends` está deprecada (DROP TRIGGER sync_rix_trends). Cualquier
 * edge function que necesite "datos semanales por modelo y empresa" debe
 * usar este shim. NUNCA fallback a rix_trends ni a rix_runs.
 */

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

function fmtDay(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

function parseStockPrice(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 100000) return n / 100000;
  if (n >= 10000) return n / 1000;
  if (n >= 1000) return n / 100;
  return n;
}

async function fetchIssuerMap(supabase: any) {
  const { data } = await supabase
    .from("repindex_root_issuers")
    .select("ticker, sector_category, ibex_family_code, cotiza_en_bolsa, issuer_name");
  const map = new Map<
    string,
    {
      sector_category: string | null;
      ibex_family_code: string | null;
      cotiza_en_bolsa: boolean;
      issuer_name: string | null;
    }
  >();
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
    batch_week: fmtDay(batch),
    rix_score: Number(rix),
    stock_price: parseStockPrice(row["48_precio_accion"]),
    sector_category: issuer?.sector_category ?? null,
    ibex_family_code: issuer?.ibex_family_code ?? null,
    is_traded: issuer?.cotiza_en_bolsa ?? false,
  };
}

export async function getAvailableWeeksV2(supabase: any): Promise<string[]> {
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
      if (r.batch_execution_date) weeks.add(fmtDay(r.batch_execution_date));
    });
    if (data.length < PAGE_SIZE) break;
  }
  return Array.from(weeks).sort((a, b) => b.localeCompare(a));
}

export async function fetchTrendShimByWeek(
  supabase: any,
  week: string
): Promise<TrendShimRow[]> {
  const dayStart = `${week}T00:00:00.000Z`;
  const dayEnd = `${week}T23:59:59.999Z`;
  const issuerMap = await fetchIssuerMap(supabase);
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
