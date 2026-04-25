import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

import { MarkdownMessage, generateExportHtml } from "@/components/ui/markdown-message";

import { ResponseFeedback } from "./ResponseFeedback";
import { ReportInfoBar } from "./ReportInfoBar";
import { MethodologyFooter } from "./MethodologyFooter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, Loader2, Theater, Download, ShieldAlert } from "lucide-react";
import { Message } from "@/contexts/ChatContext";
import { useVectorStoreStatus } from "@/hooks/useVectorStoreStatus";
import { useSmartSuggestions } from "@/hooks/useSmartSuggestions";
import { useAuth } from "@/contexts/AuthContext";
import { getRoleById } from "@/lib/chatRoles";
import { getChatTranslations } from "@/lib/chatTranslations";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { isPreviewEnvironment } from "@/lib/agentVersion";

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  isLoadingHistory: boolean;
  loadingMessage?: string;
  onSuggestedQuestion: (question: string) => void;
  onStarterPrompt: (prompt: string) => void;
  compact?: boolean;
  sessionId?: string;
  languageCode?: string;
}

export function ChatMessages({
  messages,
  isLoading,
  isLoadingHistory,
  loadingMessage = "Analizando...",
  onSuggestedQuestion,
  onStarterPrompt,
  compact = false,
  sessionId,
  languageCode = 'es',
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const vectorStoreStatus = useVectorStoreStatus();
  const tr = getChatTranslations(languageCode);
  const { user } = useAuth();
  
  const { toast } = useToast();
  // Streaming metrics + fallback badge are preview-only signals to compare
  // v1 vs v2 side by side; production users never see them.
  const showPreviewSignals = isPreviewEnvironment();

  const downloadMessage = (message: Message) => {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const roleName = message.metadata?.enrichedFromRole ? getRoleById(message.metadata.enrichedFromRole)?.name : undefined;
    const htmlContent = generateExportHtml(
      message.content,
      tr,
      languageCode,
      roleName,
      message.metadata?.verifiedSources,
      message.metadata?.methodology?.periodFrom,
      message.metadata?.methodology?.periodTo,
      message.metadata?.reportContext as Record<string, unknown> | undefined,
    );
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `repindex_informe_${timestamp}.html`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: tr.pdfExported, description: tr.pdfExportedDesc });
  };
  
  // Smart suggestions with live data and personalization
  const { 
    suggestions: smartSuggestions, 
    isLoading: suggestionsLoading, 
    refresh: refreshSuggestions,
    hasPersonalized 
  } = useSmartSuggestions(user?.id || null, languageCode, compact ? 3 : 4);

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
            <span className="font-semibold text-amber-600">{tr.updatingKnowledgeBase}</span>
            <span className="text-muted-foreground ml-1">
              ({vectorStoreStatus.progress}%) — {tr.responsesLessPrecise}
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
      <ScrollArea className={`${scrollHeight} w-full max-w-full min-w-0 overflow-x-hidden pr-0 sm:pr-4`}>
        <VectorStoreWarning />
        <div className="flex h-full w-full min-w-0 max-w-full flex-col items-center justify-start overflow-x-hidden pt-4 pb-2">
          <div className="mb-[100px] w-full min-w-0 max-w-full space-y-2 px-2 text-center sm:px-0">
            <Sparkles className={`${compact ? 'h-8 w-8' : 'h-12 w-12'} mx-auto text-primary opacity-70`} />
            <h3 className={`${compact ? 'text-base' : 'text-xl sm:text-2xl md:text-3xl'} mx-auto max-w-full text-balance break-words font-semibold [overflow-wrap:anywhere]`}>
              {tr.startConversation}
            </h3>
          </div>
          
          <div className="w-full min-w-0 max-w-full space-y-2 overflow-x-hidden">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                {tr.suggestions}
                {hasPersonalized && (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                    ✨ {tr.personalizedLabel}
                  </Badge>
                )}
              </p>
              {!compact && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshSuggestions}
                  disabled={suggestionsLoading}
                  className="h-6 min-w-0 max-w-[52%] px-2 text-xs text-muted-foreground"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${suggestionsLoading ? 'animate-spin' : ''}`} />
                  <span className="min-w-0 truncate">{tr.refreshSuggestions}</span>
                </Button>
              )}
            </div>
            
            <div className="grid grid-cols-1 gap-2">
              {suggestionsLoading ? (
                <>
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </>
              ) : (
                smartSuggestions.map((suggestion, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    className={`w-full max-w-full min-w-0 justify-start text-left h-auto whitespace-normal break-words ${compact ? 'py-2 px-3' : 'py-3 px-4'} hover:bg-accent group animate-fade-in ${
                      suggestion.type === 'vector_insight' 
                        ? 'border-primary/30 bg-primary/5 hover:bg-primary/10' 
                        : ''
                    }`}
                    style={{ animationDelay: `${idx * 0.05}s` }}
                    onClick={() => onStarterPrompt(suggestion.text)}
                  >
                    <span className="mr-2 text-base shrink-0">{suggestion.icon}</span>
                    <span className={`${compact ? 'text-xs leading-tight' : 'text-sm'} flex-1 min-w-0 break-words`}>
                      {suggestion.text}
                    </span>
                    {suggestion.type === 'vector_insight' && !compact && (
                      <Badge variant="default" className="ml-2 text-[9px] shrink-0 bg-primary/20 text-primary border-0">
                        ✨ Live
                      </Badge>
                    )}
                    {suggestion.type === 'personalized' && !compact && (
                      <Badge variant="outline" className="ml-2 text-[9px] opacity-60 shrink-0">
                        {tr.historyLabel}
                      </Badge>
                    )}
                    {suggestion.type === 'discovery' && !compact && (
                      <Badge variant="secondary" className="ml-2 text-[9px] shrink-0">
                        {tr.discoveryLabel}
                      </Badge>
                    )}
                  </Button>
                ))
              )}
            </div>
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
          <div key={idx} className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`relative ${compact ? 'max-w-[90%]' : 'max-w-[85%]'} rounded-lg ${compact ? 'p-3' : 'p-4'} ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : message.metadata?.type === 'guard_rejection'
                    ? 'bg-amber-500/10 border border-amber-500/40 text-foreground'
                    : 'bg-card border border-border'
              }`}
            >
              {/* Agent badge — preview-only A/B signal.
                  Shows "v2" when the message came from chat-intelligence-v2,
                  or "v1 (fallback)" when v2 failed and we re-tried with v1
                  while keeping the toggle on v2. */}
              {message.role === 'assistant' && showPreviewSignals && (
                message.fallbackUsed ? (
                  <div className="mb-2 flex justify-end">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono uppercase tracking-wider border-amber-500/50 text-amber-700 bg-amber-500/5"
                    >
                      v1 (fallback)
                    </Badge>
                  </div>
                ) : message.agentVersion === 'v2' ? (
                  <div className="mb-2 flex justify-end">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono uppercase tracking-wider border-primary/40 text-primary bg-primary/5"
                    >
                      v2
                    </Badge>
                  </div>
                ) : null
              )}

              {/* Guard rejection badge */}
              {message.role === 'assistant' && message.metadata?.type === 'guard_rejection' && (
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-amber-500/30">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                  <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700 bg-amber-500/5">
                    {(() => {
                      switch (message.metadata.guardKind) {
                        case 'predictive': return tr.guardPredictive || 'Consulta predictiva';
                        case 'out_of_scope': return tr.guardOutOfScope || 'Fuera de cobertura';
                        case 'no_data': return tr.guardNoData || 'Sin datos disponibles';
                        case 'greeting': return tr.guardGreeting || 'Bienvenida';
                        case 'off_topic': return tr.guardOffTopic || 'Tema fuera de alcance';
                        default: return tr.guardGeneric || 'Consulta no admitida';
                      }
                    })()}
                  </Badge>
                </div>
              )}

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
              ) : (
                <div className="relative">
                  {/* Report InfoBar — rendered from DataPack metadata, not LLM output */}
                  {message.metadata?.reportContext && !message.isStreaming && (
                    <ReportInfoBar context={message.metadata.reportContext} compact={compact} languageCode={languageCode} />
                  )}
                <MarkdownMessage 
                    content={message.content} 
                    showDownload={!message.isStreaming}
                    languageCode={languageCode}
                    roleName={message.metadata?.enrichedFromRole ? getRoleById(message.metadata.enrichedFromRole)?.name : undefined}
                    verifiedSources={message.metadata?.verifiedSources}
                    periodFrom={message.metadata?.methodology?.periodFrom}
                    periodTo={message.metadata?.methodology?.periodTo}
                    agentVersion={message.agentVersion}
                  />
                  {/* Blinking cursor during streaming */}
                  {message.isStreaming && (
                    <span className="inline-block w-2 h-5 bg-primary animate-pulse ml-0.5 align-text-bottom" />
                  )}
                </div>
              )}
              
              {/* Streaming progress indicator */}
              {message.role === 'assistant' && message.isStreaming && (
                <div className={`${compact ? 'mt-2 pt-2' : 'mt-3 pt-3'} border-t border-border/30`}>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                    <span>{tr.generatingReport || 'Generando informe...'}</span>
                  </div>
                </div>
              )}
              
              {/* Suggested Questions - only show when NOT streaming */}
              {message.role === 'assistant' && !message.isStreaming && message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
                <div className={`${compact ? 'mt-2 pt-2' : 'mt-4 pt-4'} border-t border-border/50`}>
                  <p className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold mb-2 opacity-80`}>{tr.suggestedQuestionsLabel || 'Preguntas sugeridas:'}</p>
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


              {/* Response Feedback - only show when NOT streaming */}
              {message.role === 'assistant' && !message.isStreaming && sessionId && (
                <ResponseFeedback
                  sessionId={sessionId}
                  messageIndex={idx}
                  messageContent={message.content}
                  userQuestion={messages[idx - 1]?.role === 'user' ? messages[idx - 1]?.content : undefined}
                  compact={compact}
                />
              )}

              {/* Methodology Footer - only show when NOT streaming and has RIX data */}
              {message.role === 'assistant' && !message.isStreaming && message.metadata?.methodology?.hasRixData && (
                <MethodologyFooter 
                  metadata={message.metadata.methodology}
                  languageCode={languageCode}
                />
              )}



              {/* Download button — bottom-right of assistant bubbles */}
              {message.role === 'assistant' && !message.isStreaming && (
                <div className={`${compact ? 'mt-2 pt-2' : 'mt-3 pt-3'} border-t border-border/30 flex justify-end`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadMessage(message)}
                    className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {!compact && <span className="text-[11px] font-medium">{tr.downloadReport}</span>}
                  </Button>
                </div>
              )}
            </div>
            {/* Streaming metrics — preview-only diagnostic shown beneath
                each assistant bubble so we can compare v1 vs v2 latency. */}
            {message.role === 'assistant' &&
              !message.isStreaming &&
              showPreviewSignals &&
              message.streamMetrics && (
                <div className="mt-1 px-1 text-[10px] font-mono text-muted-foreground/70">
                  {(message.fallbackUsed ? 'v1 (fallback)' : (message.agentVersion ?? 'v1'))}
                  {' | TTFB: '}
                  {message.streamMetrics.latencyMs !== null
                    ? `${(message.streamMetrics.latencyMs / 1000).toFixed(1)}s`
                    : 'n/a'}
                  {' | Total: '}
                  {(message.streamMetrics.totalMs / 1000).toFixed(1)}s
                  {' | '}
                  {message.streamMetrics.chunksCount} chunks
                </div>
              )}
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className={`bg-muted rounded-lg ${compact ? 'p-3' : 'p-4'} ${compact ? 'max-w-[90%]' : 'max-w-[80%]'}`}>
              <div className="flex items-center gap-2">
                <RefreshCw className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-primary animate-spin`} />
                <div>
                  <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-foreground transition-all duration-300`}>
                    {loadingMessage}
                  </span>
                  {!compact && <p className="text-xs text-muted-foreground mt-1">{tr.consultingDatabase}</p>}
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
