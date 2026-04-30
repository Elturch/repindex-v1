import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SourceStatus {
  total: number;
  indexed: number;
  pending: number;
  progress: number;
}

export interface VectorStoreStatusV2 {
  rixV1: SourceStatus;
  rixV2: SourceStatus;
  corporateNews: SourceStatus;
  totalRecords: number;
  totalIndexed: number;
  totalPending: number;
  overallProgress: number;
  isRepopulating: boolean;
  lastChecked: Date | null;
  isLoading: boolean;
}

const initialSourceStatus: SourceStatus = {
  total: 0,
  indexed: 0,
  pending: 0,
  progress: 100,
};

export function useVectorStoreStatusV2() {
  const [status, setStatus] = useState<VectorStoreStatusV2>({
    rixV1: initialSourceStatus,
    rixV2: initialSourceStatus,
    corporateNews: initialSourceStatus,
    totalRecords: 0,
    totalIndexed: 0,
    totalPending: 0,
    overallProgress: 100,
    isRepopulating: false,
    lastChecked: null,
    isLoading: true,
  });

  const checkStatus = useCallback(async () => {
    try {
      // SERVER-SIDE COUNTS: No data download, just count queries
      // This removes all limits and is much faster
      
      // Count totals from source tables (no limit needed - just counting)
      const [
        rixV1TotalResult,
        rixV2TotalResult,
        newsTotalResult,
      ] = await Promise.all([
        // FASE 1 — rix_runs DEPRECATED. Devolvemos count=0 sin tocar la tabla.
        Promise.resolve({ count: 0 } as { count: number }),
        supabase.from('rix_runs_v2').select('id', { count: 'exact', head: true }),
        supabase.from('corporate_news').select('id', { count: 'exact', head: true }),
      ]);

      const rixV1Total = rixV1TotalResult.count || 0;
      const rixV2Total = rixV2TotalResult.count || 0;
      const newsTotal = newsTotalResult.count || 0;

      // Count indexed documents by source using metadata filters
      // Using textSearch on metadata JSONB fields for server-side filtering
      const [
        rixV2DocsResult,
        newsDocsResult,
        totalDocsResult,
      ] = await Promise.all([
        // RIX V2 documents: metadata->source_table = 'rix_runs_v2'
        supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('metadata->>source_table', 'rix_runs_v2'),
        
        // News documents: metadata->type = 'corporate_news' OR metadata->is_news_article = true
        supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('metadata->>type', 'corporate_news'),
        
        // Total documents with rix_run_id (all RIX docs)
        supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .not('metadata->>rix_run_id', 'is', null),
      ]);

      const rixV2Indexed = rixV2DocsResult.count || 0;
      const newsIndexed = newsDocsResult.count || 0;
      const totalRixDocs = totalDocsResult.count || 0;
      
      // RIX V1 indexed = total RIX docs - V2 docs
      const rixV1Indexed = Math.max(0, totalRixDocs - rixV2Indexed);

      // Calculate per-source status
      const calcProgress = (indexed: number, total: number) => 
        total > 0 ? Math.min(100, Math.round((indexed / total) * 100)) : 100;

      const rixV1: SourceStatus = {
        total: rixV1Total,
        indexed: rixV1Indexed,
        pending: Math.max(0, rixV1Total - rixV1Indexed),
        progress: calcProgress(rixV1Indexed, rixV1Total),
      };

      const rixV2: SourceStatus = {
        total: rixV2Total,
        indexed: rixV2Indexed,
        pending: Math.max(0, rixV2Total - rixV2Indexed),
        progress: calcProgress(rixV2Indexed, rixV2Total),
      };

      const corporateNews: SourceStatus = {
        total: newsTotal,
        indexed: newsIndexed,
        pending: Math.max(0, newsTotal - newsIndexed),
        progress: calcProgress(newsIndexed, newsTotal),
      };

      // Calculate totals
      const totalRecords = rixV1Total + rixV2Total + newsTotal;
      const totalIndexed = rixV1Indexed + rixV2Indexed + newsIndexed;
      const totalPending = totalRecords - totalIndexed;
      const overallProgress = calcProgress(totalIndexed, totalRecords);
      const isRepopulating = totalPending > 0 && overallProgress < 95;

      setStatus({
        rixV1,
        rixV2,
        corporateNews,
        totalRecords,
        totalIndexed,
        totalPending,
        overallProgress,
        isRepopulating,
        lastChecked: new Date(),
        isLoading: false,
      });
    } catch (error) {
      console.error('Error checking vector store status:', error);
      setStatus(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    checkStatus();
    
    // Poll every 15 seconds
    const interval = setInterval(checkStatus, 15000);
    
    return () => clearInterval(interval);
  }, [checkStatus]);

  return { status, refresh: checkStatus };
}
