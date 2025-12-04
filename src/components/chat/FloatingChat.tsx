import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Minimize2, Maximize2, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useChatContext } from "@/contexts/ChatContext";
import { usePageContext } from "@/hooks/usePageContext";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";

export function FloatingChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    messages,
    isLoading,
    isLoadingHistory,
    sendMessage,
    clearConversation,
    isFloatingOpen,
    setIsFloatingOpen,
    setPageContext,
  } = useChatContext();
  
  const pageContext = usePageContext();
  
  // Check if there's active dynamic context
  const hasDynamicContext = pageContext.suggestions.length > 4 || 
    (location.pathname === '/dashboard') ||
    (location.pathname === '/market-evolution') ||
    (location.pathname.startsWith('/rix-run/'));
  
  // Update page context when location changes
  useEffect(() => {
    setPageContext({
      name: pageContext.name,
      path: pageContext.path,
    });
  }, [pageContext.name, pageContext.path, setPageContext]);

  // Don't show floating chat on the full-page chat route
  if (location.pathname === '/chat') {
    return null;
  }

  const handleOpenFullPage = () => {
    setIsFloatingOpen(false);
    navigate('/chat');
  };

  return (
    <>
      {/* Floating button when closed */}
      <AnimatePresence>
        {!isFloatingOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <Button
              onClick={() => setIsFloatingOpen(true)}
              size="lg"
              className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
            >
              <MessageCircle className="h-6 w-6" />
            </Button>
            {/* Message count badge */}
            {messages.length > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                {messages.filter(m => m.role === 'assistant').length}
              </span>
            )}
            {/* Dynamic context indicator */}
            {hasDynamicContext && messages.length === 0 && (
              <motion.span 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -left-1 h-5 w-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center"
              >
                <Sparkles className="h-3 w-3" />
              </motion.span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating chat window */}
      <AnimatePresence>
        {isFloatingOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-3rem)]"
          >
            <Card className="shadow-2xl border-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">Chat RepIndex</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleOpenFullPage}
                      title="Abrir en pantalla completa"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setIsFloatingOpen(false)}
                      title="Minimizar"
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {/* Page context indicator */}
                <div className="flex items-center justify-between mt-2">
                  <Badge 
                    variant={hasDynamicContext ? "default" : "secondary"} 
                    className={`text-xs gap-1 ${hasDynamicContext ? 'animate-pulse' : ''}`}
                  >
                    {hasDynamicContext && <Sparkles className="h-3 w-3" />}
                    📍 {pageContext.name}
                  </Badge>
                  {messages.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearConversation}
                      className="h-7 text-xs gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      Nueva
                    </Button>
                  )}
                </div>
                
                {/* Dynamic context hint */}
                {hasDynamicContext && messages.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    ✨ Preguntas personalizadas según lo que estás viendo
                  </p>
                )}
              </CardHeader>
              
              <CardContent className="pt-0">
                <ChatMessages
                  messages={messages}
                  isLoading={isLoading}
                  isLoadingHistory={isLoadingHistory}
                  onSuggestedQuestion={sendMessage}
                  starterPrompts={pageContext.suggestions}
                  onStarterPrompt={sendMessage}
                  compact={true}
                />
                
                <div className="mt-3">
                  <ChatInput
                    onSend={sendMessage}
                    isLoading={isLoading}
                    placeholder="Pregunta sobre RepIndex..."
                    compact={true}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
