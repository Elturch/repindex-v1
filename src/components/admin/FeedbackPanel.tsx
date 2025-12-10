import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  ThumbsUp, 
  ThumbsDown, 
  RefreshCw, 
  Database,
  Loader2,
  CheckCircle,
  Clock,
  Calendar,
  Zap
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
  todayCount: number;
}

export function FeedbackPanel() {
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [todayItems, setTodayItems] = useState<FeedbackItem[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingFeedback, setSyncingFeedback] = useState(false);
  const { toast } = useToast();

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      // Get all feedback
      const { data, error } = await supabase
        .from('chat_response_feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const items = (data || []) as FeedbackItem[];
      setFeedbackItems(items);

      // Get today's items
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();
      
      const todayFeedback = items.filter(i => new Date(i.created_at) >= today);
      setTodayItems(todayFeedback);

      // Calculate stats
      const total = items.length;
      const positive = items.filter(i => i.rating === 'positive').length;
      const negative = items.filter(i => i.rating === 'negative').length;
      const includedInVectorStore = items.filter(i => i.included_in_vector_store).length;
      const pendingInclusion = items.filter(i => i.rating === 'positive' && !i.included_in_vector_store).length;
      const todayCount = todayFeedback.length;

      setStats({ total, positive, negative, includedInVectorStore, pendingInclusion, todayCount });
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

  const syncFeedbackToVectorStore = async () => {
    setSyncingFeedback(true);
    try {
      const { data, error } = await supabase.functions.invoke('populate-feedback-vectors', {
        body: {}
      });

      if (error) throw error;

      toast({
        title: 'Sincronización completada',
        description: `${data.processed || 0} respuestas añadidas al vector store`,
      });

      fetchFeedback();
    } catch (error) {
      console.error('Error syncing feedback:', error);
      toast({
        title: 'Error',
        description: 'No se pudo sincronizar el feedback',
        variant: 'destructive',
      });
    } finally {
      setSyncingFeedback(false);
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
    <div className="space-y-6">
      {/* Stats Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                Feedback y Entrenamiento
              </CardTitle>
              <CardDescription className="text-xs">
                Valoraciones de usuarios para refuerzo del Agente Rix
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchFeedback} className="h-8 w-8 p-0">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats Grid */}
          {stats && (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              <div className="p-2.5 rounded-md border bg-muted/30 text-center">
                <p className="text-lg font-semibold">{stats.total}</p>
                <p className="text-[10px] text-muted-foreground">Total</p>
              </div>
              <div className="p-2.5 rounded-md border bg-green-50/50 dark:bg-green-950/20 text-center">
                <p className="text-lg font-semibold text-green-600">{stats.positive}</p>
                <p className="text-[10px] text-muted-foreground">Positivas</p>
              </div>
              <div className="p-2.5 rounded-md border bg-red-50/50 dark:bg-red-950/20 text-center">
                <p className="text-lg font-semibold text-red-600">{stats.negative}</p>
                <p className="text-[10px] text-muted-foreground">Negativas</p>
              </div>
              <div className="p-2.5 rounded-md border bg-blue-50/50 dark:bg-blue-950/20 text-center">
                <p className="text-lg font-semibold text-blue-600">{stats.includedInVectorStore}</p>
                <p className="text-[10px] text-muted-foreground">En Vector</p>
              </div>
              <div className="p-2.5 rounded-md border bg-amber-50/50 dark:bg-amber-950/20 text-center">
                <p className="text-lg font-semibold text-amber-600">{stats.pendingInclusion}</p>
                <p className="text-[10px] text-muted-foreground">Pendientes</p>
              </div>
              <div className="p-2.5 rounded-md border bg-purple-50/50 dark:bg-purple-950/20 text-center">
                <p className="text-lg font-semibold text-purple-600">{stats.todayCount}</p>
                <p className="text-[10px] text-muted-foreground">Hoy</p>
              </div>
            </div>
          )}

          {/* Sync Button */}
          {stats && stats.pendingInclusion > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-md border bg-primary/5">
              <Zap className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">
                  {stats.pendingInclusion} respuestas positivas pendientes
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Se sincronizan automáticamente cada noche a las 02:00
                </p>
              </div>
              <Button 
                size="sm" 
                onClick={syncFeedbackToVectorStore} 
                disabled={syncingFeedback}
                className="h-7 text-xs gap-1.5"
              >
                {syncingFeedback ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Database className="h-3 w-3" />
                )}
                Sincronizar ahora
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Feedback */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Valoraciones de hoy
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayItems.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <p className="text-sm">No hay valoraciones hoy</p>
            </div>
          ) : (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2 pr-4">
                {todayItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-md border ${
                      item.rating === 'positive' 
                        ? 'border-green-200/50 bg-green-50/30 dark:bg-green-950/10' 
                        : 'border-red-200/50 bg-red-50/30 dark:bg-red-950/10'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {item.rating === 'positive' ? (
                        <ThumbsUp className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <ThumbsDown className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(item.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {item.included_in_vector_store && (
                            <Badge variant="outline" className="text-[8px] h-4 bg-blue-100/50 text-blue-600 border-blue-200">
                              <CheckCircle className="h-2 w-2 mr-0.5" />
                              Vector
                            </Badge>
                          )}
                        </div>
                        {item.user_question && (
                          <p className="text-[10px] text-muted-foreground mb-0.5 truncate">
                            P: {item.user_question}
                          </p>
                        )}
                        <p className="text-xs line-clamp-2">{item.message_content.substring(0, 150)}...</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* All Feedback */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Historial de valoraciones</CardTitle>
        </CardHeader>
        <CardContent>
          {feedbackItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ThumbsUp className="h-8 w-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No hay valoraciones todavía</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2 pr-4">
                {feedbackItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-md border ${
                      item.rating === 'positive' 
                        ? 'border-green-200/50 bg-green-50/30 dark:bg-green-950/10' 
                        : 'border-red-200/50 bg-red-50/30 dark:bg-red-950/10'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {item.rating === 'positive' ? (
                        <ThumbsUp className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <ThumbsDown className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(item.created_at).toLocaleString('es-ES', { 
                              day: '2-digit', 
                              month: '2-digit',
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                          {item.included_in_vector_store && (
                            <Badge variant="outline" className="text-[8px] h-4 bg-blue-100/50 text-blue-600 border-blue-200">
                              <CheckCircle className="h-2 w-2 mr-0.5" />
                              Vector
                            </Badge>
                          )}
                        </div>
                        {item.user_question && (
                          <p className="text-[10px] text-muted-foreground mb-0.5 truncate">
                            P: {item.user_question}
                          </p>
                        )}
                        <p className="text-xs line-clamp-2">{item.message_content.substring(0, 150)}...</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Info */}
      <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-md border">
        <p className="font-medium mb-1">Sistema de entrenamiento por refuerzo</p>
        <ul className="list-disc list-inside space-y-0.5 text-[11px]">
          <li><span className="text-green-600">Positivas:</span> Se añaden al vector store como ejemplos de calidad</li>
          <li><span className="text-red-600">Negativas:</span> Se analizan para identificar mejoras</li>
          <li><span className="text-blue-600">CRON nocturno:</span> Sincronización automática a las 02:00 UTC</li>
        </ul>
      </div>
    </div>
  );
}
