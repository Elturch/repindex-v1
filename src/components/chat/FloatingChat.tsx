import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Minimize2, Maximize2, Trash2, Sparkles, Lock, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useChatContext } from "@/contexts/ChatContext";
import { usePageContext } from "@/hooks/usePageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUserNotifications } from "@/hooks/useUserNotifications";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { ChatOnboardingTooltip, useChatOnboardingSeen } from "./ChatOnboardingTooltip";
import { NotificationsPanel } from "./NotificationsPanel";
import { isDevOrPreview } from "@/lib/env";

export function FloatingChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    sessionId,
    messages,
    isLoading,
    isLoadingHistory,
    sendMessage,
    enrichResponse,
    clearConversation,
    isFloatingOpen,
    setIsFloatingOpen,
    setPageContext,
  } = useChatContext();
  
  const { isAuthenticated } = useAuth();
  const pageContext = usePageContext();
  const hasSeenOnboarding = useChatOnboardingSeen();
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    dismissNotification 
  } = useUserNotifications();
  
  // State for expanded button text
  const [isButtonExpanded, setIsButtonExpanded] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const lastInteractionRef = useRef<number>(Date.now());
  
  // Check if there's active dynamic context
  const hasDynamicContext = pageContext.suggestions.length > 4 || 
    (location.pathname === '/dashboard') ||
    (location.pathname === '/market-evolution') ||
    (location.pathname.startsWith('/rix-run/'));
  
  // Get context-aware label for the button
  const getContextLabel = () => {
    if (location.pathname === '/dashboard') return "Dashboard";
    if (location.pathname === '/market-evolution') return "Evolución";
    if (location.pathname === '/noticias') return "Noticias";
    if (location.pathname.startsWith('/rix-run/')) return "Análisis";
    return "RepIndex";
  };

  // Collapse button after inactivity
  useEffect(() => {
    if (!isFloatingOpen && isButtonExpanded) {
      const timer = setTimeout(() => {
        setIsButtonExpanded(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isFloatingOpen, isButtonExpanded]);

  // Re-expand button on route change
  useEffect(() => {
    setIsButtonExpanded(true);
    lastInteractionRef.current = Date.now();
  }, [location.pathname]);

  // Show onboarding tooltip if not seen
  useEffect(() => {
    if (!hasSeenOnboarding && !isFloatingOpen) {
      const timer = setTimeout(() => setShowOnboarding(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [hasSeenOnboarding, isFloatingOpen]);
  
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

  const handleOpenChat = () => {
    setIsFloatingOpen(true);
    setShowOnboarding(false);
    // Auto-show notifications panel if there are unread notifications
    if (unreadCount > 0) {
      setShowNotifications(true);
    }
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
            {/* Onboarding tooltip */}
            {showOnboarding && (
              <ChatOnboardingTooltip onDismiss={() => setShowOnboarding(false)} />
            )}
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.div
                    animate={hasDynamicContext ? {
                      boxShadow: [
                        "0 0 0 0 hsl(var(--primary) / 0)",
                        "0 0 0 8px hsl(var(--primary) / 0.15)",
                        "0 0 0 0 hsl(var(--primary) / 0)"
                      ]
                    } : {}}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="rounded-full"
                  >
                    <Button
                      onClick={handleOpenChat}
                      size="lg"
                      className={`
                        shadow-lg hover:shadow-xl transition-all duration-300
                        ${isButtonExpanded 
                          ? 'h-12 px-4 rounded-full gap-2' 
                          : 'h-14 w-14 rounded-full'
                        }
                        ${hasDynamicContext ? 'chat-glow' : ''}
                      `}
                    >
                      {hasDynamicContext ? (
                        <Sparkles className="h-5 w-5" />
                      ) : (
                        <Bot className="h-5 w-5" />
                      )}
                      {isButtonExpanded && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: "auto" }}
                          exit={{ opacity: 0, width: 0 }}
                          className="text-sm font-medium whitespace-nowrap overflow-hidden"
                        >
                          {hasDynamicContext 
                            ? `Pregunta sobre ${getContextLabel()}`
                            : "Pregunta al Agente Rix"
                          }
                        </motion.span>
                      )}
                    </Button>
                  </motion.div>
                </TooltipTrigger>
                {!isButtonExpanded && (
                  <TooltipContent side="left" className="max-w-[200px]">
                    <p className="text-xs">
                      {hasDynamicContext 
                        ? `✨ Tengo contexto sobre ${getContextLabel()}`
                        : "Agente Rix"
                      }
                    </p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            
            {/* Notification badge */}
            {unreadCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1"
              >
                <Badge 
                  variant="destructive" 
                  className="h-5 min-w-5 px-1.5 text-xs font-bold animate-pulse"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              </motion.div>
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
            className="fixed bottom-6 right-6 z-50 w-[480px] max-w-[calc(100vw-3rem)]"
          >
            <Card className="shadow-2xl border-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">Agente Rix</CardTitle>
                    {unreadCount > 0 && (
                      <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                        {unreadCount}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {notifications.length > 0 && (
                      <Button
                        variant={showNotifications ? "secondary" : "ghost"}
                        size="icon"
                        className="h-8 w-8 relative"
                        onClick={() => setShowNotifications(!showNotifications)}
                        title="Notificaciones"
                      >
                        <Bell className="h-4 w-4" />
                        {unreadCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-destructive rounded-full" />
                        )}
                      </Button>
                    )}
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
                {/* Notifications Panel */}
                <AnimatePresence>
                  {showNotifications && notifications.length > 0 && (
                    <NotificationsPanel
                      notifications={notifications}
                      onMarkAsRead={markAsRead}
                      onMarkAllAsRead={markAllAsRead}
                      onDismiss={dismissNotification}
                      onClose={() => setShowNotifications(false)}
                    />
                  )}
                </AnimatePresence>
                {(isAuthenticated || isDevOrPreview()) ? (
                  <>
                    <ChatMessages
                      messages={messages}
                      isLoading={isLoading}
                      isLoadingHistory={isLoadingHistory}
                      onSuggestedQuestion={sendMessage}
                      onEnrichResponse={enrichResponse}
                      starterPrompts={pageContext.suggestions}
                      onStarterPrompt={sendMessage}
                      compact={true}
                      sessionId={sessionId}
                    />
                    
                    <div className="mt-3">
                      <ChatInput
                        onSend={sendMessage}
                        isLoading={isLoading}
                        placeholder="Pregunta al Agente Rix..."
                        compact={true}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Lock className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-sm font-medium text-foreground mb-2">
                      El Agente Rix es solo para usuarios registrados
                    </p>
                    <p className="text-xs text-muted-foreground mb-4">
                      Accede a tu cuenta para usar el Agente Rix
                    </p>
                    <Button 
                      onClick={() => {
                        setIsFloatingOpen(false);
                        navigate('/login');
                      }}
                      size="sm"
                    >
                      Acceder
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
