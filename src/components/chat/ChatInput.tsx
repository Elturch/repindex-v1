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
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border/50">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-sm font-semibold text-foreground">
                {tr.configureAnalysis}
              </span>
            </div>
            {(depthConfirmed && roleConfirmed) && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background/60 px-2 py-1 rounded-full">
                {depthLevel === 'quick' && <><Zap className="h-3 w-3 text-amber-500" /> ~30s</>}
                {depthLevel === 'complete' && <><FileText className="h-3 w-3 text-primary" /> ~1min</>}
                {depthLevel === 'exhaustive' && <><BookOpen className="h-3 w-3 text-purple-500" /> ~2min</>}
                {isRoleSelected && <span className="text-muted-foreground/60 mx-1">•</span>}
                {isRoleSelected && <span>{selectedRole?.emoji} {selectedRole?.name}</span>}
              </div>
            )}
          </div>
          
          {/* Content */}
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4">
              {/* Depth Selector */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {tr.depthLabel}
                  </span>
                  {!depthConfirmed && (
                    <span className="text-[10px] text-amber-500 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded">
                      ← {language.code === 'es' ? 'Selecciona' : 'Select'}
                    </span>
                  )}
                </div>
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
                    className="grid grid-cols-3 gap-2 w-full"
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ToggleGroupItem 
                          value="quick" 
                          className={cn(
                            "group relative flex flex-col items-center justify-center gap-1 h-16 rounded-lg border-2 transition-all duration-200",
                            depthLevel === 'quick' 
                              ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-md shadow-amber-500/20" 
                              : "border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20 text-muted-foreground"
                          )}
                        >
                          <Zap className={cn(
                            "h-5 w-5 transition-transform group-hover:scale-110",
                            depthLevel === 'quick' ? "text-amber-500" : ""
                          )} />
                          <span className="text-xs font-semibold">{tr.depthQuick}</span>
                          {depthLevel === 'quick' && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full flex items-center justify-center">
                              <span className="text-[8px] text-white font-bold">✓</span>
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
                            "group relative flex flex-col items-center justify-center gap-1 h-16 rounded-lg border-2 transition-all duration-200",
                            depthLevel === 'complete' 
                              ? "border-primary bg-primary/10 text-primary shadow-md shadow-primary/20" 
                              : "border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20 text-muted-foreground"
                          )}
                        >
                          <FileText className={cn(
                            "h-5 w-5 transition-transform group-hover:scale-110",
                            depthLevel === 'complete' ? "text-primary" : ""
                          )} />
                          <span className="text-xs font-semibold">{tr.depthComplete}</span>
                          {depthLevel === 'complete' && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full flex items-center justify-center">
                              <span className="text-[8px] text-primary-foreground font-bold">✓</span>
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
                            "group relative flex flex-col items-center justify-center gap-1 h-16 rounded-lg border-2 transition-all duration-200",
                            depthLevel === 'exhaustive' 
                              ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400 shadow-md shadow-purple-500/20" 
                              : "border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20 text-muted-foreground"
                          )}
                        >
                          <BookOpen className={cn(
                            "h-5 w-5 transition-transform group-hover:scale-110",
                            depthLevel === 'exhaustive' ? "text-purple-500" : ""
                          )} />
                          <span className="text-xs font-semibold">{tr.depthExhaustive}</span>
                          {depthLevel === 'exhaustive' && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full flex items-center justify-center">
                              <span className="text-[8px] text-white font-bold">✓</span>
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

              {/* Role Selector */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {tr.roleLabel}
                  </span>
                  {!roleConfirmed && (
                    <span className="text-[10px] text-amber-500 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded">
                      ← {language.code === 'es' ? 'Selecciona' : 'Select'}
                    </span>
                  )}
                </div>
                <Select value={selectedRoleId} onValueChange={(v) => {
                  setSelectedRoleId(v);
                  setRoleConfirmed(true);
                }}>
                  <SelectTrigger 
                    className={cn(
                      "h-16 rounded-lg border-2 transition-all duration-200",
                      isRoleSelected 
                        ? "border-primary bg-primary/10 text-primary shadow-md shadow-primary/20" 
                        : roleConfirmed 
                          ? "border-muted-foreground/20 bg-muted/50"
                          : "border-transparent bg-muted/50 hover:bg-muted"
                    )}
                  >
                    <SelectValue>
                      <span className="flex items-center gap-2">
                        {isRoleSelected ? (
                          <>
                            <span className="text-lg">{selectedRole?.emoji}</span>
                            <span className="font-semibold truncate">{selectedRole?.name}</span>
                          </>
                        ) : (
                          <>
                            <User className="h-5 w-5 text-muted-foreground" />
                            <span className="font-medium">{tr.roleGeneral}</span>
                          </>
                        )}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border shadow-xl z-50 rounded-lg">
                    <SelectItem value="general" className="cursor-pointer py-2">
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span className="font-medium">{tr.roleGeneral}</span>
                      </span>
                    </SelectItem>
                    
                    <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider border-t mt-1 bg-muted/30">
                      ★ {language.code === 'es' ? 'DESTACADOS' : 'FEATURED'}
                    </div>
                    
                    {featuredRoles.map((role) => (
                      <SelectItem key={role.id} value={role.id} className="cursor-pointer py-2">
                        <span className="flex items-center gap-2">
                          <span className="text-base">{role.emoji}</span>
                          <span className="font-medium">{role.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                    
                    <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider border-t mt-1 bg-muted/30">
                      {language.code === 'es' ? 'TODOS LOS ROLES' : 'ALL ROLES'}
                    </div>
                    
                    {allRoles.filter(r => r.id !== 'general' && !FEATURED_ROLE_IDS.includes(r.id)).map((role) => (
                      <SelectItem key={role.id} value={role.id} className="cursor-pointer py-2">
                        <span className="flex items-center gap-2">
                          <span className="text-base">{role.emoji}</span>
                          <span>{role.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Warning message when not confirmed */}
            {(!depthConfirmed || !roleConfirmed) && (
              <div className="flex items-center gap-2 mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  {tr.selectConfigBeforeSending}
                </span>
              </div>
            )}
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
          disabled={!canSend}
          size={compact ? "sm" : "default"}
        >
          <Send className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </Button>
      </div>
    </div>
  );
}
