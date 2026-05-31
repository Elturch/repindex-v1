import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SweepStatus {
  in_progress: boolean;
  started_at: string | null;
  sweep_id: string | null;
  total: number;
  done: number;
}

const DEFAULT: SweepStatus = {
  in_progress: false,
  started_at: null,
  sweep_id: null,
  total: 0,
  done: 0,
};

export function useSweepStatus() {
  return useQuery<SweepStatus>({
    queryKey: ['app_config', 'sweep_status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'sweep_status')
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? {}) as Partial<SweepStatus>;
      return { ...DEFAULT, ...v } as SweepStatus;
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}

export interface SweepThroughput {
  tickers_per_hour: number;
  completed_window: number;
  pending_total: number;
  processing_total: number;
  done_total: number;
  skipped_total: number;
  eta_minutes: number | null;
}

export function useSweepThroughput(windowMinutes = 10) {
  return useQuery<SweepThroughput | null>({
    queryKey: ['sweep_queue_throughput', windowMinutes],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('sweep_queue_throughput', { p_minutes: windowMinutes });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        tickers_per_hour: Number(row.tickers_per_hour ?? 0),
        completed_window: Number(row.completed_window ?? 0),
        pending_total: Number(row.pending_total ?? 0),
        processing_total: Number(row.processing_total ?? 0),
        done_total: Number(row.done_total ?? 0),
        skipped_total: Number(row.skipped_total ?? 0),
        eta_minutes: row.eta_minutes != null ? Number(row.eta_minutes) : null,
      };
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}