import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { FaRobot, FaChartLine } from "react-icons/fa";
import { useIssuerCount, formatIssuerCount } from "@/hooks/useIssuerCount";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";
import { GrokIcon } from "@/components/ui/grok-icon";
import { QwenIcon } from "@/components/ui/qwen-icon";

const AI_MODELS = [
  { name: "ChatGPT", Icon: ChatGPTIcon, color: "text-chatgpt" },
  { name: "Perplexity", Icon: PerplexityIcon, color: "text-perplexity" },
  { name: "Gemini", Icon: GeminiIcon, color: "text-gemini" },
  { name: "DeepSeek", Icon: DeepseekIcon, color: "text-deepseek" },
  { name: "Grok", Icon: GrokIcon, color: "text-foreground" },
  { name: "Qwen", Icon: QwenIcon, color: "text-qwen" },
];

export function HeroSection() {
  const navigate = useNavigate();
  const { data: issuerCount = 160 } = useIssuerCount();
  
  return (
    <section className="relative py-12 px-4 overflow-hidden bg-gradient-to-b from-background to-accent/5" aria-label="Hero principal">
      <div className="container mx-auto max-w-6xl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.6 }} 
          className="text-center space-y-4"
        >
          {/* Main title */}
          <motion.h1 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.3, duration: 0.6 }} 
            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight max-w-4xl mx-auto leading-tight" 
            style={{ fontSize: 'clamp(1.5rem, 4vw, 3rem)' }}
          >
            El radar reputacional de la era algorítmica
          </motion.h1>

          {/* Subtitle */}
          <motion.p 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.4, duration: 0.6 }} 
            className="text-base sm:text-lg md:text-xl font-semibold text-yellow-500 max-w-3xl mx-auto" 
            style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1.5rem)' }}
          >
            AI Corporate Reputation Authority
          </motion.p>

          {/* AI Models Strip */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.6 }}
            className="flex flex-wrap justify-center items-center gap-3 sm:gap-4 py-4"
          >
            <span className="text-xs sm:text-sm text-muted-foreground font-medium w-full sm:w-auto mb-2 sm:mb-0">
              Consultamos semanalmente:
            </span>
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
              {AI_MODELS.map((model, index) => (
                <motion.div
                  key={model.name}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + index * 0.08, duration: 0.4 }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-accent/20 border border-border/50 hover:bg-accent/40 transition-colors"
                >
                  <model.Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${model.color}`} />
                  <span className="text-xs sm:text-sm font-medium">{model.name}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Answer Capsule - Optimized for AI Search */}
          <motion.p 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.55, duration: 0.6 }} 
            className="text-sm sm:text-base text-muted-foreground max-w-3xl mx-auto px-4 py-3 bg-accent/10 rounded-lg border border-border/50"
            style={{ fontSize: 'clamp(0.75rem, 1.8vw, 0.95rem)' }}
          >
            <strong>RepIndex</strong> mide la <strong>percepción algorítmica</strong>: la probabilidad de que una narrativa corporativa 
            gane tracción en el ecosistema de IA. Cada semana, <strong>6 modelos con búsqueda web real</strong> evalúan 
            a más de <strong>{formatIssuerCount(issuerCount)} empresas españolas</strong> usando 8 métricas, 
            generando el <strong>RIX Score (0-100)</strong>.
          </motion.p>

          {/* Tagline */}
          <motion.p 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.6, duration: 0.6 }} 
            className="text-xs sm:text-sm text-muted-foreground/70 max-w-2xl mx-auto italic" 
          >
            No preguntamos qué opinan las personas. Preguntamos qué dirían las IAs si alguien consultara ahora mismo.
          </motion.p>

          {/* CTAs */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.7, duration: 0.6 }} 
            className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4"
          >
            <Button 
              size="lg" 
              onClick={() => navigate("/dashboard")} 
              className="w-full sm:w-auto group whitespace-nowrap px-6"
            >
              <FaChartLine className="mr-2 flex-shrink-0 group-hover:scale-110 transition-transform" />
              <span className="truncate sm:whitespace-nowrap">Ver el RepIndex</span>
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={() => navigate("/chat")} 
              className="w-full sm:w-auto group"
            >
              <FaRobot className="mr-2 group-hover:scale-110 transition-transform" />
              Agente Rix
            </Button>
          </motion.div>

          {/* Methodology Link */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.6 }}
            className="pt-2"
          >
            <Button 
              variant="link" 
              onClick={() => navigate("/metodologia")} 
              className="text-muted-foreground hover:text-primary text-sm"
            >
              📊 Conoce nuestra metodología →
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
