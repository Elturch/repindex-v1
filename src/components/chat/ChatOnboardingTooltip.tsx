import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, MessageCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "repindex-chat-onboarding-seen";

interface ChatOnboardingTooltipProps {
  onDismiss: () => void;
}

export function ChatOnboardingTooltip({ onDismiss }: ChatOnboardingTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem(STORAGE_KEY);
    if (!hasSeen) {
      // Small delay to let the page load first
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (isVisible) {
      // Auto-dismiss after 12 seconds
      const timer = setTimeout(() => handleDismiss(), 12000);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(STORAGE_KEY, "true");
    onDismiss();
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="absolute bottom-full right-0 mb-3 w-72 z-50"
        >
          <div className="bg-card border-2 border-primary/20 rounded-xl shadow-xl p-4 relative">
            {/* Arrow pointing down */}
            <div className="absolute -bottom-2 right-6 w-4 h-4 bg-card border-r-2 border-b-2 border-primary/20 transform rotate-45" />
            
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-6 w-6"
              onClick={handleDismiss}
            >
              <X className="h-3 w-3" />
            </Button>

            {/* Content */}
            <div className="pr-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <h4 className="font-semibold text-sm">¡Hola! Soy el Agente Rix</h4>
                </div>
              
              <p className="text-xs text-muted-foreground mb-3">
                Pregúntame sobre los datos que estás viendo. Puedo:
              </p>
              
              <ul className="space-y-1.5 text-xs mb-3">
                <li className="flex items-center gap-2">
                  <MessageCircle className="h-3 w-3 text-primary" />
                  <span>Analizar empresas y comparar competidores</span>
                </li>
                <li className="flex items-center gap-2">
                  <FileText className="h-3 w-3 text-primary" />
                  <span>Generar boletines ejecutivos personalizados</span>
                </li>
              </ul>

              <Button 
                size="sm" 
                className="w-full text-xs h-8"
                onClick={handleDismiss}
              >
                ¡Entendido!
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function useChatOnboardingSeen() {
  const [hasSeen, setHasSeen] = useState(true);

  useEffect(() => {
    setHasSeen(!!localStorage.getItem(STORAGE_KEY));
  }, []);

  return hasSeen;
}
