import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from 'date-fns';

// FASE 1 — Pivote total a rix_runs_v2. La rama legacy `rix_runs` (Make.com,
// 4 IAs, congelada en 2026-01-25) ha sido retirada por completo. Aceptamos
// pérdida de historia oct-2025 → ene-2026: el pipeline V2 (6 IAs) arranca
// el 2026-01-18 y es la única fuente de verdad. NUNCA volver a fusionar.
export interface UnifiedRixRun {
  id: string;
  run_id: string;
  model_name: string | null;
  target_name: string | null;
  target_type: string | null;
  ticker: string | null;
  period_from: string | null;
  period_to: string | null;
  rix_score: number | null;
  rix_score_adjusted: number | null;
  resumen: string | null;
  puntos_clave: string[] | null;

  nvm_score: number | null;
  nvm_peso: number | null;
  nvm_categoria: string | null;
  drm_score: number | null;
  drm_peso: number | null;
  drm_categoria: string | null;
  sim_score: number | null;
  sim_peso: number | null;
  sim_categoria: string | null;
  rmm_score: number | null;
  rmm_peso: number | null;
  rmm_categoria: string | null;
  cem_score: number | null;
  cem_peso: number | null;
  cem_categoria: string | null;
  gam_score: number | null;
  gam_peso: number | null;
  gam_categoria: string | null;
  dcm_score: number | null;
  dcm_peso: number | null;
  dcm_categoria: string | null;
  cxm_score: number | null;
  cxm_peso: number | null;
  cxm_categoria: string | null;
  cxm_excluded: boolean | null;

  res_gpt_bruto: string | null;
  res_perplex_bruto: string | null;
  res_gemini_bruto: string | null;
  res_deepseek_bruto: string | null;
  respuesta_bruto_grok: string | null;
  respuesta_bruto_qwen: string | null;

  explicacion: string | null;
  explicaciones_detalladas: string[] | null;

  flags: string[] | null;
  palabras: number | null;
  num_fechas: number | null;
  num_citas: number | null;
  temporal_alignment: number | null;
  citation_density: number | null;
  batch_execution_date: string;
  created_at: string;
  updated_at: string;

  // Kept for backwards compat with components that read this field; always 'lovable_v2'.
  source_pipeline: 'lovable_v2';

  repindex_root_issuers?: {
    ticker: string;
    issuer_name?: string;
    sector_category: string | null;
    ibex_family_code: string | null;
    cotiza_en_bolsa?: boolean;
  } | null;

  displayRixScore: number | null;
  isDataInvalid: boolean;
  dataInvalidReason?: string;
  batchNumber?: number;
  batchLabel?: string;
  trend?: 'up' | 'down' | 'stable';
  previousRixScore?: number;
  metricTrends?: {
    nvm?: 'up' | 'down' | 'stable';
    drm?: 'up' | 'down' | 'stable';
    sim?: 'up' | 'down' | 'stable';
    rmm?: 'up' | 'down' | 'stable';
    cem?: 'up' | 'down' | 'stable';
    gam?: 'up' | 'down' | 'stable';
    dcm?: 'up' | 'down' | 'stable';
    cxm?: 'up' | 'down' | 'stable';
  };
}

const V2_DASHBOARD_COLUMNS = `
  id, created_at, updated_at, batch_execution_date, source_pipeline,
  "01_run_id", "02_model_name", "03_target_name", "04_target_type", "05_ticker",
  "06_period_from", "07_period_to", "09_rix_score",
  "17_flags",
  "23_nvm_score", "24_nvm_peso", "25_nvm_categoria",
  "26_drm_score", "27_drm_peso", "28_drm_categoria",
  "29_sim_score", "30_sim_peso", "31_sim_categoria",
  "32_rmm_score", "33_rmm_peso", "34_rmm_categoria",
  "35_cem_score", "36_cem_peso", "37_cem_categoria",
  "38_gam_score", "39_gam_peso", "40_gam_categoria",
  "41_dcm_score", "42_dcm_peso", "43_dcm_categoria",
  "44_cxm_score", "45_cxm_peso", "46_cxm_categoria",
  "51_rix_score_adjusted", "52_cxm_excluded",
  analysis_completed_at
`.trim();

function normalizeV2Record(row: any): Omit<UnifiedRixRun, 'repindex_root_issuers' | 'batchNumber' | 'batchLabel' | 'trend' | 'previousRixScore' | 'metricTrends'> {
  const rixScore = row['09_rix_score'];
  const rixScoreAdjusted = row['51_rix_score_adjusted'];
  const cxmExcluded = row['52_cxm_excluded'];
  const rmmScore = row['32_rmm_score'];

  const isDataInvalid = rmmScore === 0 || rmmScore === null;
  const displayRixScore = cxmExcluded ? rixScoreAdjusted : rixScore;

  let flags: string[] | null = null;
  if (row['17_flags']) {
    if (Array.isArray(row['17_flags'])) flags = row['17_flags'];
    else if (typeof row['17_flags'] === 'string') flags = [row['17_flags']];
  }

  return {
    id: row.id,
    run_id: row['01_run_id'],
    model_name: row['02_model_name'],
    target_name: row['03_target_name'],
    target_type: row['04_target_type'],
    ticker: row['05_ticker'],
    period_from: row['06_period_from'],
    period_to: row['07_period_to'],
    rix_score: rixScore,
    rix_score_adjusted: rixScoreAdjusted,
    resumen: row['10_resumen'] || null,
    puntos_clave: row['11_puntos_clave'] || null,
    nvm_score: row['23_nvm_score'],
    nvm_peso: row['24_nvm_peso'],
    nvm_categoria: row['25_nvm_categoria'],
    drm_score: row['26_drm_score'],
    drm_peso: row['27_drm_peso'],
    drm_categoria: row['28_drm_categoria'],
    sim_score: row['29_sim_score'],
    sim_peso: row['30_sim_peso'],
    sim_categoria: row['31_sim_categoria'],
    rmm_score: row['32_rmm_score'],
    rmm_peso: row['33_rmm_peso'],
    rmm_categoria: row['34_rmm_categoria'],
    cem_score: row['35_cem_score'],
    cem_peso: row['36_cem_peso'],
    cem_categoria: row['37_cem_categoria'],
    gam_score: row['38_gam_score'],
    gam_peso: row['39_gam_peso'],
    gam_categoria: row['40_gam_categoria'],
    dcm_score: row['41_dcm_score'],
    dcm_peso: row['42_dcm_peso'],
    dcm_categoria: row['43_dcm_categoria'],
    cxm_score: row['44_cxm_score'],
    cxm_peso: row['45_cxm_peso'],
    cxm_categoria: row['46_cxm_categoria'],
    cxm_excluded: cxmExcluded,
    res_gpt_bruto: row['20_res_gpt_bruto'] || null,
    res_perplex_bruto: row['21_res_perplex_bruto'] || null,
    res_gemini_bruto: row['22_res_gemini_bruto'] || null,
    res_deepseek_bruto: row['23_res_deepseek_bruto'] || null,
    respuesta_bruto_grok: row.respuesta_bruto_grok || null,
    respuesta_bruto_qwen: row.respuesta_bruto_qwen || null,
    explicacion: row['22_explicacion'] || null,
    explicaciones_detalladas: row['25_explicaciones_detalladas'] || null,
    flags,
    palabras: row['12_palabras'],
    num_fechas: row['13_num_fechas'],
    num_citas: row['14_num_citas'],
    temporal_alignment: row['15_temporal_alignment'],
    citation_density: row['16_citation_density'],
    batch_execution_date: row.batch_execution_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    source_pipeline: 'lovable_v2',
    displayRixScore,
    isDataInvalid,
    dataInvalidReason: isDataInvalid ? "Sin información reciente disponible (RMM=0)" : undefined,
  };
}

async function fetchAllV2(columns: string, weeksLimit?: number) {
  const pageSize = 1000;
  let allData: any[] = [];
  let page = 0;
  let hasMore = true;

  let limitDate: Date | null = null;
  if (weeksLimit !== undefined) {
    limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - (weeksLimit * 7));
  }

  while (hasMore) {
    const start = page * pageSize;
    const end = start + pageSize - 1;

    let query = supabase
      .from('rix_runs_v2')
      .select(columns)
      .order("batch_execution_date", { ascending: false })
      .order("created_at", { ascending: false })
      .or('analysis_completed_at.not.is.null,09_rix_score.not.is.null');

    if (limitDate) query = query.gte("batch_execution_date", limitDate.toISOString());

    const { data, error } = await query.range(start, end);

    if (error) {
      console.error(`Error fetching from rix_runs_v2:`, error);
      throw error;
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      hasMore = data.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allData;
}

interface UseUnifiedRixRunsOptions {
  modelFilter?: string;
  companyFilter?: string;
  sectorFilter?: string;
  ibexFamilyFilter?: string;
  weeksToLoad?: number;
}

export function useUnifiedRixRuns(options: UseUnifiedRixRunsOptions = {}) {
  const {
    modelFilter = 'all',
    companyFilter = 'all',
    sectorFilter = 'all',
    ibexFamilyFilter = 'all',
    weeksToLoad = 6
  } = options;

  return useQuery({
    queryKey: ['unified-rix-runs-v2only', modelFilter, companyFilter, sectorFilter, ibexFamilyFilter, weeksToLoad],
    queryFn: async (): Promise<UnifiedRixRun[]> => {
      const v2Data = await fetchAllV2(V2_DASHBOARD_COLUMNS, weeksToLoad);

      console.log(`📦 V2-only fetch: ${v2Data.length} from rix_runs_v2`);

      const { data: repindexData } = await supabase
        .from("repindex_root_issuers")
        .select("ticker, issuer_name, ibex_family_code, sector_category, cotiza_en_bolsa");

      const repindexMap = new Map(
        (repindexData || []).map(item => [item.ticker, item])
      );

      const allRecords = v2Data.map(normalizeV2Record).map(record => ({
        ...record,
        repindex_root_issuers: record.ticker ? repindexMap.get(record.ticker) || null : null,
      }));

      // Build batch map for batch labels and trend calculation
      const batchMap = new Map<string, { number: number; executionDate: Date }>();
      const executionDates = new Set<string>();

      allRecords.forEach(run => {
        if (run.batch_execution_date) {
          const batchDate = new Date(run.batch_execution_date);
          executionDates.add(format(batchDate, 'yyyy-MM-dd'));
        }
      });

      let batchCounter = 1;
      const sortedDateKeys = Array.from(executionDates).sort((a, b) => a.localeCompare(b));
      sortedDateKeys.forEach(dateKey => {
        const [year, month, day] = dateKey.split('-').map(Number);
        const executionDate = new Date(Date.UTC(year, month - 1, day));
        batchMap.set(dateKey, { number: batchCounter++, executionDate });
      });

      const sortedBatches = Array.from(batchMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

      const batchTickerModelMaps = new Map<string, Map<string, typeof allRecords[0]>>();
      sortedBatches.forEach(([batchKey]) => {
        const batchRecords = allRecords.filter(r => {
          if (!r.batch_execution_date) return false;
          return format(new Date(r.batch_execution_date), 'yyyy-MM-dd') === batchKey;
        });
        const m = new Map<string, typeof allRecords[0]>();
        batchRecords.forEach(run => {
          if (!run.ticker || !run.model_name) return;
          const key = `${run.ticker}_${run.model_name}`;
          const existing = m.get(key);
          if (!existing || new Date(run.created_at) > new Date(existing.created_at)) {
            m.set(key, run);
          }
        });
        batchTickerModelMaps.set(batchKey, m);
      });

      // Deduplicate: most recent record per ticker/model/batch
      const batchRecordsMap = new Map<string, typeof allRecords[0]>();
      allRecords.forEach(run => {
        if (!run.ticker || !run.model_name || !run.batch_execution_date) return;
        const executionKey = format(new Date(run.batch_execution_date), 'yyyy-MM-dd');
        const mapKey = `${run.ticker}_${run.model_name}_${executionKey}`;
        const existing = batchRecordsMap.get(mapKey);
        if (!existing || new Date(run.created_at) > new Date(existing.created_at)) {
          batchRecordsMap.set(mapKey, run);
        }
      });

      const processedRecords: UnifiedRixRun[] = Array.from(batchRecordsMap.values()).map(record => {
        let executionKey: string | undefined;
        let batchNum: number | undefined;
        let batchLabel: string | undefined;

        if (record.batch_execution_date) {
          const batchDate = new Date(record.batch_execution_date);
          executionKey = format(batchDate, 'yyyy-MM-dd');
          const batch = batchMap.get(executionKey);
          batchNum = batch?.number;
          batchLabel = batch ? `Semana del ${format(batch.executionDate, 'd MMM yyyy')}` : undefined;
        }

        let trend: 'up' | 'down' | 'stable' | undefined;
        let previousRixScore: number | undefined;
        let previousRunForTrends: typeof allRecords[0] | undefined;

        if (record.ticker && record.model_name && executionKey && record.rix_score !== null) {
          const currentBatchIndex = sortedBatches.findIndex(([key]) => key === executionKey);
          const tickerModelKey = `${record.ticker}_${record.model_name}`;

          if (currentBatchIndex > 0) {
            for (let i = currentBatchIndex - 1; i >= 0; i--) {
              const previousBatchKey = sortedBatches[i][0];
              const prevRun = batchTickerModelMaps.get(previousBatchKey)?.get(tickerModelKey);
              if (prevRun) {
                previousRunForTrends = prevRun;
                previousRixScore = prevRun.rix_score ?? undefined;
                break;
              }
            }
            if (previousRixScore !== undefined && record.rix_score !== null) {
              const delta = record.rix_score - previousRixScore;
              trend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable';
            }
          }
        }

        const metricTrends: UnifiedRixRun['metricTrends'] = {};
        if (previousRunForTrends) {
          const m = [
            { key: 'nvm' as const, c: record.nvm_score, p: previousRunForTrends.nvm_score },
            { key: 'drm' as const, c: record.drm_score, p: previousRunForTrends.drm_score },
            { key: 'sim' as const, c: record.sim_score, p: previousRunForTrends.sim_score },
            { key: 'rmm' as const, c: record.rmm_score, p: previousRunForTrends.rmm_score },
            { key: 'cem' as const, c: record.cem_score, p: previousRunForTrends.cem_score },
            { key: 'gam' as const, c: record.gam_score, p: previousRunForTrends.gam_score },
            { key: 'dcm' as const, c: record.dcm_score, p: previousRunForTrends.dcm_score },
            { key: 'cxm' as const, c: record.cxm_score, p: previousRunForTrends.cxm_score },
          ];
          m.forEach(({ key, c, p }) => {
            if (c !== null && p !== null) {
              const delta = c - p;
              metricTrends[key] = delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable';
            }
          });
        }

        return { ...record, batchNumber: batchNum, batchLabel, trend, previousRixScore, metricTrends };
      });

      let filteredData = processedRecords;
      if (modelFilter && modelFilter !== 'all') {
        filteredData = filteredData.filter(run => {
          const modelName = run.model_name?.toLowerCase() || '';
          return modelName.includes(modelFilter.toLowerCase());
        });
      }
      if (companyFilter && companyFilter !== 'all') {
        filteredData = filteredData.filter(run => run.target_name === companyFilter);
      }
      if (sectorFilter && sectorFilter !== 'all') {
        filteredData = filteredData.filter(run => run.repindex_root_issuers?.sector_category === sectorFilter);
      }
      if (ibexFamilyFilter && ibexFamilyFilter !== 'all') {
        if (ibexFamilyFilter === 'no_cotizadas') {
          filteredData = filteredData.filter(run => run.repindex_root_issuers?.cotiza_en_bolsa === false);
        } else {
          filteredData = filteredData.filter(run => run.repindex_root_issuers?.ibex_family_code === ibexFamilyFilter);
        }
      }

      console.log(`📊 V2-only results: ${filteredData.length} records after filters`);
      return filteredData;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useUnifiedRixRun(id: string | undefined) {
  const isValidUUID = id ? UUID_REGEX.test(id) : false;

  return useQuery({
    queryKey: ['unified-rix-run-v2only', id],
    queryFn: async (): Promise<UnifiedRixRun | null> => {
      if (!id || !isValidUUID) return null;

      const { data, error } = await supabase
        .from('rix_runs_v2')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const normalized = normalizeV2Record(data);

      let issuer = null;
      if (normalized.ticker) {
        const { data: issuerData } = await supabase
          .from('repindex_root_issuers')
          .select('ticker, issuer_name, sector_category, ibex_family_code, cotiza_en_bolsa')
          .eq('ticker', normalized.ticker)
          .maybeSingle();
        issuer = issuerData;
      }

      let batchNumber: number | undefined;
      let batchLabel: string | undefined;
      if (normalized.batch_execution_date) {
        const batchDate = new Date(normalized.batch_execution_date);
        const executionKey = format(batchDate, 'yyyy-MM-dd');

        const { data: v2Runs } = await supabase
          .from('rix_runs_v2')
          .select('batch_execution_date');

        const allDates = new Set<string>();
        (v2Runs || []).forEach(run => {
          if (run.batch_execution_date) {
            allDates.add(format(new Date(run.batch_execution_date), 'yyyy-MM-dd'));
          }
        });

        const sortedDates = Array.from(allDates).sort((a, b) => b.localeCompare(a));
        batchNumber = sortedDates.indexOf(executionKey) + 1;

        const [year, month, day] = executionKey.split('-').map(Number);
        const executionDate = new Date(Date.UTC(year, month - 1, day));
        batchLabel = `Semana del ${format(executionDate, 'd MMM yyyy')}`;
      }

      return { ...normalized, repindex_root_issuers: issuer, batchNumber, batchLabel };
    },
    enabled: isValidUUID,
  });
}
