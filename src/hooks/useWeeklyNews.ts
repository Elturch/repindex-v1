import { useQuery } from "@tanstack/react-query";
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { fetchTrendShimByWeek, getAvailableWeeksV2 } from "@/lib/rixV2TrendShim";

export interface WeeklyNewsData {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  topRisers: ChangeRecord[];
  topFallers: ChangeRecord[];
  divergences: DivergenceRecord[];
  consensuses: DivergenceRecord[];
  modelStats: ModelStat[];
  sectorStats: SectorStat[];
  privateCompanies: CompanyAvg[];
  ibexTop: CompanyAvg[];
  ibexBottom: CompanyAvg[];
}

interface ChangeRecord {
  company_name: string;
  ticker: string;
  model_name: string;
  current_score: number;
  previous_score: number;
  change: number;
}

interface DivergenceRecord {
  company_name: string;
  ticker: string;
  std_dev: number;
  avg_score: number;
  models: { model: string; score: number }[];
}

interface ModelStat {
  model_name: string;
  avg_score: number;
  company_count: number;
  change_vs_previous?: number;
}

interface SectorStat {
  sector: string;
  avg_score: number;
  company_count: number;
}

interface CompanyAvg {
  company_name: string;
  ticker: string;
  avg_score: number;
}

export function useWeeklyNews() {
  return useQuery({
    queryKey: ["weekly-news-data"],
    queryFn: async (): Promise<WeeklyNewsData> => {
      // FASE 1 — Fuente única: rix_runs_v2 (vía shim).
      // Si V2 sólo tiene una semana, previousData queda vacío y los movers
      // simplemente serán [] (estado vacío controlado, NUNCA fallback a legacy).
      const availableWeeks = await getAvailableWeeksV2();
      if (availableWeeks.length === 0) throw new Error("No data available");

      const currentWeek = availableWeeks[0];
      // Buscamos la semana V2 más cercana a -7d real (no asumimos cadencia exacta)
      const previousWeek = availableWeeks[1] ?? null;

      const currentData = await fetchTrendShimByWeek(currentWeek);
      const previousData = previousWeek ? await fetchTrendShimByWeek(previousWeek) : [];

      // Build lookup for previous week
      const previousLookup = new Map<string, number>();
      (previousData || []).forEach(row => {
        previousLookup.set(`${row.ticker}_${row.model_name}`, row.rix_score);
      });

      // Calculate changes
      const changes: ChangeRecord[] = [];
      (currentData || []).forEach(row => {
        const key = `${row.ticker}_${row.model_name}`;
        const prevScore = previousLookup.get(key);
        if (prevScore !== undefined) {
          changes.push({
            company_name: row.company_name,
            ticker: row.ticker,
            model_name: row.model_name,
            current_score: row.rix_score,
            previous_score: prevScore,
            change: row.rix_score - prevScore
          });
        }
      });

      // Sort for top risers and fallers
      const sortedChanges = [...changes].sort((a, b) => b.change - a.change);
      const topRisers = sortedChanges.filter(c => c.change > 0).slice(0, 10);
      const topFallers = sortedChanges.filter(c => c.change < 0).slice(-10).reverse();

      // Calculate divergences (std dev per company)
      const companyScores = new Map<string, { scores: { model: string; score: number }[]; name: string; ticker: string }>();
      (currentData || []).forEach(row => {
        if (!companyScores.has(row.ticker)) {
          companyScores.set(row.ticker, { scores: [], name: row.company_name, ticker: row.ticker });
        }
        companyScores.get(row.ticker)!.scores.push({ model: row.model_name, score: row.rix_score });
      });

      const divergenceList: DivergenceRecord[] = [];
      companyScores.forEach((data, ticker) => {
        if (data.scores.length >= 2) {
          const scores = data.scores.map(s => s.score);
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
          const stdDev = Math.sqrt(variance);
          divergenceList.push({
            company_name: data.name,
            ticker: data.ticker,
            std_dev: stdDev,
            avg_score: avg,
            models: data.scores
          });
        }
      });

      const sortedDivergences = [...divergenceList].sort((a, b) => b.std_dev - a.std_dev);
      const divergences = sortedDivergences.slice(0, 5);
      const consensuses = sortedDivergences.slice(-5).reverse();

      // Model stats
      const modelGroups = new Map<string, number[]>();
      (currentData || []).forEach(row => {
        if (!modelGroups.has(row.model_name)) {
          modelGroups.set(row.model_name, []);
        }
        modelGroups.get(row.model_name)!.push(row.rix_score);
      });

      const previousModelGroups = new Map<string, number[]>();
      (previousData || []).forEach(row => {
        if (!previousModelGroups.has(row.model_name)) {
          previousModelGroups.set(row.model_name, []);
        }
        previousModelGroups.get(row.model_name)!.push(row.rix_score);
      });

      const modelStats: ModelStat[] = [];
      modelGroups.forEach((scores, model) => {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const prevScores = previousModelGroups.get(model);
        const prevAvg = prevScores ? prevScores.reduce((a, b) => a + b, 0) / prevScores.length : undefined;
        modelStats.push({
          model_name: model,
          avg_score: avg,
          company_count: scores.length,
          change_vs_previous: prevAvg ? avg - prevAvg : undefined
        });
      });

      // Sector stats
      const sectorGroups = new Map<string, number[]>();
      (currentData || []).forEach(row => {
        if (row.sector_category) {
          if (!sectorGroups.has(row.sector_category)) {
            sectorGroups.set(row.sector_category, []);
          }
          sectorGroups.get(row.sector_category)!.push(row.rix_score);
        }
      });

      const sectorStats: SectorStat[] = [];
      sectorGroups.forEach((scores, sector) => {
        sectorStats.push({
          sector,
          avg_score: scores.reduce((a, b) => a + b, 0) / scores.length,
          company_count: new Set((currentData || []).filter(r => r.sector_category === sector).map(r => r.ticker)).size
        });
      });
      sectorStats.sort((a, b) => b.avg_score - a.avg_score);

      // Private companies (not traded)
      const privateScores = new Map<string, { scores: number[]; name: string; ticker: string }>();
      (currentData || []).filter(row => !row.is_traded).forEach(row => {
        if (!privateScores.has(row.ticker)) {
          privateScores.set(row.ticker, { scores: [], name: row.company_name, ticker: row.ticker });
        }
        privateScores.get(row.ticker)!.scores.push(row.rix_score);
      });

      const privateCompanies: CompanyAvg[] = [];
      privateScores.forEach(data => {
        privateCompanies.push({
          company_name: data.name,
          ticker: data.ticker,
          avg_score: data.scores.reduce((a, b) => a + b, 0) / data.scores.length
        });
      });
      privateCompanies.sort((a, b) => b.avg_score - a.avg_score);

      // IBEX-35 ranking
      const ibexScores = new Map<string, { scores: number[]; name: string; ticker: string }>();
      (currentData || []).filter(row => row.ibex_family_code === 'IBEX-35').forEach(row => {
        if (!ibexScores.has(row.ticker)) {
          ibexScores.set(row.ticker, { scores: [], name: row.company_name, ticker: row.ticker });
        }
        ibexScores.get(row.ticker)!.scores.push(row.rix_score);
      });

      const ibexRanking: CompanyAvg[] = [];
      ibexScores.forEach(data => {
        ibexRanking.push({
          company_name: data.name,
          ticker: data.ticker,
          avg_score: data.scores.reduce((a, b) => a + b, 0) / data.scores.length
        });
      });
      ibexRanking.sort((a, b) => b.avg_score - a.avg_score);

      const weekDate = new Date(currentWeek);
      const weekLabel = `Semana del ${format(weekDate, "d 'de' MMMM yyyy", { locale: es })}`;

      return {
        weekLabel,
        weekStart: currentWeek,
        weekEnd: format(subDays(weekDate, -6), 'yyyy-MM-dd'),
        topRisers,
        topFallers,
        divergences,
        consensuses,
        modelStats,
        sectorStats: sectorStats.slice(0, 10),
        privateCompanies: privateCompanies.slice(0, 10),
        ibexTop: ibexRanking.slice(0, 5),
        ibexBottom: ibexRanking.slice(-5).reverse()
      };
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
