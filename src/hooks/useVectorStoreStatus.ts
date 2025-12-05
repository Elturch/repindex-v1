import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface VectorStoreStatus {
  isRepopulating: boolean;
  progress: number;
  documentsCount: number;
  totalRecords: number;
}

export function useVectorStoreStatus() {
  const [status, setStatus] = useState<VectorStoreStatus>({
    isRepopulating: false,
    progress: 100,
    documentsCount: 0,
    totalRecords: 0,
  });

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const [docsResult, runsResult] = await Promise.all([
          supabase.from('documents').select('id', { count: 'exact', head: true }),
          supabase.from('rix_runs').select('id', { count: 'exact', head: true }),
        ]);

        const documentsCount = docsResult.count || 0;
        const totalRecords = runsResult.count || 0;
        
        // Consider repopulating if documents < 90% of rix_runs
        const progress = totalRecords > 0 ? Math.round((documentsCount / totalRecords) * 100) : 100;
        const isRepopulating = totalRecords > 0 && documentsCount < totalRecords * 0.9;

        setStatus({
          isRepopulating,
          progress,
          documentsCount,
          totalRecords,
        });
      } catch (error) {
        console.error('Error checking vector store status:', error);
      }
    };

    checkStatus();
    
    // Only poll if initially repopulating
    const interval = setInterval(checkStatus, 10000); // Check every 10 seconds
    
    return () => clearInterval(interval);
  }, []);

  return status;
}
