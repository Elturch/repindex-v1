import { useState, KeyboardEvent, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, FileText, Mic, MicOff, Zap, BookOpen, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { LanguageSelector } from "./LanguageSelector";
import { ChatLanguage } from "@/lib/chatLanguages";
import { getChatTranslations } from "@/lib/chatTranslations";
import { CHAT_ROLES, getRoleById } from "@/lib/chatRoles";

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

// Featured roles for quick selection
const FEATURED_ROLE_IDS = ['ceo', 'journalist', 'analyst', 'investor', 'dircom'];

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
  const [depthLevel, setDepthLevel] = useState<DepthLevel>('complete');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('general');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tr = getChatTranslations(language.code);

  // Get featured roles
  const featuredRoles = CHAT_ROLES.filter(r => FEATURED_ROLE_IDS.includes(r.id));
  const allRoles = CHAT_ROLES;

  // Auto-resize textarea as user types
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = compact ? 120 : 150;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
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
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
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

  const handleSend = () => {
    if (value.trim() && !isLoading) {
      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
      }
      // Send with bulletinMode, depthLevel, and roleId
      onSend(value.trim(), { 
        bulletinMode: bulletinModeActive, 
        depthLevel,
        roleId: selectedRoleId !== 'general' ? selectedRoleId : undefined
      });
      setValue("");
      setBulletinModeActive(false);
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

  const selectedRole = getRoleById(selectedRoleId);
  const isRoleSelected = selectedRoleId !== 'general';

  return (
    <div className="space-y-3">
      {/* Configuration Panel - Depth + Role */}
      {!compact && (
        <div className="bg-muted/50 rounded-lg p-3 border border-border/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground flex items-center gap-2">
              📊 {tr.configureAnalysis}
            </span>
            <span className="text-xs text-muted-foreground">
              {depthLevel === 'quick' && '⚡ ~30s'}
              {depthLevel === 'complete' && '📋 ~1min'}
              {depthLevel === 'exhaustive' && '📚 ~2min'}
              {isRoleSelected && ` • ${selectedRole?.emoji} ${selectedRole?.name}`}
            </span>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Depth Selector */}
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1.5 font-medium">{tr.depthLabel}</div>
              <TooltipProvider>
                <ToggleGroup 
                  type="single" 
                  value={depthLevel} 
                  onValueChange={(v) => v && setDepthLevel(v as DepthLevel)}
                  className="w-full grid grid-cols-3 gap-1.5"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem 
                        value="quick" 
                        className={cn(
                          "flex flex-col items-center gap-0.5 h-auto py-2 px-2 rounded-md border transition-all text-xs",
                          depthLevel === 'quick' 
                            ? "bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-400 shadow-sm" 
                            : "bg-background border-border hover:bg-muted hover:border-muted-foreground/30"
                        )}
                      >
                        <Zap className={cn(
                          "h-4 w-4",
                          depthLevel === 'quick' ? "text-amber-500" : "text-muted-foreground"
                        )} />
                        <span className="font-medium">{tr.depthQuick}</span>
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px]">
                      <p className="text-xs font-medium">{tr.depthQuickTooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem 
                        value="complete" 
                        className={cn(
                          "flex flex-col items-center gap-0.5 h-auto py-2 px-2 rounded-md border transition-all text-xs",
                          depthLevel === 'complete' 
                            ? "bg-primary/20 border-primary text-primary shadow-sm" 
                            : "bg-background border-border hover:bg-muted hover:border-muted-foreground/30"
                        )}
                      >
                        <FileText className={cn(
                          "h-4 w-4",
                          depthLevel === 'complete' ? "text-primary" : "text-muted-foreground"
                        )} />
                        <span className="font-medium">{tr.depthComplete}</span>
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px]">
                      <p className="text-xs font-medium">{tr.depthCompleteTooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem 
                        value="exhaustive" 
                        className={cn(
                          "flex flex-col items-center gap-0.5 h-auto py-2 px-2 rounded-md border transition-all text-xs",
                          depthLevel === 'exhaustive' 
                            ? "bg-purple-500/20 border-purple-500 text-purple-700 dark:text-purple-400 shadow-sm" 
                            : "bg-background border-border hover:bg-muted hover:border-muted-foreground/30"
                        )}
                      >
                        <BookOpen className={cn(
                          "h-4 w-4",
                          depthLevel === 'exhaustive' ? "text-purple-500" : "text-muted-foreground"
                        )} />
                        <span className="font-medium">{tr.depthExhaustive}</span>
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px]">
                      <p className="text-xs font-medium">{tr.depthExhaustiveTooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </ToggleGroup>
              </TooltipProvider>
            </div>

            {/* Role Selector */}
            <div className="sm:w-48">
              <div className="text-xs text-muted-foreground mb-1.5 font-medium">{tr.roleLabel}</div>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger 
                  className={cn(
                    "w-full h-auto py-2 transition-all",
                    isRoleSelected 
                      ? "border-primary bg-primary/10 text-primary" 
                      : "border-border"
                  )}
                >
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      {isRoleSelected ? (
                        <>
                          <span>{selectedRole?.emoji}</span>
                          <span className="truncate">{selectedRole?.name}</span>
                        </>
                      ) : (
                        <>
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{tr.roleGeneral}</span>
                        </>
                      )}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border shadow-lg z-50">
                  <SelectItem value="general" className="cursor-pointer">
                    <span className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span>{tr.roleGeneral}</span>
                    </span>
                  </SelectItem>
                  
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                    ★ {language.code === 'es' ? 'DESTACADOS' : 'FEATURED'}
                  </div>
                  
                  {featuredRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id} className="cursor-pointer">
                      <span className="flex items-center gap-2">
                        <span>{role.emoji}</span>
                        <span>{role.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                  
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">
                    {language.code === 'es' ? 'TODOS LOS ROLES' : 'ALL ROLES'}
                  </div>
                  
                  {allRoles.filter(r => r.id !== 'general' && !FEATURED_ROLE_IDS.includes(r.id)).map((role) => (
                    <SelectItem key={role.id} value={role.id} className="cursor-pointer">
                      <span className="flex items-center gap-2">
                        <span>{role.emoji}</span>
                        <span>{role.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
      
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
          onKeyDown={handleKeyDown}
          placeholder={bulletinModeActive ? tr.inputPlaceholderBulletin : (isListening ? tr.inputListening : (placeholder || tr.inputPlaceholder))}
          disabled={isLoading}
          rows={1}
          className={cn(
            "flex-1 min-w-0 resize-none overflow-y-auto min-h-[40px]",
            compact && "text-sm min-h-[36px]",
            isListening && "border-red-500 ring-1 ring-red-500",
            bulletinModeActive && "border-primary ring-1 ring-primary"
          )}
        />
        <Button
          onClick={handleSend}
          disabled={!value.trim() || isLoading}
          size={compact ? "sm" : "default"}
        >
          <Send className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </Button>
      </div>
    </div>
  );
}
