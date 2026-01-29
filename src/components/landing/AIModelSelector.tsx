import { motion } from "framer-motion";
import { useLandingAIModel, AI_MODEL_OPTIONS, AIModelOption } from "@/contexts/LandingAIModelContext";
import { ChatGPTIcon } from "@/components/ui/chatgpt-icon";
import { PerplexityIcon } from "@/components/ui/perplexity-icon";
import { GeminiIcon } from "@/components/ui/gemini-icon";
import { DeepseekIcon } from "@/components/ui/deepseek-icon";
import { GrokIcon } from "@/components/ui/grok-icon";
import { QwenIcon } from "@/components/ui/qwen-icon";
import { cn } from "@/lib/utils";

const MODEL_CONFIG: Record<AIModelOption, { Icon: React.FC<{ className?: string }>; color: string; label: string }> = {
  "ChatGPT": { Icon: ChatGPTIcon, color: "text-chatgpt", label: "ChatGPT" },
  "Perplexity": { Icon: PerplexityIcon, color: "text-perplexity", label: "Perplexity" },
  "Google Gemini": { Icon: GeminiIcon, color: "text-gemini", label: "Gemini" },
  "Deepseek": { Icon: DeepseekIcon, color: "text-deepseek", label: "DeepSeek" },
  "Grok": { Icon: GrokIcon, color: "text-foreground", label: "Grok" },
  "Qwen": { Icon: QwenIcon, color: "text-qwen", label: "Qwen" },
};

export function AIModelSelector() {
  const { selectedModel, setSelectedModel } = useLandingAIModel();

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <p className="text-xs sm:text-sm text-muted-foreground font-medium">
        Selecciona un modelo de IA:
      </p>
      <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
        {AI_MODEL_OPTIONS.map((model) => {
          const config = MODEL_CONFIG[model];
          const isSelected = selectedModel === model;
          
          return (
            <motion.button
              key={model}
              onClick={() => setSelectedModel(model)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-full border transition-all duration-200",
                isSelected
                  ? "bg-primary/20 border-primary shadow-md"
                  : "bg-accent/20 border-border/50 hover:bg-accent/40 hover:border-border"
              )}
            >
              <config.Icon className={cn("w-4 h-4 sm:w-5 sm:h-5", config.color)} />
              <span className={cn(
                "text-xs sm:text-sm font-medium transition-colors",
                isSelected ? "text-primary" : "text-foreground"
              )}>
                {config.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
