import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  ThumbsUp, 
  ThumbsDown, 
  RefreshCw, 
  Database,
  Loader2,
  CheckCircle,
  Clock
} from 'lucide-react';

interface FeedbackItem {
  id: string;
  session_id: string;
  message_index: number;
  message_content: string;
  user_question: string | null;
  rating: 'positive' | 'negative';
  created_at: string;
  included_in_vector_store: boolean;
  vector_store_included_at: string | null;
}

interface FeedbackStats {
  total: number;
  positive: number;
  negative: number;
  includedInVectorStore: number;
  pendingInclusion: number;
}

export function FeedbackPanel() {
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('chat_response_feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const items = (data || []) as FeedbackItem[];
      setFeedbackItems(items);

      // Calculate stats
      const total = items.length;
      const positive = items.filter(i => i.rating === 'positive').length;
      const negative = items.filter(i => i.rating === 'negative').length;
      const includedInVectorStore = items.filter(i => i.included_in_vector_store).length;
      const pendingInclusion = items.filter(i => i.rating === 'positive' && !i.included_in_vector_store).length;

      setStats({ total, positive, negative, includedInVectorStore, pendingInclusion });
    } catch (error) {
      console.error('Error fetching feedback:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el feedback',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const syncPositiveToVectorStore = async () => {
    setSyncing(true);
    try {
      const pendingItems = feedbackItems.filter(
        i => i.rating === 'positive' && !i.included_in_vector_store
      );

      if (pendingItems.length === 0) {
        toast({
          title: 'Sin pendientes',
          description: 'No hay respuestas positivas pendientes de sincronizar',
        });
        return;
      }

      // Mark items as included (the actual vector store sync happens in populate-vector-store)
      const { error } = await supabase
        .from('chat_response_feedback')
        .update({ 
          included_in_vector_store: true,
          vector_store_included_at: new Date().toISOString()
        })
        .in('id', pendingItems.map(i => i.id));

      if (error) throw error;

      toast({
        title: 'Sincronización preparada',
        description: `${pendingItems.length} respuestas marcadas para incluir en el vector store`,
      });

      fetchFeedback();
    } catch (error) {
      console.error('Error syncing to vector store:', error);
      toast({
        title: 'Error',
        description: 'No se pudo sincronizar',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ThumbsUp className="h-5 w-5 text-green-500" />
              Feedback de Respuestas
            </CardTitle>
            <CardDescription>
              Valoraciones de usuarios para entrenar y mejorar el Agente Rix
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchFeedback}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 rounded-lg border bg-muted/30 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total valoraciones</p>
            </div>
            <div className="p-4 rounded-lg border bg-green-50 dark:bg-green-950/20 text-center">
              <div className="flex items-center justify-center gap-1">
                <ThumbsUp className="h-4 w-4 text-green-500" />
                <p className="text-2xl font-bold text-green-600">{stats.positive}</p>
              </div>
              <p className="text-xs text-muted-foreground">Positivas</p>
            </div>
            <div className="p-4 rounded-lg border bg-red-50 dark:bg-red-950/20 text-center">
              <div className="flex items-center justify-center gap-1">
                <ThumbsDown className="h-4 w-4 text-red-500" />
                <p className="text-2xl font-bold text-red-600">{stats.negative}</p>
              </div>
              <p className="text-xs text-muted-foreground">Negativas</p>
            </div>
            <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-950/20 text-center">
              <div className="flex items-center justify-center gap-1">
                <Database className="h-4 w-4 text-blue-500" />
                <p className="text-2xl font-bold text-blue-600">{stats.includedInVectorStore}</p>
              </div>
              <p className="text-xs text-muted-foreground">En vector store</p>
            </div>
            <div className="p-4 rounded-lg border bg-amber-50 dark:bg-amber-950/20 text-center">
              <div className="flex items-center justify-center gap-1">
                <Clock className="h-4 w-4 text-amber-500" />
                <p className="text-2xl font-bold text-amber-600">{stats.pendingInclusion}</p>
              </div>
              <p className="text-xs text-muted-foreground">Pendientes</p>
            </div>
          </div>
        )}

        {/* Sync button */}
        {stats && stats.pendingInclusion > 0 && (
          <div className="flex items-center gap-4 p-4 rounded-lg border bg-primary/5">
            <div className="flex-1">
              <p className="font-medium text-sm">
                {stats.pendingInclusion} respuestas positivas listas para entrenar
              </p>
              <p className="text-xs text-muted-foreground">
                Añade estas respuestas al vector store para mejorar el Agente Rix
              </p>
            </div>
            <Button onClick={syncPositiveToVectorStore} disabled={syncing} className="gap-2">
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  Incluir en Vector Store
                </>
              )}
            </Button>
          </div>
        )}

        {/* Feedback list */}
        <div>
          <h4 className="font-medium text-sm mb-3">Últimas valoraciones</h4>
          {feedbackItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ThumbsUp className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No hay valoraciones todavía</p>
              <p className="text-sm">Las valoraciones aparecerán cuando los usuarios califiquen respuestas</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3 pr-4">
                {feedbackItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-lg border ${
                      item.rating === 'positive' 
                        ? 'border-green-200 bg-green-50/50 dark:bg-green-950/10 dark:border-green-900' 
                        : 'border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {item.rating === 'positive' ? (
                            <ThumbsUp className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <ThumbsDown className="h-4 w-4 text-red-500 flex-shrink-0" />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.created_at).toLocaleString('es-ES')}
                          </span>
                          {item.included_in_vector_store && (
                            <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 gap-1">
                              <CheckCircle className="h-3 w-3" />
                              En vector store
                            </Badge>
                          )}
                        </div>
                        
                        {item.user_question && (
                          <div className="mb-2">
                            <p className="text-xs font-medium text-muted-foreground">Pregunta:</p>
                            <p className="text-sm truncate">{item.user_question}</p>
                          </div>
                        )}
                        
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Respuesta valorada:</p>
                          <p className="text-sm line-clamp-3">{item.message_content.substring(0, 300)}...</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Info */}
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
          <p className="font-medium mb-1">ℹ️ Sistema de entrenamiento</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>👍 Positivas:</strong> Se añaden al vector store para reforzar respuestas similares</li>
            <li><strong>👎 Negativas:</strong> Se analizan para identificar patrones a corregir</li>
            <li>El feedback ayuda a mejorar continuamente la calidad del Agente Rix</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
