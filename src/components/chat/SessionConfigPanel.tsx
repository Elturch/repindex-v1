import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Zap, FileText, BookOpen, User, AlertCircle, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatContext, DepthLevel } from "@/contexts/ChatContext";
import { CHAT_ROLES, getRoleById } from "@/lib/chatRoles";
import { getChatTranslations } from "@/lib/chatTranslations";

// Featured roles for quick selection
const FEATURED_ROLE_IDS = ['ceo', 'journalist', 'analyst', 'investor', 'dircom'];

export function SessionConfigPanel() {
  const { 
    sessionDepthLevel, 
    sessionRoleId, 
    isSessionConfigured,
    configureSession,
    language,
  } = useChatContext();
  
  const [localDepth, setLocalDepth] = useState<DepthLevel>(sessionDepthLevel);
  const [localRoleId, setLocalRoleId] = useState<string>(sessionRoleId);
  const [depthSelected, setDepthSelected] = useState(false);
  const [roleSelected, setRoleSelected] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!isSessionConfigured);
  
  const tr = getChatTranslations(language.code);
  const featuredRoles = CHAT_ROLES.filter(r => FEATURED_ROLE_IDS.includes(r.id));
  const allRoles = CHAT_ROLES;
  const selectedRole = getRoleById(localRoleId);
  const isRoleSelected = localRoleId !== 'general';
  
  // Auto-configure when both are selected
  const handleDepthChange = (value: string) => {
    if (value) {
      setLocalDepth(value as DepthLevel);
      setDepthSelected(true);
      // If role is also selected, auto-configure
      if (roleSelected) {
        configureSession(value as DepthLevel, localRoleId);
        setIsExpanded(false);
      }
    }
  };
  
  const handleRoleChange = (value: string) => {
    setLocalRoleId(value);
    setRoleSelected(true);
    // If depth is also selected, auto-configure
    if (depthSelected) {
      configureSession(localDepth, value);
      setIsExpanded(false);
    }
  };

  // Already configured - show collapsed summary
  if (isSessionConfigured && !isExpanded) {
    const configuredRole = getRoleById(sessionRoleId);
    return (
      <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              {sessionDepthLevel === 'quick' && <><Zap className="h-3.5 w-3.5 text-amber-500" /><span className="text-amber-600 dark:text-amber-400 font-medium">{tr.depthQuick}</span></>}
              {sessionDepthLevel === 'complete' && <><FileText className="h-3.5 w-3.5 text-primary" /><span className="text-primary font-medium">{tr.depthComplete}</span></>}
              {sessionDepthLevel === 'exhaustive' && <><BookOpen className="h-3.5 w-3.5 text-purple-500" /><span className="text-purple-600 dark:text-purple-400 font-medium">{tr.depthExhaustive}</span></>}
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
            Cambiar
          </Button>
        </div>
      </div>
    );
  }

  // Show full configuration panel
  const needsSelection = !depthSelected || !roleSelected;
  
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
              {needsSelection && !isSessionConfigured && (
                <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                  <AlertCircle className="h-2.5 w-2.5" />
                  <span className="hidden sm:inline">Selecciona ambos</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {(depthSelected && roleSelected) && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-background/60 px-2 py-0.5 rounded-full">
                  {localDepth === 'quick' && <><Zap className="h-2.5 w-2.5 text-amber-500" /> ~30s</>}
                  {localDepth === 'complete' && <><FileText className="h-2.5 w-2.5 text-primary" /> ~1min</>}
                  {localDepth === 'exhaustive' && <><BookOpen className="h-2.5 w-2.5 text-purple-500" /> ~2min</>}
                  {isRoleSelected && <span className="text-muted-foreground/60 mx-1">•</span>}
                  {isRoleSelected && <span>{selectedRole?.emoji} {selectedRole?.name}</span>}
                </div>
              )}
              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </CollapsibleTrigger>
        
        {/* Content */}
        <CollapsibleContent>
          <div className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-3">
              {/* Depth Selector */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">
                  {tr.depthLabel}:
                </span>
                {!depthSelected && (
                  <span className="text-[9px] text-amber-500 font-medium bg-amber-500/10 px-1 py-0.5 rounded shrink-0">
                    ←
                  </span>
                )}
                <TooltipProvider>
                  <ToggleGroup 
                    type="single" 
                    value={localDepth} 
                    onValueChange={handleDepthChange}
                    className="flex gap-1"
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ToggleGroupItem 
                          value="quick" 
                          className={cn(
                            "group relative flex items-center gap-1.5 h-8 px-2.5 rounded-md border transition-all duration-200",
                            localDepth === 'quick' 
                              ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-sm" 
                              : "border-transparent bg-muted/50 hover:bg-muted text-muted-foreground"
                          )}
                        >
                          <Zap className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium hidden sm:inline">{tr.depthQuick}</span>
                          {localDepth === 'quick' && depthSelected && (
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
                            localDepth === 'complete' 
                              ? "border-primary bg-primary/10 text-primary shadow-sm" 
                              : "border-transparent bg-muted/50 hover:bg-muted text-muted-foreground"
                          )}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium hidden sm:inline">{tr.depthComplete}</span>
                          {localDepth === 'complete' && depthSelected && (
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
                            localDepth === 'exhaustive' 
                              ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400 shadow-sm" 
                              : "border-transparent bg-muted/50 hover:bg-muted text-muted-foreground"
                          )}
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium hidden sm:inline">{tr.depthExhaustive}</span>
                          {localDepth === 'exhaustive' && depthSelected && (
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

              {/* Role Selector */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">
                  {tr.roleLabel}:
                </span>
                {!roleSelected && (
                  <span className="text-[9px] text-amber-500 font-medium bg-amber-500/10 px-1 py-0.5 rounded shrink-0">
                    ←
                  </span>
                )}
                <Select value={localRoleId} onValueChange={handleRoleChange}>
                  <SelectTrigger 
                    className={cn(
                      "h-8 w-auto min-w-[120px] rounded-md border transition-all duration-200 text-xs",
                      isRoleSelected 
                        ? "border-primary bg-primary/10 text-primary shadow-sm" 
                        : roleSelected 
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
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
