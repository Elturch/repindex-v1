import { useState, KeyboardEvent, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, FileText, Mic, MicOff, Zap, BookOpen, User, AlertCircle } from "lucide-react";
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
  const [depthConfirmed, setDepthConfirmed] = useState(false);
  const [roleConfirmed, setRoleConfirmed] = useState(false);
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

  const canSend = value.trim() && !isLoading && depthConfirmed && roleConfirmed;

  const handleSend = () => {
    if (canSend) {
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
      // Reset confirmations for next message
      setDepthConfirmed(false);
      setRoleConfirmed(false);
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
        <div className={cn(
          "rounded-xl border bg-gradient-to-br from-background to-muted/30 shadow-sm overflow-hidden transition-all duration-300",
          (!depthConfirmed || !roleConfirmed) 
            ? "border-amber-400/50 shadow-amber-500/10" 
            : "border-border"
        )}>
          {/* Header with inline warning */}
          <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border/50">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-semibold text-foreground">
                {tr.configureAnalysis}
              </span>
              {(!depthConfirmed || !roleConfirmed) && (
                <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                  <AlertCircle className="h-2.5 w-2.5" />
                  <span className="hidden sm:inline">Selecciona ambos</span>
                </div>
              )}
            </div>
            {(depthConfirmed && roleConfirmed) && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-background/60 px-2 py-0.5 rounded-full">
                {depthLevel === 'quick' && <><Zap className="h-2.5 w-2.5 text-amber-500" /> ~30s</>}
                {depthLevel === 'complete' && <><FileText className="h-2.5 w-2.5 text-primary" /> ~1min</>}
                {depthLevel === 'exhaustive' && <><BookOpen className="h-2.5 w-2.5 text-purple-500" /> ~2min</>}
                {isRoleSelected && <span className="text-muted-foreground/60 mx-1">•</span>}
                {isRoleSelected && <span>{selectedRole?.emoji} {selectedRole?.name}</span>}
              </div>
            )}
          </div>
          
          {/* Content - Compact inline layout */}
          <div className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-3">
              {/* Depth Selector - inline */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">
                  {tr.depthLabel}:
                </span>
                {!depthConfirmed && (
                  <span className="text-[9px] text-amber-500 font-medium bg-amber-500/10 px-1 py-0.5 rounded shrink-0">
                    ←
                  </span>
                )}
                <TooltipProvider>
                  <ToggleGroup 
                    type="single" 
                    value={depthLevel} 
                    onValueChange={(v) => {
                      if (v) {
                        setDepthLevel(v as DepthLevel);
                        setDepthConfirmed(true);
                      }
                    }}
                    className="flex gap-1"
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ToggleGroupItem 
                          value="quick" 
                          className={cn(
                            "group relative flex items-center gap-1.5 h-8 px-2.5 rounded-md border transition-all duration-200",
                            depthLevel === 'quick' 
                              ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-sm" 
                              : "border-transparent bg-muted/50 hover:bg-muted text-muted-foreground"
                          )}
                        >
                          <Zap className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium hidden sm:inline">{tr.depthQuick}</span>
                          {depthLevel === 'quick' && (
                            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full flex items-center justify-center">
                              <span className="text-[7px] text-white font-bold">✓</span>
                            </div>
                          )}
                        </ToggleGroupItem>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px]">
                        <p className="text-xs">{tr.depthQuickTooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ToggleGroupItem 
                          value="complete" 
                          className={cn(
                            "group relative flex items-center gap-1.5 h-8 px-2.5 rounded-md border transition-all duration-200",
                            depthLevel === 'complete' 
                              ? "border-primary bg-primary/10 text-primary shadow-sm" 
                              : "border-transparent bg-muted/50 hover:bg-muted text-muted-foreground"
                          )}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium hidden sm:inline">{tr.depthComplete}</span>
                          {depthLevel === 'complete' && (
                            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full flex items-center justify-center">
                              <span className="text-[7px] text-primary-foreground font-bold">✓</span>
                            </div>
                          )}
                        </ToggleGroupItem>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px]">
                        <p className="text-xs">{tr.depthCompleteTooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ToggleGroupItem 
                          value="exhaustive" 
                          className={cn(
                            "group relative flex items-center gap-1.5 h-8 px-2.5 rounded-md border transition-all duration-200",
                            depthLevel === 'exhaustive' 
                              ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400 shadow-sm" 
                              : "border-transparent bg-muted/50 hover:bg-muted text-muted-foreground"
                          )}
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium hidden sm:inline">{tr.depthExhaustive}</span>
                          {depthLevel === 'exhaustive' && (
                            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-purple-500 rounded-full flex items-center justify-center">
                              <span className="text-[7px] text-white font-bold">✓</span>
                            </div>
                          )}
                        </ToggleGroupItem>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px]">
                        <p className="text-xs">{tr.depthExhaustiveTooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  </ToggleGroup>
                </TooltipProvider>
              </div>
              
              {/* Separator */}
              <div className="w-px h-6 bg-border hidden sm:block" />

              {/* Separator */}
              <div className="w-px h-6 bg-border hidden sm:block" />

              {/* Role Selector - inline */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">
                  {tr.roleLabel}:
                </span>
                {!roleConfirmed && (
                  <span className="text-[9px] text-amber-500 font-medium bg-amber-500/10 px-1 py-0.5 rounded shrink-0">
                    ←
                  </span>
                )}
                <Select value={selectedRoleId} onValueChange={(v) => {
                  setSelectedRoleId(v);
                  setRoleConfirmed(true);
                }}>
                  <SelectTrigger 
                    className={cn(
                      "h-8 w-auto min-w-[120px] rounded-md border transition-all duration-200 text-xs",
                      isRoleSelected 
                        ? "border-primary bg-primary/10 text-primary shadow-sm" 
                        : roleConfirmed 
                          ? "border-muted-foreground/20 bg-muted/50"
                          : "border-transparent bg-muted/50 hover:bg-muted"
                    )}
                  >
                    <SelectValue>
                      <span className="flex items-center gap-1.5">
                        {isRoleSelected ? (
                          <>
                            <span className="text-sm">{selectedRole?.emoji}</span>
                            <span className="font-medium truncate max-w-[100px]">{selectedRole?.name}</span>
                          </>
                        ) : (
                          <>
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium">{tr.roleGeneral}</span>
                          </>
                        )}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border shadow-xl z-50 rounded-lg">
                    <SelectItem value="general" className="cursor-pointer py-1.5">
                      <span className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5" />
                        <span className="font-medium text-sm">{tr.roleGeneral}</span>
                      </span>
                    </SelectItem>
                    
                    <div className="px-2 py-1 text-[9px] font-bold text-muted-foreground/70 uppercase tracking-wider border-t mt-1 bg-muted/30">
                      ★ {language.code === 'es' ? 'DESTACADOS' : 'FEATURED'}
                    </div>
                    
                    {featuredRoles.map((role) => (
                      <SelectItem key={role.id} value={role.id} className="cursor-pointer py-1.5">
                        <span className="flex items-center gap-2">
                          <span className="text-sm">{role.emoji}</span>
                          <span className="font-medium text-sm">{role.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                    
                    <div className="px-2 py-1 text-[9px] font-bold text-muted-foreground/70 uppercase tracking-wider border-t mt-1 bg-muted/30">
                      ⊕ {language.code === 'es' ? 'TODOS' : 'ALL'}
                    </div>
                    
                    {allRoles.filter(r => r.id !== 'general' && !FEATURED_ROLE_IDS.includes(r.id)).map((role) => (
                      <SelectItem key={role.id} value={role.id} className="cursor-pointer py-1.5">
                        <span className="flex items-center gap-2">
                          <span className="text-sm">{role.emoji}</span>
                          <span className="font-medium text-sm">{role.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
          className={cn(
            "flex-1 min-w-0 resize-none overflow-y-auto min-h-[44px] max-h-[150px]",
            compact && "text-sm min-h-[36px] max-h-[120px]",
            isListening && "border-red-500 ring-1 ring-red-500",
            bulletinModeActive && "border-primary ring-1 ring-primary"
          )}
          style={{ height: 'auto' }}
        />
        <Button
          onClick={handleSend}
          disabled={!canSend}
          size={compact ? "sm" : "default"}
        >
          <Send className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </Button>
      </div>
    </div>
  );
}
