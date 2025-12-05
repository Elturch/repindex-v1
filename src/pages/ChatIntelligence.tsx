import { useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, Download, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useChatContext } from "@/contexts/ChatContext";
import { usePageContext } from "@/hooks/usePageContext";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";

export default function ChatIntelligence() {
  const {
    messages,
    isLoading,
    isLoadingHistory,
    sendMessage,
    clearConversation,
    setPageContext,
    setIsFloatingOpen,
    downloadAsTxt,
    downloadAsJson,
    downloadAsHtml,
  } = useChatContext();

  const pageContext = usePageContext();

  // Update page context and close floating chat when on full page
  useEffect(() => {
    setPageContext({
      name: pageContext.name,
      path: pageContext.path,
    });
    setIsFloatingOpen(false);
  }, [pageContext.name, pageContext.path, setPageContext, setIsFloatingOpen]);

  return (
    <Layout title="RepIndex.ai">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Agente Rix
          </h1>
          <p className="text-sm text-muted-foreground">
            Pregunta sobre empresas, tendencias, comparaciones y análisis de reputación
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={clearConversation}
            disabled={messages.length === 0}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Nueva Conversación
          </Button>
        </div>

        {/* Chat Area */}
        <Card className="shadow-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Conversación
                </CardTitle>
                <CardDescription>
                  Tu asistente inteligente para analizar datos de RepIndex
                </CardDescription>
              </div>
              
              {messages.length > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2">
                            <Download className="h-4 w-4" />
                            Exportar
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-background border z-50">
                          <DropdownMenuItem onClick={downloadAsTxt}>
                            Descargar como TXT
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={downloadAsJson}>
                            Descargar como JSON
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={downloadAsHtml}>
                            Descargar como HTML
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Guardar conversación para imprimir o compartir</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ChatMessages
              messages={messages}
              isLoading={isLoading}
              isLoadingHistory={isLoadingHistory}
              onSuggestedQuestion={sendMessage}
              starterPrompts={pageContext.suggestions}
              onStarterPrompt={sendMessage}
              compact={false}
            />

            {/* Input Area */}
            <div className="mt-4">
              <ChatInput
                onSend={sendMessage}
                isLoading={isLoading}
                placeholder="Pregunta al Agente Rix sobre empresas, rankings o tendencias..."
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
