import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { SlideDesign } from '@/lib/pptxTypes';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface SalesConversation {
  id: string;
  admin_user_id: string;
  company_name: string;
  ticker: string | null;
  target_profile: string;
  custom_context: string | null;
  messages: Message[];
  message_ratings: Record<number, number>;
  rix_questions: string[];
  metadata: Record<string, unknown> | null;
  is_starred: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalesPPTXExport {
  id: string;
  conversation_id: string | null;
  admin_user_id: string;
  company_name: string;
  target_profile: string;
  slides_count: number;
  slide_designs: SlideDesign[];
  high_rated_content: string[];
  file_name: string;
  created_at: string;
}

interface CreateConversationParams {
  company_name: string;
  ticker?: string | null;
  target_profile: string;
  custom_context?: string;
}

interface UpdateConversationParams {
  id: string;
  messages: Message[];
  message_ratings: Record<number, number>;
  rix_questions?: string[];
  metadata?: Record<string, unknown>;
}

interface LogPPTXExportParams {
  conversation_id?: string | null;
  company_name: string;
  target_profile: string;
  slides_count: number;
  slide_designs: SlideDesign[];
  high_rated_content: string[];
  file_name: string;
}

export const useSalesConversations = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all conversations for the current admin
  const { data: conversations, isLoading: isLoadingConversations, refetch } = useQuery({
    queryKey: ['sales-conversations', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_conversations')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      // Parse JSONB fields properly
      return (data || []).map(row => ({
        ...row,
        messages: (row.messages as unknown as Message[]) || [],
        message_ratings: (row.message_ratings as unknown as Record<number, number>) || {},
        rix_questions: row.rix_questions || [],
        metadata: row.metadata as Record<string, unknown> | null,
      })) as SalesConversation[];
    },
    enabled: !!user,
  });

  // Fetch PPTX exports for a specific conversation
  const usePPTXExports = (conversationId?: string) => {
    return useQuery({
      queryKey: ['sales-pptx-exports', conversationId],
      queryFn: async () => {
        let query = supabase
          .from('sales_pptx_exports')
          .select('*')
          .order('created_at', { ascending: false });

        if (conversationId) {
          query = query.eq('conversation_id', conversationId);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        return (data || []).map(row => ({
          ...row,
          slide_designs: (row.slide_designs as unknown as SlideDesign[]) || [],
          high_rated_content: row.high_rated_content || [],
        })) as SalesPPTXExport[];
      },
      enabled: !!user,
    });
  };

  // Create a new conversation
  const createConversationMutation = useMutation({
    mutationFn: async (params: CreateConversationParams) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('sales_conversations')
        .insert({
          admin_user_id: user.id,
          company_name: params.company_name,
          ticker: params.ticker || null,
          target_profile: params.target_profile,
          custom_context: params.custom_context || null,
          messages: [],
          message_ratings: {},
          rix_questions: [],
        })
        .select()
        .single();

      if (error) throw error;
      return {
        ...data,
        messages: [],
        message_ratings: {},
        rix_questions: [],
        metadata: null,
      } as SalesConversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-conversations'] });
    },
  });

  // Update conversation messages and ratings
  const updateConversationMutation = useMutation({
    mutationFn: async (params: UpdateConversationParams) => {
      const { data, error } = await supabase
        .from('sales_conversations')
        .update({
          messages: JSON.parse(JSON.stringify(params.messages)),
          message_ratings: JSON.parse(JSON.stringify(params.message_ratings)),
          rix_questions: params.rix_questions || [],
          metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : null,
        })
        .eq('id', params.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-conversations'] });
    },
  });

  // Toggle starred status
  const toggleStarredMutation = useMutation({
    mutationFn: async ({ id, is_starred }: { id: string; is_starred: boolean }) => {
      const { error } = await supabase
        .from('sales_conversations')
        .update({ is_starred })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-conversations'] });
    },
  });

  // Archive conversation
  const archiveConversationMutation = useMutation({
    mutationFn: async ({ id, is_archived }: { id: string; is_archived: boolean }) => {
      const { error } = await supabase
        .from('sales_conversations')
        .update({ is_archived })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-conversations'] });
    },
  });

  // Delete conversation
  const deleteConversationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('sales_conversations')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-conversations'] });
    },
  });

  // Log PPTX export
  const logPPTXExportMutation = useMutation({
    mutationFn: async (params: LogPPTXExportParams) => {
      if (!user) throw new Error('Not authenticated');

      const insertData = {
        company_name: params.company_name,
        target_profile: params.target_profile,
        slides_count: params.slides_count,
        slide_designs: JSON.parse(JSON.stringify(params.slide_designs)),
        high_rated_content: params.high_rated_content,
        file_name: params.file_name,
      };

      const { data, error } = await supabase
        .from('sales_pptx_exports')
        .insert(insertData as never)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-pptx-exports'] });
    },
  });

  return {
    // Data
    conversations: conversations || [],
    isLoadingConversations,
    refetch,
    usePPTXExports,

    // Mutations
    createConversation: createConversationMutation.mutateAsync,
    isCreating: createConversationMutation.isPending,

    updateConversation: updateConversationMutation.mutateAsync,
    isUpdating: updateConversationMutation.isPending,

    toggleStarred: toggleStarredMutation.mutateAsync,
    archiveConversation: archiveConversationMutation.mutateAsync,
    deleteConversation: deleteConversationMutation.mutateAsync,

    logPPTXExport: logPPTXExportMutation.mutateAsync,
    isLoggingExport: logPPTXExportMutation.isPending,
  };
};
