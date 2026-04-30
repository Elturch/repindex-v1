import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const MAX_RAW_RESPONSE_LENGTH = 8000;
const BATCH_SIZE = 20; // Documents per execution (reduced to avoid WORKER_LIMIT)
const MAX_EXECUTION_TIME = 30000; // 30 seconds (conservative margin)
const NEWS_BATCH_SIZE = 15; // News articles per execution (reduced to avoid WORKER_LIMIT)

// New models added in the 6 IA system (January 2026)
const NEW_MODELS = ['Grok', 'Qwen'];

// Source filter type
type SourceFilter = 'all' | 'rix_v1' | 'rix_v2' | 'news';

// Helper: Check if a date is recent (within N days)
function isRecentDate(dateStr: string | null, daysThreshold: number = 90): boolean {
  if (!dateStr) return false;
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= daysThreshold;
  } catch {
    return false;
  }
}

// Background processing function - INCREMENTAL ONLY (never deletes)
async function processVectorStore(includeRawResponses: boolean, sourceFilter: SourceFilter = 'all') {
  const startTime = Date.now();
  console.log(`Starting incremental vector store population (sourceFilter: ${sourceFilter})...`);
  
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    console.error('OPENAI_API_KEY not configured');
    return { success: false, error: 'OPENAI_API_KEY not configured' };
  }

  try {
    // Server-side counts (fast) + per-item existence checks (avoids loading 10k+ rows)
    console.log('Counting existing documents (server-side)...');

    // --------------------------------------------------------------------------
    // PERF: bulk existence checks.
    // Previous version performed 1 query per candidate row (very slow with 10k+).
    // This version checks existence in 1 query per scan page.
    // --------------------------------------------------------------------------
    const getIndexedRixRunIds = async (runIds: string[]): Promise<Set<string>> => {
      const ids = Array.from(new Set(runIds.filter(Boolean)));
      if (ids.length === 0) return new Set();

      const out = new Set<string>();

      // Process in small batches of 100 with .limit() to prevent
      // PostgREST silent truncation (1000-row default limit).
      // Post-cleanup there should be max 1 doc per rix_run_id,
      // but the .limit() makes this immune to any future duplicates.
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        const { data, error } = await supabaseClient
          .from('documents')
          .select('metadata->>rix_run_id')
          .in('metadata->>rix_run_id', batch)
          .limit(10000);

        if (error) {
          console.error(`Error bulk-checking existing RIX docs (batch ${i}):`, error);
          continue;
        }

        for (const row of (data || []) as any[]) {
          const id = row?.rix_run_id;
          if (id) out.add(id);
        }
      }
      return out;
    };

    const getIndexedNewsUrls = async (urls: string[]): Promise<Set<string>> => {
      const u = Array.from(new Set(urls.filter(Boolean)));
      if (u.length === 0) return new Set();

      const out = new Set<string>();

      // Same batching strategy as getIndexedRixRunIds to avoid PostgREST truncation
      for (let i = 0; i < u.length; i += 100) {
        const batch = u.slice(i, i + 100);
        const { data, error } = await supabaseClient
          .from('documents')
          .select('metadata->>article_url')
          .eq('metadata->>type', 'corporate_news')
          .in('metadata->>article_url', batch)
          .limit(10000);

        if (error) {
          console.error(`Error bulk-checking existing corporate news docs (batch ${i}):`, error);
          continue;
        }

        for (const row of (data || []) as any[]) {
          const url = row?.article_url;
          if (url) out.add(url);
        }
      }
      return out;
    };

    const [totalRixDocsResult, rixV2DocsResult] = await Promise.all([
      supabaseClient
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .not('metadata->>rix_run_id', 'is', null),
      supabaseClient
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('metadata->>source_table', 'rix_runs_v2'),
    ]);

    const totalRixDocs = totalRixDocsResult.count || 0;
    const rixV2IndexedInitial = rixV2DocsResult.count || 0;
    const rixV1IndexedInitial = Math.max(0, totalRixDocs - rixV2IndexedInitial);

    // ==========================================================================
    // FETCH FROM TABLES BASED ON sourceFilter
    // IMPORTANT: Never load all pending records into memory. Build only the batch
    // to process (BATCH_SIZE) to avoid WORKER_LIMIT.
    // ==========================================================================
    const rixBatchToProcess: any[] = [];
    let totalRuns = 0;
    let v1Total = 0;
    let v2Total = 0;
    let pendingFoundV1 = 0;
    let pendingFoundV2 = 0;

    let v1PendingEstimate = 0;
    let v2PendingEstimate = 0;

    // FASE 1 — rix_runs DEPRECATED. Bloque V1 desactivado por completo.
    // Mantenemos contadores a 0 para no romper la respuesta del endpoint.
    if (false && (sourceFilter === 'all' || sourceFilter === 'rix_v1')) {
      console.log('Scanning rix_runs (V1) for pending docs...');

      const { count: v1Count } = await supabaseClient
        .from('rix_runs')
        .select('id', { count: 'exact', head: true })
        .not('10_resumen', 'is', null);

      v1Total = v1Count || 0;
      totalRuns += v1Total;
      console.log(`V1 total records: ${v1Total}, indexed: ${rixV1IndexedInitial}`);

      v1PendingEstimate = Math.max(0, v1Total - rixV1IndexedInitial);
      // ALWAYS scan at least one page even if estimate is 0.
      // The estimate can be wrong when indexed > source (e.g. deleted/modified source records).
      const v1ForceOneScan = v1PendingEstimate === 0;
      if (v1ForceOneScan) {
        v1PendingEstimate = 1; // Force entry into the scan loop for at least one page
        console.log('V1 pending estimate is 0 — will scan one page to verify.');
      }

      let v1Offset = 0;
      const v1BatchSize = 200;
      let v1Scanned = 0;

      while (v1PendingEstimate > 0 && rixBatchToProcess.length < BATCH_SIZE) {
        const { data: rixBatch, error: rixError } = await supabaseClient
          .from('rix_runs')
          .select('*')
          .not('10_resumen', 'is', null)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(v1Offset, v1Offset + v1BatchSize - 1);

        if (rixError) {
          console.error('Error fetching rix_runs:', rixError);
          throw rixError;
        }

        if (!rixBatch || rixBatch.length === 0) break;

        v1Scanned += rixBatch.length;

        const indexedIds = await getIndexedRixRunIds(rixBatch.map((r: any) => r.id));

        for (const r of rixBatch) {
          if (!indexedIds.has(r.id)) {
            pendingFoundV1++;
            if (rixBatchToProcess.length < BATCH_SIZE) {
              rixBatchToProcess.push({ ...r, _source_table: 'rix_runs' });
            }
          }
          if (rixBatchToProcess.length >= BATCH_SIZE) break;
        }

        if (rixBatch.length < v1BatchSize) break;
        v1Offset += v1BatchSize;
      }
      // If we forced a scan and found nothing, reset estimate to 0
      if (v1ForceOneScan && pendingFoundV1 === 0) {
        v1PendingEstimate = 0;
      }
      console.log(`V1: scanned ${v1Scanned}, pending found ${pendingFoundV1}, batch size now ${rixBatchToProcess.length}`);
    }

    // Fetch from rix_runs_v2 (V2)
    if (sourceFilter === 'all' || sourceFilter === 'rix_v2') {
      console.log('Scanning rix_runs_v2 (V2) for pending docs...');

      const { count: v2Count } = await supabaseClient
        .from('rix_runs_v2')
        .select('id', { count: 'exact', head: true })
        .not('10_resumen', 'is', null);

      v2Total = v2Count || 0;
      totalRuns += v2Total;
      console.log(`V2 total records: ${v2Total}, indexed: ${rixV2IndexedInitial}`);

      v2PendingEstimate = Math.max(0, v2Total - rixV2IndexedInitial);
      // ALWAYS scan at least one page even if estimate is 0.
      const v2ForceOneScan = v2PendingEstimate === 0;
      if (v2ForceOneScan) {
        v2PendingEstimate = 1; // Force entry into the scan loop for at least one page
        console.log('V2 pending estimate is 0 — will scan one page to verify.');
      }

      let v2Offset = 0;
      const v2BatchSize = 200;
      let v2Scanned = 0;

      while (v2PendingEstimate > 0 && rixBatchToProcess.length < BATCH_SIZE) {
        const { data: v2Batch, error: v2Error } = await supabaseClient
          .from('rix_runs_v2')
          .select('*')
          .not('10_resumen', 'is', null)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(v2Offset, v2Offset + v2BatchSize - 1);

        if (v2Error) {
          console.error('Error fetching rix_runs_v2:', v2Error);
          throw v2Error;
        }

        if (!v2Batch || v2Batch.length === 0) break;

        v2Scanned += v2Batch.length;

        const indexedIds = await getIndexedRixRunIds(v2Batch.map((r: any) => r.id));

        for (const r of v2Batch) {
          if (!indexedIds.has(r.id)) {
            pendingFoundV2++;
            if (rixBatchToProcess.length < BATCH_SIZE) {
              rixBatchToProcess.push({ ...r, _source_table: 'rix_runs_v2' });
            }
          }
          if (rixBatchToProcess.length >= BATCH_SIZE) break;
        }

        if (v2Batch.length < v2BatchSize) break;
        v2Offset += v2BatchSize;
      }
      // If we forced a scan and found nothing, reset estimate to 0
      if (v2ForceOneScan && pendingFoundV2 === 0) {
        v2PendingEstimate = 0;
      }
      console.log(`V2: scanned ${v2Scanned}, pending found ${pendingFoundV2}, batch size now ${rixBatchToProcess.length}`);
    }

    const rixPendingTotalEstimate = v1PendingEstimate + v2PendingEstimate;

    console.log(
      `Total DB records: ~${totalRuns}, RIX docs indexed: ${totalRixDocs} (V1: ${rixV1IndexedInitial}, V2: ${rixV2IndexedInitial}), Pending estimate: ${rixPendingTotalEstimate}, Batch to process: ${rixBatchToProcess.length}`
    );

    // Get issuers data with websites
    const { data: issuers } = await supabaseClient
      .from('repindex_root_issuers')
      .select('ticker, issuer_name, sector_category, ibex_family_code, website');

    const issuersMap = new Map(
      issuers?.map(issuer => [issuer.ticker, issuer]) || []
    );

    // Get latest corporate snapshots for each ticker
    const { data: corporateSnapshots } = await supabaseClient
      .from('corporate_snapshots')
      .select('ticker, snapshot_date, snapshot_date_only, president_name, ceo_name, chairman_name, headquarters_city, headquarters_country, employees_approx, founded_year, mission_statement, company_description')
      .eq('scrape_status', 'success')
      .order('snapshot_date', { ascending: false });

    // Create map of latest snapshot per ticker
    const snapshotsMap = new Map<string, any>();
    if (corporateSnapshots) {
      for (const snapshot of corporateSnapshots) {
        if (!snapshotsMap.has(snapshot.ticker)) {
          snapshotsMap.set(snapshot.ticker, snapshot);
        }
      }
    }
    console.log(`Loaded ${snapshotsMap.size} corporate snapshots for context enrichment`);

    let documentsCreated = 0;
    let documentsErrored = 0;
    let v1DocsCreated = 0;
    let v2DocsCreated = 0;

    // Process RIX batch with time limit (skip if filtering to news only)
    if (sourceFilter !== 'news' && rixBatchToProcess.length > 0) {
      for (const run of rixBatchToProcess) {
        // Check time limit
        if (Date.now() - startTime > MAX_EXECUTION_TIME) {
          console.log(`Time limit reached after ${documentsCreated} documents`);
          break;
        }

        try {
          const issuerData = issuersMap.get(run["05_ticker"]);
          const isV2 = run._source_table === 'rix_runs_v2';
          const modelName = run["02_model_name"] || "N/A";
          const isNewModel = NEW_MODELS.includes(modelName);

          // Build RICH content with 7 IA system header for V2 records
          let content = '';
          
          // Add system header for V2 records (the "snapshot")
          if (isV2) {
            content += `[SISTEMA REPINDEX 2.0 - 6 MODELOS DE IA]\n`;
            content += `Este análisis utiliza el nuevo sistema avanzado RepIndex 2.0 con 6 modelos de IA:\n`;
            content += `ChatGPT, Perplexity, Gemini, Deepseek, Grok y Qwen.\n`;
            content += `Lanzamiento: Enero 2026\n\n`;
          }
          
          content += `Empresa: ${run["03_target_name"] || "N/A"}\n`;
          content += `Ticker: ${run["05_ticker"] || "N/A"}\n`;
          content += `Modelo IA: ${modelName}\n`;
          content += `Período: ${run["06_period_from"]} - ${run["07_period_to"]}\n`;
          content += `RIX Score: ${run["09_rix_score"] || "N/A"}\n`;
          
          if (issuerData) {
            content += `Sector: ${issuerData.sector_category || "N/A"}\n`;
            content += `Familia IBEX: ${issuerData.ibex_family_code || "N/A"}\n`;
            if (issuerData.website) {
              content += `Web corporativa: ${issuerData.website}\n`;
            }
          }

          // Add corporate snapshot data if available
          const ticker = run["05_ticker"];
          const corpSnapshot = ticker ? snapshotsMap.get(ticker) : null;
          if (corpSnapshot) {
            content += `\n[DATOS CORPORATIVOS VERIFICADOS - Actualizado: ${corpSnapshot.snapshot_date_only}]\n`;
            if (corpSnapshot.president_name) {
              content += `Presidente: ${corpSnapshot.president_name}\n`;
            }
            if (corpSnapshot.ceo_name) {
              content += `CEO: ${corpSnapshot.ceo_name}\n`;
            }
            if (corpSnapshot.chairman_name) {
              content += `Presidente del Consejo: ${corpSnapshot.chairman_name}\n`;
            }
            if (corpSnapshot.headquarters_city || corpSnapshot.headquarters_country) {
              content += `Sede: ${corpSnapshot.headquarters_city || ''}, ${corpSnapshot.headquarters_country || ''}\n`;
            }
            if (corpSnapshot.employees_approx) {
              content += `Empleados (aprox.): ${corpSnapshot.employees_approx.toLocaleString()}\n`;
            }
            if (corpSnapshot.founded_year) {
              content += `Fundación: ${corpSnapshot.founded_year}\n`;
            }
            if (corpSnapshot.mission_statement) {
              content += `Misión: ${corpSnapshot.mission_statement}\n`;
            }
            if (corpSnapshot.company_description) {
              content += `Descripción: ${corpSnapshot.company_description}\n`;
            }
            content += `\n`;
          }
          content += `\n`;
          
          if (run["10_resumen"]) {
            content += `RESUMEN EJECUTIVO:\n${run["10_resumen"]}\n\n`;
          }
          
          // Key points
          if (run["11_puntos_clave"]) {
            try {
              let puntosClave: string[] = [];
              if (typeof run["11_puntos_clave"] === 'string') {
                try {
                  puntosClave = JSON.parse(run["11_puntos_clave"]);
                } catch {
                  const text = run["11_puntos_clave"];
                  puntosClave = text.includes(',') 
                    ? text.split(',').map((s: string) => s.trim()).filter(Boolean)
                    : text.includes('\n')
                      ? text.split('\n').map((s: string) => s.trim()).filter(Boolean)
                      : [text];
                }
              } else if (Array.isArray(run["11_puntos_clave"])) {
                puntosClave = run["11_puntos_clave"];
              }
              
              if (puntosClave.length > 0) {
                content += `PUNTOS CLAVE:\n`;
                puntosClave.forEach((punto: string, idx: number) => {
                  content += `${idx + 1}. ${punto}\n`;
                });
                content += `\n`;
              }
            } catch (e) {
              console.error('Error processing puntos_clave:', e);
            }
          }

          if (run["22_explicacion"]) {
            content += `EXPLICACIÓN DEL ANÁLISIS:\n${run["22_explicacion"]}\n\n`;
          }

          // Raw AI responses (all 7 models)
          if (includeRawResponses) {
            // Original 4 models
            if (run["20_res_gpt_bruto"]) {
              content += `RESPUESTA COMPLETA CHATGPT:\n${run["20_res_gpt_bruto"].slice(0, MAX_RAW_RESPONSE_LENGTH)}\n\n`;
            }
            if (run["21_res_perplex_bruto"]) {
              content += `RESPUESTA COMPLETA PERPLEXITY:\n${run["21_res_perplex_bruto"].slice(0, MAX_RAW_RESPONSE_LENGTH)}\n\n`;
            }
            if (run["22_res_gemini_bruto"]) {
              content += `RESPUESTA COMPLETA GEMINI:\n${run["22_res_gemini_bruto"].slice(0, MAX_RAW_RESPONSE_LENGTH)}\n\n`;
            }
            if (run["23_res_deepseek_bruto"]) {
              content += `RESPUESTA COMPLETA DEEPSEEK:\n${run["23_res_deepseek_bruto"].slice(0, MAX_RAW_RESPONSE_LENGTH)}\n\n`;
            }
            
            // New 2 models (V2 system - 6 IAs)
            if (run["respuesta_bruto_grok"]) {
              content += `RESPUESTA COMPLETA GROK:\n${run["respuesta_bruto_grok"].slice(0, MAX_RAW_RESPONSE_LENGTH)}\n\n`;
            }
            if (run["respuesta_bruto_qwen"]) {
              content += `RESPUESTA COMPLETA QWEN:\n${run["respuesta_bruto_qwen"].slice(0, MAX_RAW_RESPONSE_LENGTH)}\n\n`;
            }
          }

          // Detailed explanations
          if (run["25_explicaciones_detalladas"]) {
            try {
              const explicaciones = typeof run["25_explicaciones_detalladas"] === 'string'
                ? JSON.parse(run["25_explicaciones_detalladas"])
                : run["25_explicaciones_detalladas"];
              
              if (explicaciones && typeof explicaciones === 'object') {
                content += `EXPLICACIONES POR MÉTRICA:\n`;
                for (const [metric, explanation] of Object.entries(explicaciones)) {
                  if (explanation) {
                    content += `- ${metric}: ${explanation}\n`;
                  }
                }
                content += `\n`;
              }
            } catch (e) {
              console.error('Error processing explicaciones_detalladas:', e);
            }
          }

          // Generate embedding
          const contentForEmbedding = content.slice(0, 32000);
          const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openAIApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              input: contentForEmbedding,
            }),
          });

          if (!embeddingResponse.ok) {
            const errorText = await embeddingResponse.text();
            console.error(`Failed embedding for run ${run.id}:`, errorText);
            documentsErrored++;
            continue;
          }

          const embeddingData = await embeddingResponse.json();
          const embedding = embeddingData.data[0].embedding;

          // Enhanced Metadata with 7 IA system info
          const metadata = {
            rix_run_id: run.id,
            company_name: run["03_target_name"],
            ticker: run["05_ticker"],
            ai_model: modelName,
            week_start: run["06_period_from"],
            week_end: run["07_period_to"],
            rix_score: run["09_rix_score"],
            sector_category: issuerData?.sector_category,
            ibex_family_code: issuerData?.ibex_family_code,
            has_raw_responses: includeRawResponses,
            content_length: content.length,
            
            // Source metadata
            source_table: run._source_table,
            source_pipeline: run.source_pipeline || (isV2 ? 'lovable_v2' : 'make_original'),
            is_7ia_system: isV2,
            is_new_model: isNewModel,
            system_version: isV2 ? '2.0-7ias' : '1.0-4ias',
            
            scores: {
              nvm: run["23_nvm_score"],
              drm: run["26_drm_score"],
              sim: run["29_sim_score"],
              rmm: run["32_rmm_score"],
              cem: run["35_cem_score"],
              gam: run["38_gam_score"],
              dcm: run["41_dcm_score"],
              cxm: run["44_cxm_score"],
            },
            categories: {
              nvm: run["25_nvm_categoria"],
              drm: run["28_drm_categoria"],
              sim: run["31_sim_categoria"],
              rmm: run["34_rmm_categoria"],
              cem: run["37_cem_categoria"],
              gam: run["40_gam_categoria"],
              dcm: run["43_dcm_categoria"],
              cxm: run["46_cxm_categoria"],
            },
            flags: run["17_flags"] || [],
            citation_density: run["16_citation_density"],
            temporal_alignment: run["15_temporal_alignment"],
          };

          // Insert document
          const { error: insertError } = await supabaseClient
            .from('documents')
            .insert({ content, metadata, embedding });

          if (insertError) {
            console.error(`Error inserting doc ${run.id}:`, insertError);
            documentsErrored++;
          } else {
            documentsCreated++;
            if (isV2) {
              v2DocsCreated++;
            } else {
              v1DocsCreated++;
            }
          }

          // Progress log
          if (documentsCreated % 20 === 0) {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.log(`Progress: ${documentsCreated} created (V1: ${v1DocsCreated}, V2: ${v2DocsCreated}), ${documentsErrored} errors, ${elapsed}s elapsed`);
          }

          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (docError) {
          console.error(`Error processing run ${run.id}:`, docError);
          documentsErrored++;
        }
      }
    }

    // ==========================================================================
    // STEP 2: INDEX CORPORATE NEWS (skip if filtering to rix only)
    // ==========================================================================
    let newsDocsCreated = 0;
    let newsDocsErrored = 0;
    let newsRemaining = 0;
    let newsTotalCount = 0;
    
    if (sourceFilter === 'all' || sourceFilter === 'news') {
      console.log('Starting corporate_news indexation...');

      // Fetch corporate news paginated but only build pending batch to process
      const newsBatchToProcess: any[] = [];
      let pendingNewsFound = 0;
      let newsOffset = 0;
      const newsScanBatchSize = 200;

      while (newsBatchToProcess.length < NEWS_BATCH_SIZE) {
        const { data: newsData, error: newsError } = await supabaseClient
          .from('corporate_news')
          .select('*')
          .order('published_date', { ascending: false })
          .range(newsOffset, newsOffset + newsScanBatchSize - 1);

        if (newsError) {
          console.error('Error fetching corporate_news:', newsError);
          throw newsError;
        }

        if (!newsData || newsData.length === 0) break;
        newsTotalCount += newsData.length;

        const indexedUrls = await getIndexedNewsUrls(newsData.map((n: any) => n.article_url));

        for (const n of newsData) {
          if (!indexedUrls.has(n.article_url)) {
            pendingNewsFound++;
            if (newsBatchToProcess.length < NEWS_BATCH_SIZE) {
              newsBatchToProcess.push(n);
            }
          }
          if (newsBatchToProcess.length >= NEWS_BATCH_SIZE) break;
        }

        if (newsData.length < newsScanBatchSize) break;
        newsOffset += newsScanBatchSize;
      }

      console.log(`Corporate news scanned: ${newsTotalCount}, pending found: ${pendingNewsFound}, batch: ${newsBatchToProcess.length}`);

      for (const news of newsBatchToProcess) {
        // Check time limit
        if (Date.now() - startTime > MAX_EXECUTION_TIME) {
          console.log(`Time limit reached during news indexation`);
          break;
        }
        
        try {
          const issuerData = issuersMap.get(news.ticker);
          const isRecent = isRecentDate(news.published_date, 90);
          const publishedDateStr = news.published_date || 'Fecha desconocida';
          
          // Build content with EXPLICIT temporal context
          let newsContent = `[NOTICIA CORPORATIVA - ${news.ticker}]\n`;
          newsContent += `Fecha de publicación: ${publishedDateStr}\n`;
          newsContent += `Fecha de captura: ${news.snapshot_date}\n`;
          
          const sourceTypeLabel = news.source_type === 'press_release' ? 'Nota de prensa oficial' 
            : news.source_type === 'investor_news' ? 'Comunicado a inversores'
            : 'Blog corporativo';
          newsContent += `Tipo de fuente: ${sourceTypeLabel}\n`;
          
          if (issuerData) {
            newsContent += `Empresa: ${issuerData.issuer_name}\n`;
            newsContent += `Sector: ${issuerData.sector_category || 'N/A'}\n`;
          }
          newsContent += `\n`;
          
          newsContent += `TITULAR: ${news.headline}\n\n`;
          
          if (news.lead_paragraph) {
            newsContent += `ENTRADILLA: ${news.lead_paragraph}\n\n`;
          }
          
          if (news.body_excerpt) {
            newsContent += `CONTENIDO: ${news.body_excerpt}\n\n`;
          }
          
          if (news.author) {
            newsContent += `Autor: ${news.author}\n`;
          }
          
          if (news.category) {
            newsContent += `Categoría: ${news.category}\n`;
          }
          
          // Generate embedding
          const contentForEmbedding = newsContent.slice(0, 8000);
          const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openAIApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              input: contentForEmbedding,
            }),
          });
          
          if (!embeddingResponse.ok) {
            newsDocsErrored++;
            continue;
          }
          
          const embeddingData = await embeddingResponse.json();
          const embedding = embeddingData.data[0].embedding;
          
          // Metadata with temporal flags and is_news_article marker
          const newsMetadata = {
            type: 'corporate_news',
            is_news_article: true, // Clear marker for counting
            ticker: news.ticker,
            company_name: issuerData?.issuer_name || news.ticker,
            headline: news.headline,
            article_url: news.article_url,
            published_date: news.published_date,
            snapshot_date: news.snapshot_date,
            source_type: news.source_type,
            author: news.author,
            category: news.category,
            sector_category: issuerData?.sector_category,
            is_recent: isRecent,
            days_old: news.published_date ? Math.floor((Date.now() - new Date(news.published_date).getTime()) / (1000 * 60 * 60 * 24)) : null,
            content_length: newsContent.length,
          };
          
          // Insert document
          const { error: insertError } = await supabaseClient
            .from('documents')
            .insert({ content: newsContent, metadata: newsMetadata, embedding });
          
          if (insertError) {
            newsDocsErrored++;
          } else {
            newsDocsCreated++;
          }
          
          // Small delay
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (newsError) {
          console.error(`Error processing news ${news.article_url}:`, newsError);
          newsDocsErrored++;
        }
      }
      
      newsRemaining = Math.max(0, pendingNewsFound - newsDocsCreated);
      console.log(`Corporate news indexation: ${newsDocsCreated} created, ${newsDocsErrored} errors`);
    }

    const remainingRixV1 = Math.max(0, v1PendingEstimate - v1DocsCreated);
    const remainingRixV2 = Math.max(0, v2PendingEstimate - v2DocsCreated);
    const remainingRixAll = remainingRixV1 + remainingRixV2;

    // Remaining is used by AUTO-CONTINUE. It must include NEWS for news-only and all.
    const remaining = sourceFilter === 'rix_v1'
      ? remainingRixV1
      : sourceFilter === 'rix_v2'
        ? remainingRixV2
        : sourceFilter === 'news'
          ? newsRemaining
          : (remainingRixAll + newsRemaining);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    console.log(`BATCH COMPLETED: ${documentsCreated} rix docs (V1: ${v1DocsCreated}, V2: ${v2DocsCreated}), ${newsDocsCreated} news docs, ${documentsErrored + newsDocsErrored} errors, ${elapsed}s`);
    
    // Determine if complete based on filter
    let isComplete = false;
    if (sourceFilter === 'rix_v1') {
      isComplete = remainingRixV1 <= 0;
    } else if (sourceFilter === 'rix_v2') {
      isComplete = remainingRixV2 <= 0;
    } else if (sourceFilter === 'news') {
      isComplete = newsRemaining <= 0;
    } else {
      isComplete = remainingRixAll <= 0 && newsRemaining <= 0;
    }
    
    return {
      success: true,
      complete: isComplete,
      processed: documentsCreated,
      processed_v1: v1DocsCreated,
      processed_v2: v2DocsCreated,
      processed_news: newsDocsCreated,
      errored: documentsErrored + newsDocsErrored,
      remaining: Math.max(0, remaining),
      remaining_v2: sourceFilter === 'rix_v2' ? Math.max(0, remainingRixV2) : undefined,
      remaining_v1: sourceFilter === 'rix_v1' ? Math.max(0, remainingRixV1) : undefined,
      remaining_news: Math.max(0, newsRemaining),
      total: totalRuns,
      existing: totalRixDocs + documentsCreated,
      from_rix_runs: pendingFoundV1,
      from_rix_runs_v2: pendingFoundV2,
      corporate_news_total: newsTotalCount,
      source_filter: sourceFilter,
      elapsed_seconds: elapsed,
    };
    
  } catch (error) {
    console.error('Fatal error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const includeRawResponses = body.includeRawResponses !== false;
    const sourceFilter: SourceFilter = body.sourceFilter || 'all';
    const isCronTrigger = body.trigger === 'cron' || body.mode === 'continuation';

    console.log(`Starting incremental vector store population (includeRawResponses: ${includeRawResponses}, sourceFilter: ${sourceFilter}, cron: ${isCronTrigger})`);

    // Process synchronously to return result
    const result = await processVectorStore(includeRawResponses, sourceFilter);

    // AUTO-CONTINUATION: If work remains and this was triggered by cron/admin, schedule next batch
    if (result.success && !result.complete && result.remaining && result.remaining > 0) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      // Check for existing pending vector_store_continue trigger
      const { data: existingTrigger } = await supabaseClient
        .from('cron_triggers')
        .select('id')
        .eq('action', 'vector_store_continue')
        .in('status', ['pending', 'processing'])
        .limit(1);
      
      if (!existingTrigger || existingTrigger.length === 0) {
        // Insert auto-continue trigger for watchdog to pick up
        const { error: triggerError } = await supabaseClient
          .from('cron_triggers')
          .insert({
            action: 'vector_store_continue',
            status: 'pending',
            params: { 
              sourceFilter, 
              includeRawResponses,
              remaining: result.remaining,
              batch_number: (body.batch_number || 0) + 1
            }
          });
        
        if (triggerError) {
          console.error('Failed to insert vector_store_continue trigger:', triggerError);
        } else {
          console.log(`[AUTO-CONTINUE] Queued next batch for ${result.remaining} remaining documents`);
        }
      } else {
        console.log('[AUTO-CONTINUE] Trigger already pending, skipping');
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in populate-vector-store:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
