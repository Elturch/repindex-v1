import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Globe } from "lucide-react";
import { CHAT_LANGUAGES, ChatLanguage } from "@/lib/chatLanguages";
import { cn } from "@/lib/utils";

interface LanguageSelectorProps {
  selectedLanguage: ChatLanguage;
  onLanguageChange: (language: ChatLanguage) => void;
  compact?: boolean;
  disabled?: boolean;
}

export function LanguageSelector({ 
  selectedLanguage, 
  onLanguageChange, 
  compact = false,
  disabled = false 
}: LanguageSelectorProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <DropdownMenu>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size={compact ? "sm" : "default"}
                disabled={disabled}
                className={cn(
                  "shrink-0 gap-1.5 transition-all",
                  compact && "px-2"
                )}
              >
                <span className="text-base">{selectedLanguage.flag}</span>
                {!compact && (
                  <Globe className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <DropdownMenuContent align="start" className="w-48 max-h-80 overflow-y-auto">
            {CHAT_LANGUAGES.map((language) => (
              <DropdownMenuItem
                key={language.code}
                onSelect={() => onLanguageChange(language)}
                className={cn(
                  "cursor-pointer gap-2",
                  selectedLanguage.code === language.code && "bg-primary/10"
                )}
              >
                <span className="text-lg">{language.flag}</span>
                <span className="flex-1">{language.nativeName}</span>
                {selectedLanguage.code === language.code && (
                  <span className="text-primary text-xs">✓</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipContent side="top">
          <p className="text-xs">Idioma de la conversación: {selectedLanguage.nativeName}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
