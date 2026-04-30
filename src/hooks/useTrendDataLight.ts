import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from 'date-fns';

// FASE 1 — V2-only. Reads directly from `rix_runs_v2` (Sunday-anchored).
// Legacy `rix_trends` has been retired. Stock price comes from the
// `48_precio_accion` raw column (string) on the V2 row.

export interface TrendDataPoint {
  batchDate: string;
  batchLabel: string;
  market: number;
  numCompanies: number;
  [key: string]: string | number;
}

interface TrendDataParams {
  tickers?: string[];
  ibexFamily?: string;
  sector?: string;
  numWeeks?: number;
  modelFilter?: string;
}

function parsePrice(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!/^[0-9]+\.?[0-9]*$/.test(s)) return null;
  let v = parseFloat(s);
  if (!isFinite(v)) return null;
  // Mirror the DB normalize_stock_price_v2 heuristic for display purposes.
  if (v >= 100000) v = v / 100000;
  else if (v >= 10000) v = v / 1000;
  else if (v >= 1000) v = v / 100;
  return v;
}

export function useTrendDataLight({
  tickers = [],
  ibexFamily,
  sector,
  numWeeks = 6,
  modelFilter = "ChatGPT"
}: TrendDataParams) {
  return useQuery({
    queryKey: ["trend-data-light-v2only", tickers, ibexFamily, sector, numWeeks, modelFilter],
    queryFn: async () => {
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() - (numWeeks * 7));
      const limitISO = limitDate.toISOString();

      // 1. Pull repindex master to filter by IBEX / sector and to expose is_traded
      const { data: issuersData } = await supabase
        .from("repindex_root_issuers")
        .select("ticker, issuer_name, ibex_family_code, sector_category, cotiza_en_bolsa");
      const issuersMap = new Map<string, { name: string; isTraded: boolean; ibexCode: string | null; sector: string | null }>();
      (issuersData || []).forEach(i => {
        issuersMap.set(i.ticker, {
          name: i.issuer_name ?? i.ticker,
          isTraded: !!i.cotiza_en_bolsa,
          ibexCode: i.ibex_family_code ?? null,
          sector: i.sector_category ?? null,
        });
      });

      // 2. Build paginated query against rix_runs_v2
      const allRows: any[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        let q = supabase
          .from("rix_runs_v2")
          .select(`"05_ticker","02_model_name","09_rix_score","48_precio_accion",batch_execution_date`)
          .eq("02_model_name", modelFilter)
          .gte("batch_execution_date", limitISO)
          .or('analysis_completed_at.not.is.null,09_rix_score.not.is.null')
          .order("batch_execution_date", { ascending: false })
          .range(from, from + PAGE - 1);

        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      if (allRows.length === 0) return [];

      // 3. Apply IBEX / sector filters via the issuers map
      const filtered = allRows.filter((r: any) => {
        const meta = issuersMap.get(r["05_ticker"]);
        if (!meta) return false;
        if (ibexFamily && ibexFamily !== "all" && meta.ibexCode !== ibexFamily) return false;
        if (sector && sector !== "all" && meta.sector !== sector) return false;
        return true;
      });

      // 4. Group by batch
      const batchGroups = new Map<string, {
        scores: number[];
        companies: Map<string, { rix: number; price: number | null; name: string; isTraded: boolean }>;
      }>();

      filtered.forEach((row: any) => {
        const ticker: string = row["05_ticker"];
        const score: number | null = row["09_rix_score"];
        if (score === null || score === undefined) return;
        const meta = issuersMap.get(ticker);
        if (!meta) return;

        const batchKey = format(new Date(row.batch_execution_date), 'yyyy-MM-dd');
        let g = batchGroups.get(batchKey);
        if (!g) {
          g = { scores: [], companies: new Map() };
          batchGroups.set(batchKey, g);
        }
        g.scores.push(score);

        if (tickers.includes(ticker) && !g.companies.has(ticker)) {
          g.companies.set(ticker, {
            rix: score,
            price: parsePrice(row["48_precio_accion"]),
            name: meta.name,
            isTraded: meta.isTraded,
          });
        }
      });

      const chartData: TrendDataPoint[] = Array.from(batchGroups.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([batchKey, group]) => {
          const batchDate = new Date(batchKey);
          const dataPoint: TrendDataPoint = {
            batchDate: batchKey,
            batchLabel: format(batchDate, 'dd MMM'),
            market: Math.round(group.scores.reduce((s, x) => s + x, 0) / group.scores.length),
            numCompanies: group.scores.length,
          };
          group.companies.forEach((cd, ticker) => {
            dataPoint[ticker] = cd.rix;
            dataPoint[`${ticker}_price`] = cd.price ?? 0;
            dataPoint[`${ticker}_name`] = cd.name;
            dataPoint[`${ticker}_isTraded`] = cd.isTraded ? 1 : 0;
          });
          return dataPoint;
        });

      return chartData;
    },
    enabled: true,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
