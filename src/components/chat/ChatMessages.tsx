import { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { CompanyBulletinViewer } from "./CompanyBulletinViewer";
import { RoleEnrichmentBar } from "./RoleEnrichmentBar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, FileText, ExternalLink, AlertTriangle, Loader2, Theater } from "lucide-react";
import { Message } from "@/contexts/ChatContext";
import { useVectorStoreStatus } from "@/hooks/useVectorStoreStatus";
import { getRoleById } from "@/lib/chatRoles";

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  isLoadingHistory: boolean;
  onSuggestedQuestion: (question: string) => void;
  onEnrichResponse?: (roleId: string, messageIndex: number) => void;
  starterPrompts: string[];
  onStarterPrompt: (prompt: string) => void;
  compact?: boolean;
}

export function ChatMessages({
  messages,
  isLoading,
  isLoadingHistory,
  onSuggestedQuestion,
  onEnrichResponse,
  starterPrompts,
  onStarterPrompt,
  compact = false,
}: ChatMessagesProps) {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const vectorStoreStatus = useVectorStoreStatus();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const scrollHeight = compact ? "h-[300px]" : "h-[500px]";
  
  // Vector store repopulating warning banner
  const VectorStoreWarning = () => {
    if (!vectorStoreStatus.isRepopulating) return null;
    
    return (
      <Alert variant="default" className="mb-3 border-amber-500/50 bg-amber-500/10">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
          <AlertDescription className={compact ? "text-[11px]" : "text-xs"}>
            <span className="font-semibold text-amber-600">Actualizando base de conocimiento</span>
            <span className="text-muted-foreground ml-1">
              ({vectorStoreStatus.progress}%) — Las respuestas pueden ser menos precisas temporalmente
            </span>
          </AlertDescription>
        </div>
      </Alert>
    );
  };

  if (isLoadingHistory) {
    return (
      <ScrollArea className={`${scrollHeight} pr-4`}>
        <VectorStoreWarning />
        <div className="space-y-4 py-4">
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-16 w-3/4 ml-auto" />
          <Skeleton className="h-16 w-3/4" />
        </div>
      </ScrollArea>
    );
  }

  if (messages.length === 0) {
    return (
      <ScrollArea className={`${scrollHeight} pr-4`}>
        <VectorStoreWarning />
        <div className="flex flex-col items-center justify-center h-full space-y-4 py-8">
          <div className="text-center space-y-2">
            <Sparkles className={`${compact ? 'h-8 w-8' : 'h-12 w-12'} mx-auto text-primary opacity-70`} />
            <h3 className={`${compact ? 'text-base' : 'text-lg'} font-semibold`}>Comienza una conversación</h3>
            <p className={`${compact ? 'text-xs' : 'text-sm'} text-muted-foreground max-w-md`}>
              Pregunta sobre empresas del IBEX y su reputación según las IAs
            </p>
          </div>
          
          <div className="grid grid-cols-1 gap-2 w-full">
            <p className="text-xs font-medium text-muted-foreground mb-1">Sugerencias:</p>
            {starterPrompts.slice(0, compact ? 3 : 5).map((prompt, idx) => (
              <Button
                key={idx}
                variant="outline"
                className={`justify-start text-left h-auto whitespace-normal ${compact ? 'py-2 px-3' : 'py-3 px-4'} hover:bg-accent`}
                onClick={() => onStarterPrompt(prompt)}
              >
                <span className={`${compact ? 'text-xs leading-tight' : 'text-sm'}`}>{prompt}</span>
              </Button>
            ))}
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className={`${scrollHeight} pr-4`}>
      <VectorStoreWarning />
      <div className="space-y-4">
        {messages.map((message, idx) => (
          <div key={idx} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`${compact ? 'max-w-[90%]' : 'max-w-[80%]'} rounded-lg ${compact ? 'p-3' : 'p-4'} ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border'
              }`}
            >
              {/* Enriched response badge */}
              {message.metadata?.type === 'enriched' && message.metadata?.enrichedFromRole && (
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
                  <Theater className="h-3.5 w-3.5 text-primary" />
                  <Badge variant="secondary" className="text-[10px]">
                    {(() => {
                      const role = getRoleById(message.metadata.enrichedFromRole);
                      return role ? `${role.emoji} ${role.name}` : 'Rol adaptado';
                    })()}
                  </Badge>
                </div>
              )}
              
              {message.role === 'user' ? (
                <div className={`whitespace-pre-wrap ${compact ? 'text-xs' : 'text-sm'}`}>{message.content}</div>
              ) : message.metadata?.type === 'bulletin' ? (
                compact ? (
                  // Compact mode: show link to full chat
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-primary">
                      <FileText className="h-4 w-4" />
                      <span className="text-xs font-semibold">
                        Boletín de {message.metadata?.companyName || 'Empresa'}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Boletín ejecutivo generado correctamente
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs h-8 gap-2"
                      onClick={() => navigate('/chat')}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Ver boletín completo
                    </Button>
                  </div>
                ) : (
                  // Full mode: show complete bulletin viewer
                  <CompanyBulletinViewer 
                    content={message.content}
                    companyName={message.metadata?.companyName}
                  />
                )
              ) : (
                <MarkdownMessage 
                  content={message.content} 
                  showDownload={true}
                />
              )}
              
              {message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
                <div className={`${compact ? 'mt-2 pt-2' : 'mt-4 pt-4'} border-t border-border/50`}>
                  <p className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold mb-2 opacity-80`}>Preguntas sugeridas:</p>
                  <div className="space-y-1">
                    {message.suggestedQuestions.slice(0, compact ? 2 : 3).map((question, qIdx) => (
                      <Button
                        key={qIdx}
                        variant="outline"
                        size="sm"
                        className={`w-full justify-start text-left h-auto whitespace-normal ${compact ? 'py-1.5 px-2 text-[11px] leading-tight' : 'py-2 px-3 text-xs'}`}
                        onClick={() => onSuggestedQuestion(question)}
                        disabled={isLoading}
                      >
                        {question}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Role Enrichment Bar - only for assistant messages that are not bulletins and not already enriched */}
              {message.role === 'assistant' && 
               message.metadata?.type !== 'bulletin' && 
               message.metadata?.type !== 'enriched' &&
               onEnrichResponse && (
                <RoleEnrichmentBar
                  onEnrich={(roleId) => onEnrichResponse(roleId, idx)}
                  disabled={isLoading}
                  compact={compact}
                />
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className={`bg-muted rounded-lg ${compact ? 'p-3' : 'p-4'} ${compact ? 'max-w-[90%]' : 'max-w-[80%]'}`}>
              <div className="flex items-center gap-2">
                <RefreshCw className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-primary animate-spin`} />
                <div>
                  <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-foreground`}>Analizando datos...</span>
                  {!compact && <p className="text-xs text-muted-foreground mt-1">Consultando base de datos</p>}
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}
