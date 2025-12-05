import { useState, KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, FileText } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
  compact?: boolean;
}

export function ChatInput({ onSend, isLoading, placeholder = "Escribe tu pregunta...", compact = false }: ChatInputProps) {
  const [value, setValue] = useState("");

  const handleSend = () => {
    if (value.trim() && !isLoading) {
      onSend(value.trim());
      setValue("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBulletinClick = () => {
    if (!isLoading) {
      onSend("¿De qué empresa quieres el informe?");
    }
  };

  return (
    <div className="flex gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size={compact ? "sm" : "default"}
              onClick={handleBulletinClick}
              disabled={isLoading}
              className="shrink-0"
            >
              <FileText className={compact ? "h-4 w-4" : "h-5 w-5"} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Generar boletín ejecutivo</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isLoading}
        className={`flex-1 min-w-0 ${compact ? "text-sm" : ""}`}
      />
      <Button
        onClick={handleSend}
        disabled={!value.trim() || isLoading}
        size={compact ? "sm" : "default"}
      >
        <Send className={compact ? "h-4 w-4" : "h-5 w-5"} />
      </Button>
    </div>
  );
}
