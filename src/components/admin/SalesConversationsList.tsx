import React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Star, 
  Archive, 
  Trash2, 
  Building2, 
  MessageSquare,
  FileText,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { SalesConversation } from '@/hooks/useSalesConversations';

interface SalesConversationsListProps {
  conversations: SalesConversation[];
  currentConversationId: string | null;
  onSelectConversation: (conversation: SalesConversation | null) => void;
  onToggleStarred: (id: string, isStarred: boolean) => void;
  onArchive: (id: string, isArchived: boolean) => void;
  onDelete: (id: string) => void;
  showArchived?: boolean;
}

export const SalesConversationsList: React.FC<SalesConversationsListProps> = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onToggleStarred,
  onArchive,
  onDelete,
  showArchived = false,
}) => {
  const filteredConversations = conversations.filter(c => 
    showArchived ? c.is_archived : !c.is_archived
  );

  const starredConversations = filteredConversations.filter(c => c.is_starred);
  const regularConversations = filteredConversations.filter(c => !c.is_starred);

  const getHighRatedCount = (ratings: Record<number, number>): number => {
    return Object.values(ratings).filter(r => r >= 4).length;
  };

  const renderConversation = (conv: SalesConversation) => {
    const isActive = conv.id === currentConversationId;
    const highRatedCount = getHighRatedCount(conv.message_ratings);
    const messageCount = conv.messages.length;

    return (
      <div
        key={conv.id}
        className={`p-3 rounded-lg cursor-pointer transition-all border ${
          isActive 
            ? 'bg-primary/10 border-primary' 
            : 'bg-background hover:bg-muted/50 border-transparent hover:border-border'
        }`}
        onClick={() => onSelectConversation(conv)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="font-medium truncate">{conv.company_name}</span>
              {conv.is_starred && (
                <Star className="h-3 w-3 text-amber-500 fill-amber-500 flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {conv.target_profile.toUpperCase()}
              </Badge>
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {messageCount}
              </span>
              {highRatedCount > 0 && (
                <span className="flex items-center gap-1 text-green-600">
                  <Star className="h-3 w-3" />
                  {highRatedCount}
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {format(new Date(conv.updated_at), "d MMM, HH:mm", { locale: es })}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <FileText className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStarred(conv.id, !conv.is_starred);
                }}
              >
                <Star className={`h-4 w-4 mr-2 ${conv.is_starred ? 'fill-amber-500 text-amber-500' : ''}`} />
                {conv.is_starred ? 'Quitar destacado' : 'Destacar'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(conv.id, !conv.is_archived);
                }}
              >
                <Archive className="h-4 w-4 mr-2" />
                {conv.is_archived ? 'Desarchivar' : 'Archivar'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('¿Eliminar esta conversación?')) {
                    onDelete(conv.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <Button 
        variant="outline" 
        className="w-full justify-start gap-2"
        onClick={() => onSelectConversation(null)}
      >
        <Plus className="h-4 w-4" />
        Nueva conversación
      </Button>

      <ScrollArea className="h-[300px]">
        <div className="space-y-2">
          {starredConversations.length > 0 && (
            <>
              <div className="text-xs font-medium text-muted-foreground px-1 pt-2">
                ⭐ Destacadas
              </div>
              {starredConversations.map(renderConversation)}
            </>
          )}

          {regularConversations.length > 0 && (
            <>
              {starredConversations.length > 0 && (
                <div className="text-xs font-medium text-muted-foreground px-1 pt-2">
                  Recientes
                </div>
              )}
              {regularConversations.map(renderConversation)}
            </>
          )}

          {filteredConversations.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No hay conversaciones {showArchived ? 'archivadas' : 'guardadas'}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default SalesConversationsList;
