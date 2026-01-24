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
      // Fetch counts from all three source tables
      const [
        rixV1Result,
        rixV2Result,
        newsResult,
        docsResult,
      ] = await Promise.all([
        supabase.from('rix_runs').select('id', { count: 'exact', head: true }),
        supabase.from('rix_runs_v2').select('id', { count: 'exact', head: true }),
        supabase.from('corporate_news').select('id', { count: 'exact', head: true }),
        supabase.from('documents').select('metadata', { count: 'exact' }).limit(10000),
      ]);

      const rixV1Total = rixV1Result.count || 0;
      const rixV2Total = rixV2Result.count || 0;
      const newsTotal = newsResult.count || 0;

      // Analyze document metadata to categorize indexed documents
      // The populate-vector-store function tags documents with metadata
      let rixV1Indexed = 0;
      let rixV2Indexed = 0;
      let newsIndexed = 0;

      if (docsResult.data) {
        for (const doc of docsResult.data) {
          const meta = doc.metadata as Record<string, any> | null;
          if (!meta) continue;

          // Corporate news check (has is_news_article flag)
          if (meta.is_news_article === true) {
            newsIndexed++;
          }
          // RIX V2 check (has source_table = 'rix_runs_v2')
          else if (meta.source_table === 'rix_runs_v2') {
            rixV2Indexed++;
          }
          // RIX V1 check (has rix_run_id but not marked as v2)
          else if (meta.rix_run_id && meta.source_table !== 'rix_runs_v2') {
            rixV1Indexed++;
          }
          // Legacy documents without clear tagging - count as V1
          else if (meta.ticker || meta.company_name) {
            rixV1Indexed++;
          }
        }
      }

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
