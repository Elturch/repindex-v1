import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { BookOpen, User, AlertCircle, ChevronDown, ChevronUp, Settings2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatContext } from "@/contexts/ChatContext";
import { getRoleById, getEnabledRoles } from "@/lib/chatRoles";
import { getChatTranslations } from "@/lib/chatTranslations";

// Featured roles for quick selection
const FEATURED_ROLE_IDS = ['ceo', 'journalist', 'analyst', 'investor', 'dircom'];

export function SessionConfigPanel() {
  const { 
    sessionRoleId, 
    isSessionConfigured,
    configureSession,
    language,
  } = useChatContext();
  
  const [localRoleId, setLocalRoleId] = useState<string>(sessionRoleId);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const tr = getChatTranslations(language.code);
  const featuredRoles = getEnabledRoles().filter(r => FEATURED_ROLE_IDS.includes(r.id));
  const allRoles = getEnabledRoles();
  const selectedRole = getRoleById(localRoleId);
  const isRoleSelected = localRoleId !== 'general';
  
  const handleRoleChange = (value: string) => {
    setLocalRoleId(value);
    configureSession(value);
    setIsExpanded(false);
  };

  // Already configured - show collapsed summary
  if (isSessionConfigured && !isExpanded) {
    const configuredRole = getRoleById(sessionRoleId);
    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-purple-600 dark:text-purple-400 font-medium">{tr.depthExhaustive}</span>
            </div>
            <span className="text-muted-foreground/50">•</span>
            <div className="flex items-center gap-1.5">
              {configuredRole && sessionRoleId !== 'general' ? (
                <>
                  <span className="text-sm">{configuredRole.emoji}</span>
                  <span className="font-medium">{configuredRole.name}</span>
                </>
              ) : (
                <>
                  <User className="h-3.5 w-3.5" />
                  <span className="font-medium">{tr.roleGeneral}</span>
                </>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(true)}
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="h-3 w-3" />
            {language.code === 'es' ? 'Cambiar' : 'Change'}
          </Button>
        </div>
      </div>
    );
  }

  // Show full configuration panel (only role selector)
  const needsSelection = !isSessionConfigured;
  
  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={cn(
        "rounded-xl border bg-gradient-to-br from-background to-muted/30 shadow-sm overflow-hidden transition-all duration-300",
        needsSelection && !isSessionConfigured
          ? "border-amber-400/50 shadow-amber-500/10" 
          : "border-border"
      )}>
        {/* Header */}
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border/50 cursor-pointer hover:bg-muted/60 transition-colors">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-semibold text-foreground">
                {tr.configureAnalysis}
              </span>
              {needsSelection && (
                <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                  <AlertCircle className="h-2.5 w-2.5" />
                  <span className="hidden sm:inline">{language.code === 'es' ? 'Selecciona perspectiva' : 'Select perspective'}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isRoleSelected && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-background/60 px-2 py-0.5 rounded-full">
                  <BookOpen className="h-2.5 w-2.5 text-purple-500" />
                  <span>~2min</span>
                  <span className="text-muted-foreground/60 mx-1">•</span>
                  <span>{selectedRole?.emoji} {selectedRole?.name}</span>
                </div>
              )}
              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </CollapsibleTrigger>
        
        {/* Content */}
        <CollapsibleContent>
          <div className="px-3 py-3">
            {/* Info about exhaustive analysis */}
            <div className="flex items-center gap-2 mb-3 text-[10px] text-muted-foreground bg-purple-500/10 px-2 py-1.5 rounded-md">
              <Info className="h-3 w-3 text-purple-500 shrink-0" />
              <span>
                {language.code === 'es' 
                  ? 'Todos los análisis son exhaustivos (~2min). Selecciona tu perspectiva profesional:' 
                  : 'All analyses are exhaustive (~2min). Select your professional perspective:'}
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Role Selector */}
              <div className="flex items-center gap-2 w-full">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">
                  {tr.roleLabel}:
                </span>
                <Select value={localRoleId} onValueChange={handleRoleChange}>
                  <SelectTrigger 
                    className={cn(
                      "h-9 flex-1 rounded-md border transition-all duration-200 text-xs",
                      isRoleSelected 
                        ? "border-primary bg-primary/10 text-primary shadow-sm" 
                        : "border-transparent bg-muted/50 hover:bg-muted"
                    )}
                  >
                    <SelectValue>
                      <span className="flex items-center gap-1.5">
                        {isRoleSelected ? (
                          <>
                            <span className="text-sm">{selectedRole?.emoji}</span>
                            <span className="font-medium truncate">{selectedRole?.name}</span>
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
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
