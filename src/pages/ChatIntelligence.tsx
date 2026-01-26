import { useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Download, Trash2 } from "lucide-react";
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
import { getChatTranslations } from "@/lib/chatTranslations";

export default function ChatIntelligence() {
  const {
    sessionId,
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
    language,
    setLanguage,
  } = useChatContext();
  const pageContext = usePageContext(undefined, language);
  const tr = getChatTranslations(language.code);

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
            {tr.pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tr.pageSubtitle}
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
            {tr.newConversation}
          </Button>
        </div>

        {/* Chat Area */}
        <Card className="shadow-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  {tr.conversation}
                </CardTitle>
                <CardDescription>
                  {tr.assistantDescription}
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
                            {tr.export}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-background border z-50">
                          <DropdownMenuItem onClick={downloadAsTxt}>
                            {tr.downloadTxt}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={downloadAsJson}>
                            {tr.downloadJson}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={downloadAsHtml}>
                            {tr.downloadHtml}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{tr.exportTooltip}</p>
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
              sessionId={sessionId}
              languageCode={language.code}
            />

            {/* Input Area */}
            <div className="mt-4">
              <ChatInput
                onSend={sendMessage}
                isLoading={isLoading}
                language={language}
                onLanguageChange={setLanguage}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
