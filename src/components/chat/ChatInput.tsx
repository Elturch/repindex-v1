import { useState, KeyboardEvent, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, FileText, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { LanguageSelector } from "./LanguageSelector";
import { SessionConfigPanel } from "./SessionConfigPanel";
import { ChatLanguage } from "@/lib/chatLanguages";
import { getChatTranslations } from "@/lib/chatTranslations";
import { useChatContext } from "@/contexts/ChatContext";

export type DepthLevel = 'quick' | 'complete' | 'exhaustive';

interface ChatInputProps {
  onSend: (message: string, options?: { bulletinMode?: boolean; depthLevel?: DepthLevel; roleId?: string }) => void;
  isLoading: boolean;
  placeholder?: string;
  compact?: boolean;
  language: ChatLanguage;
  onLanguageChange: (language: ChatLanguage) => void;
}

// Extend Window interface for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export function ChatInput({ 
  onSend, 
  isLoading, 
  placeholder,
  compact = false,
  language,
  onLanguageChange 
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [bulletinModeActive, setBulletinModeActive] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tr = getChatTranslations(language.code);

  // Get session configuration from context
  const { sessionDepthLevel, sessionRoleId, isSessionConfigured } = useChatContext();

  // Auto-resize textarea as user types
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const maxHeight = compact ? 120 : 220;
      const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${nextHeight}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [value]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language.speechCode;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let _interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            _interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          setValue(prev => prev + finalTranscript);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [language.speechCode]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Can send only if text is present AND session is configured
  const canSend = value.trim() && !isLoading && isSessionConfigured;

  const handleSend = () => {
    if (canSend) {
      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
      }
      // Use session configuration from context (NOT local state)
      onSend(value.trim(), { 
        bulletinMode: bulletinModeActive, 
        depthLevel: sessionDepthLevel,
        roleId: sessionRoleId !== 'general' ? sessionRoleId : undefined
      });
      setValue("");
      setBulletinModeActive(false);
      // NOTE: We do NOT reset session configuration - it persists for entire conversation
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBulletinClick = () => {
    if (!isLoading) {
      setBulletinModeActive(true);
      setValue(tr.bulletinPromptPrefix);
    }
  };

  // Reset bulletin mode if user clears input or removes the bulletin prefix
  useEffect(() => {
    if (bulletinModeActive && !value.toLowerCase().includes('boletín')) {
      setBulletinModeActive(false);
    }
  }, [value, bulletinModeActive]);

  return (
    <div className="space-y-3">
      {/* Session Configuration Panel - uses context, shown only on non-compact mode */}
      {!compact && <SessionConfigPanel />}
      
      <div className="flex gap-2">
        {/* Language Selector */}
        <LanguageSelector
          selectedLanguage={language}
          onLanguageChange={onLanguageChange}
          compact={compact}
          disabled={isLoading}
        />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={bulletinModeActive ? "default" : "outline"}
                size={compact ? "sm" : "default"}
                onClick={handleBulletinClick}
                disabled={isLoading}
                className={cn(
                  "shrink-0 transition-all",
                  bulletinModeActive && "bg-primary text-primary-foreground"
                )}
              >
                <FileText className={compact ? "h-4 w-4" : "h-5 w-5"} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{tr.generateBulletin}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {speechSupported && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isListening ? "default" : "outline"}
                  size={compact ? "sm" : "default"}
                  onClick={toggleListening}
                  disabled={isLoading}
                  className={cn(
                    "shrink-0 transition-all",
                    isListening && "bg-red-500 hover:bg-red-600 animate-pulse"
                  )}
                >
                  {isListening ? (
                    <MicOff className={compact ? "h-4 w-4" : "h-5 w-5"} />
                  ) : (
                    <Mic className={compact ? "h-4 w-4" : "h-5 w-5"} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{isListening ? tr.stopDictation : tr.dictateMessage}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onInput={adjustTextareaHeight}
          onKeyDown={handleKeyDown}
          placeholder={bulletinModeActive ? tr.inputPlaceholderBulletin : (isListening ? tr.inputListening : (placeholder || tr.inputPlaceholder))}
          disabled={isLoading}
          className={cn(
            "flex-1 min-w-0 resize-none overflow-hidden !min-h-[44px] max-h-[220px]",
            compact && "text-sm !min-h-[36px] max-h-[120px]",
            isListening && "border-red-500 ring-1 ring-red-500",
            bulletinModeActive && "border-primary ring-1 ring-primary"
          )}
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleSend}
                disabled={!canSend}
                size={compact ? "sm" : "default"}
              >
                <Send className={compact ? "h-4 w-4" : "h-5 w-5"} />
              </Button>
            </TooltipTrigger>
            {!isSessionConfigured && value.trim() && (
              <TooltipContent side="top">
                <p className="text-xs">Selecciona tu perspectiva profesional para enviar</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
