import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const MAX_RAW_RESPONSE_LENGTH = 8000;
const BATCH_SIZE = 100; // Documents per execution
const MAX_EXECUTION_TIME = 45000; // 45 seconds (safe margin before timeout)
const NEWS_BATCH_SIZE = 50; // News articles per execution

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
    // Get existing document IDs (by rix_run_id in metadata)
    // MEMORY OPTIMIZED: Only fetch rix_run_id from metadata, not full metadata object
    console.log('Fetching existing document IDs (optimized)...');
    const existingRunIds = new Set<string>();
    let docOffset = 0;
    const docBatchSize = 2000; // Larger batch since we're only fetching one field
    
    while (true) {
      // Use raw SQL-like filter to only get what we need
      // IMPORTANT: .order() is required for stable pagination with .range()
      const { data: existingDocs, error: existingError } = await supabaseClient
        .from('documents')
        .select('metadata->rix_run_id')
        .not('metadata->rix_run_id', 'is', null)
        .order('id', { ascending: true })
        .range(docOffset, docOffset + docBatchSize - 1);

      if (existingError) {
        console.error('Error fetching existing docs:', existingError);
        return { success: false, error: existingError.message };
      }
      
      if (!existingDocs || existingDocs.length === 0) break;
      
      existingDocs.forEach(d => {
        const rixRunId = d.rix_run_id;
        if (rixRunId) {
          existingRunIds.add(rixRunId);
        }
      });
      
      if (existingDocs.length < docBatchSize) break;
      docOffset += docBatchSize;
    }
    
    console.log(`Found ${existingRunIds.size} existing document IDs`);

    // ==========================================================================
    // FETCH FROM TABLES BASED ON sourceFilter - MEMORY OPTIMIZED
    // For 'all' mode, we process sources sequentially to avoid memory overflow
    // ==========================================================================
    let pendingRuns: any[] = [];
    let totalRuns = 0;
    
    // NO LIMITS - Fetch all pending records for complete processing
    
    // Fetch from rix_runs (original Make.com data) - only if needed
    if (sourceFilter === 'all' || sourceFilter === 'rix_v1') {
      console.log('Fetching rix_runs (V1) - memory optimized...');
      
      // First, get count of total records
      const { count: v1Count } = await supabaseClient
        .from('rix_runs')
        .select('id', { count: 'exact', head: true })
        .not('10_resumen', 'is', null);
      
      totalRuns += v1Count || 0;
      console.log(`V1 total records: ${v1Count}`);
      
      // Fetch only records NOT in existingRunIds, limited to PENDING_FETCH_LIMIT
      // We fetch in smaller batches and filter as we go
      let v1Fetched = 0;
      let v1Offset = 0;
      const v1BatchSize = 500;
      
      while (true) {
        const { data: rixBatch, error: rixError } = await supabaseClient
          .from('rix_runs')
          .select('*')
          .not('10_resumen', 'is', null)
          .order('id', { ascending: true })
          .range(v1Offset, v1Offset + v1BatchSize - 1);

        if (rixError) {
          console.error('Error fetching rix_runs:', rixError);
          throw rixError;
        }
        
        if (!rixBatch || rixBatch.length === 0) break;
        
        // Filter and add only pending runs (not in existing)
        for (const r of rixBatch) {
          if (!existingRunIds.has(r.id)) {
            pendingRuns.push({ ...r, _source_table: 'rix_runs' });
          }
        }
        
        v1Fetched += rixBatch.length;
        if (rixBatch.length < v1BatchSize) break;
        v1Offset += v1BatchSize;
      }
      console.log(`V1: scanned ${v1Fetched}, found ${pendingRuns.filter(r => r._source_table === 'rix_runs').length} pending`);
    }

    // Fetch from rix_runs_v2 (new 6 IA system) - only if needed
    if (sourceFilter === 'all' || sourceFilter === 'rix_v2') {
      console.log('Fetching rix_runs_v2 (V2) - memory optimized...');
      
      const { count: v2Count } = await supabaseClient
        .from('rix_runs_v2')
        .select('id', { count: 'exact', head: true })
        .not('10_resumen', 'is', null);
      
      totalRuns += v2Count || 0;
      console.log(`V2 total records: ${v2Count}`);
      
      let v2Offset = 0;
      const v2BatchSize = 500;
      
      while (true) {
        const { data: v2Batch, error: v2Error } = await supabaseClient
          .from('rix_runs_v2')
          .select('*')
          .not('10_resumen', 'is', null)
          .order('id', { ascending: true })
          .range(v2Offset, v2Offset + v2BatchSize - 1);

        if (v2Error) {
          console.error('Error fetching rix_runs_v2:', v2Error);
          throw v2Error;
        }
        
        if (!v2Batch || v2Batch.length === 0) break;
        
        for (const r of v2Batch) {
          if (!existingRunIds.has(r.id)) {
            pendingRuns.push({ ...r, _source_table: 'rix_runs_v2' });
          }
        }
        
        if (v2Batch.length < v2BatchSize) break;
        v2Offset += v2BatchSize;
      }
      console.log(`V2: found ${pendingRuns.filter(r => r._source_table === 'rix_runs_v2').length} pending`);
    }

    console.log(`Total DB records: ~${totalRuns}, Existing docs: ${existingRunIds.size}, Pending to process: ${pendingRuns.length}`);

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
      .select('*')
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
    if (sourceFilter !== 'news' && pendingRuns.length > 0) {
      const batchToProcess = pendingRuns.slice(0, BATCH_SIZE);
      
      for (const run of batchToProcess) {
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
          await new Promise(resolve => setTimeout(resolve, 100));
          
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
      
      // Get existing news documents (by article_url in metadata)
      const existingNewsUrls = new Set<string>();
      let newsDocOffset = 0;
      
      while (true) {
        const { data: existingNewsDocs } = await supabaseClient
          .from('documents')
          .select('metadata')
          .eq('metadata->>type', 'corporate_news')
          .range(newsDocOffset, newsDocOffset + 1000 - 1);
        
        if (!existingNewsDocs || existingNewsDocs.length === 0) break;
        
        existingNewsDocs.forEach(d => {
          if (d.metadata?.article_url) {
            existingNewsUrls.add(d.metadata.article_url);
          }
        });
        
        if (existingNewsDocs.length < 1000) break;
        newsDocOffset += 1000;
      }
      
      console.log(`Found ${existingNewsUrls.size} existing corporate news documents`);
      
      // Fetch ALL corporate news (no limit)
      let allCorporateNews: any[] = [];
      let newsOffset = 0;
      const newsBatchSize = 1000;
      
      while (true) {
        const { data: newsData } = await supabaseClient
          .from('corporate_news')
          .select('*')
          .order('published_date', { ascending: false })
          .range(newsOffset, newsOffset + newsBatchSize - 1);
        
        if (!newsData || newsData.length === 0) break;
        allCorporateNews.push(...newsData);
        if (newsData.length < newsBatchSize) break;
        newsOffset += newsBatchSize;
      }
      
      newsTotalCount = allCorporateNews.length;
      const pendingNews = allCorporateNews.filter(n => !existingNewsUrls.has(n.article_url));
      console.log(`Corporate news: ${newsTotalCount} total, ${pendingNews.length} pending`);
      
      // Process news batch
      const newsBatchToProcess = pendingNews.slice(0, NEWS_BATCH_SIZE);
      
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
      
      newsRemaining = pendingNews.length - newsDocsCreated;
      console.log(`Corporate news indexation: ${newsDocsCreated} created, ${newsDocsErrored} errors`);
    }

    const remaining = pendingRuns.length - documentsCreated;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    console.log(`BATCH COMPLETED: ${documentsCreated} rix docs (V1: ${v1DocsCreated}, V2: ${v2DocsCreated}), ${newsDocsCreated} news docs, ${documentsErrored + newsDocsErrored} errors, ${elapsed}s`);
    
    // Determine if complete based on filter
    let isComplete = false;
    if (sourceFilter === 'rix_v1') {
      isComplete = remaining <= 0;
    } else if (sourceFilter === 'rix_v2') {
      isComplete = remaining <= 0;
    } else if (sourceFilter === 'news') {
      isComplete = newsRemaining <= 0;
    } else {
      isComplete = remaining <= 0 && newsRemaining <= 0;
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
      remaining_v2: sourceFilter === 'rix_v2' ? Math.max(0, remaining) : undefined,
      remaining_news: Math.max(0, newsRemaining),
      total: totalRuns,
      existing: existingRunIds.size + documentsCreated,
      from_rix_runs: pendingRuns.filter(r => r._source_table === 'rix_runs').length,
      from_rix_runs_v2: pendingRuns.filter(r => r._source_table === 'rix_runs_v2').length,
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

    console.log(`Starting incremental vector store population (includeRawResponses: ${includeRawResponses}, sourceFilter: ${sourceFilter})`);

    // Process synchronously to return result (auto-continuation needs result)
    const result = await processVectorStore(includeRawResponses, sourceFilter);

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
