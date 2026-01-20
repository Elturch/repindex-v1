import React, { useState, useEffect, useRef } from 'react';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProgressiveLoad } from '@/hooks/useProgressiveLoad';
import { 
  MessageSquare, 
  Star, 
  StarOff, 
  Trash2, 
  Search,
  Calendar,
  ArrowRight,
  Loader2,
  MessagesSquare
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { useChatContext } from '@/contexts/ChatContext';

interface UserConversation {
  id: string;
  session_id: string;
  title: string;
  is_starred: boolean;
  messages_count: number;
  last_message_at: string | null;
  created_at: string;
}

const MyConversations: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { loadConversation } = useChatContext();
  const [conversations, setConversations] = useState<UserConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (user) {
      fetchConversations();
    }
  }, [user]);

  const fetchConversations = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_conversations')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      setConversations(data as UserConversation[] || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las conversaciones.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStar = async (convId: string, currentStarred: boolean) => {
    try {
      const { error } = await supabase
        .from('user_conversations')
        .update({ is_starred: !currentStarred })
        .eq('id', convId);

      if (error) throw error;
      
      setConversations(convs => 
        convs.map(c => c.id === convId ? { ...c, is_starred: !currentStarred } : c)
      );
    } catch (error) {
      console.error('Error toggling star:', error);
    }
  };

  const archiveConversation = async (convId: string) => {
    try {
      const { error } = await supabase
        .from('user_conversations')
        .update({ is_archived: true })
        .eq('id', convId);

      if (error) throw error;
      
      setConversations(convs => convs.filter(c => c.id !== convId));
      toast({
        title: "Conversación archivada",
        description: "La conversación se ha movido al archivo.",
      });
    } catch (error) {
      console.error('Error archiving conversation:', error);
      toast({
        title: "Error",
        description: "No se pudo archivar la conversación.",
        variant: "destructive",
      });
    }
  };

  const openConversation = (conv: UserConversation) => {
    // Load the conversation in chat context and navigate
    if (loadConversation) {
      loadConversation(conv.session_id);
    }
    // Navigate to chat and ensure the floating chat opens
    navigate('/chat');
  };

  const filteredConversations = conversations.filter(conv => 
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const starredConvs = filteredConversations.filter(c => c.is_starred);
  const allRegularConvs = filteredConversations.filter(c => !c.is_starred);

  // Progressive loading for regular conversations
  const {
    visibleItems: regularConvs,
    hasMore,
    remainingCount,
    isLoadingMore,
    loadMore,
    loadAll,
  } = useProgressiveLoad(allRegularConvs, { initialBatchSize: 15, incrementSize: 15 });

  // Intersection observer for infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  return (
    <Layout title="Mis Conversaciones">
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Mis Conversaciones</h1>
          <p className="text-muted-foreground">
            Historial de conversaciones con el asistente de RepIndex
          </p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversaciones..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessagesSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Sin conversaciones</h3>
              <p className="text-muted-foreground text-center max-w-sm mb-4">
                {searchQuery 
                  ? 'No se encontraron conversaciones con esa búsqueda.' 
                  : 'Aquí aparecerán tus conversaciones con el asistente de RepIndex.'}
              </p>
              <Button onClick={() => navigate('/chat')}>
                Iniciar una conversación
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Starred conversations */}
            {starredConvs.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  Destacadas
                </h2>
                <div className="space-y-3">
                  {starredConvs.map(conv => (
                    <ConversationCard
                      key={conv.id}
                      conversation={conv}
                      onToggleStar={toggleStar}
                      onArchive={archiveConversation}
                      onOpen={openConversation}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Regular conversations */}
            {regularConvs.length > 0 && (
              <div>
                {starredConvs.length > 0 && (
                  <h2 className="text-sm font-medium text-muted-foreground mb-3">
                    Todas las conversaciones
                  </h2>
                )}
                <div className="space-y-3">
                  {regularConvs.map(conv => (
                    <ConversationCard
                      key={conv.id}
                      conversation={conv}
                      onToggleStar={toggleStar}
                      onArchive={archiveConversation}
                      onOpen={openConversation}
                    />
                  ))}
                </div>
                
                {/* Load more indicator */}
                <div ref={loadMoreRef} className="py-4">
                  {hasMore && (
                    <div className="flex items-center justify-center gap-3">
                      {isLoadingMore ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Cargando más...</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground">
                            Mostrando {regularConvs.length} de {allRegularConvs.length}
                          </span>
                          <Button variant="outline" size="sm" onClick={loadMore}>
                            Cargar más ({remainingCount})
                          </Button>
                          <Button variant="ghost" size="sm" onClick={loadAll}>
                            Cargar todos
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

interface ConversationCardProps {
  conversation: UserConversation;
  onToggleStar: (id: string, starred: boolean) => void;
  onArchive: (id: string) => void;
  onOpen: (conv: UserConversation) => void;
}

const ConversationCard: React.FC<ConversationCardProps> = ({
  conversation: conv,
  onToggleStar,
  onArchive,
  onOpen,
}) => {
  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{conv.title}</h3>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {conv.last_message_at 
                  ? format(new Date(conv.last_message_at), "d MMM, HH:mm", { locale: es })
                  : format(new Date(conv.created_at), "d MMM, HH:mm", { locale: es })
                }
              </span>
              <span>{conv.messages_count} mensajes</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleStar(conv.id, conv.is_starred)}
              className="p-2 rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {conv.is_starred ? (
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              ) : (
                <StarOff className="h-4 w-4 text-muted-foreground hover:text-yellow-400" />
              )}
            </button>
            <button
              onClick={() => onArchive(conv.id)}
              className="p-2 rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpen(conv)}
              className="gap-1"
            >
              Abrir
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MyConversations;
