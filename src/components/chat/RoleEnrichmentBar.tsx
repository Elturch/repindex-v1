import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Theater, ChevronRight, Sparkles } from "lucide-react";
import { 
  CHAT_ROLES, 
  ROLE_CATEGORIES, 
  getFeaturedRoles,
  type ChatRole 
} from "@/lib/chatRoles";

interface RoleEnrichmentBarProps {
  onEnrich: (roleId: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function RoleEnrichmentBar({ 
  onEnrich, 
  disabled = false,
  compact = false 
}: RoleEnrichmentBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAllRoles, setShowAllRoles] = useState(false);

  const featuredRoles = getFeaturedRoles();
  const specializedRoles = CHAT_ROLES.filter(r => r.id !== 'general');

  const handleRoleClick = (roleId: string) => {
    onEnrich(roleId);
    setIsOpen(false);
    setShowAllRoles(false);
  };

  // Group roles by category for the expanded view
  const rolesByCategory = Object.entries(ROLE_CATEGORIES)
    .filter(([key]) => key !== 'general')
    .map(([key, label]) => ({
      key,
      label,
      roles: specializedRoles.filter(r => r.category === key),
    }))
    .filter(group => group.roles.length > 0);

  if (compact) {
    // Compact mode: just show a small hint button
    return (
      <div className="mt-2 pt-2 border-t border-border/30">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-muted-foreground hover:text-foreground gap-1"
              disabled={disabled}
            >
              <Theater className="h-3 w-3" />
              Adaptar respuesta
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <p className="text-xs font-medium mb-2">Adapta a tu rol:</p>
            <div className="grid grid-cols-2 gap-1">
              {featuredRoles.map((role) => (
                <Button
                  key={role.id}
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs justify-start gap-1"
                  onClick={() => handleRoleClick(role.id)}
                >
                  <span>{role.emoji}</span>
                  <span className="truncate">{role.name}</span>
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // Full mode: show enrichment bar with featured roles + "más" button
  return (
    <div className="mt-4 pt-4 border-t border-border/30">
      <div className="flex items-center gap-2 mb-2">
        <Theater className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Generar informe ejecutivo completo
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Pulsa un rol para recibir un <strong>informe expandido</strong> (2500+ palabras) con análisis específico, tablas, riesgos y plan de acción:
      </p>

      <div className="flex flex-wrap gap-2">
        {featuredRoles.map((role) => (
          <Button
            key={role.id}
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 hover:bg-primary/10 hover:border-primary/50"
            onClick={() => handleRoleClick(role.id)}
            disabled={disabled}
          >
            <span>{role.emoji}</span>
            <span>{role.name}</span>
          </Button>
        ))}

        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 hover:bg-accent"
              disabled={disabled}
            >
              <span>+ Más roles</span>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="p-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm">Informes por rol profesional</h4>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Cada rol genera un informe ejecutivo completo con perspectiva específica
              </p>
            </div>
            <ScrollArea className="h-[320px]">
              <div className="p-2">
                {rolesByCategory.map((group, idx) => (
                  <div key={group.key}>
                    {idx > 0 && <Separator className="my-2" />}
                    <div className="px-2 py-1.5">
                      <Badge variant="secondary" className="text-[10px] font-medium">
                        {group.label}
                      </Badge>
                    </div>
                    <div className="space-y-0.5">
                      {group.roles.map((role) => (
                        <Button
                          key={role.id}
                          variant="ghost"
                          className="w-full justify-start h-auto py-2 px-2"
                          onClick={() => handleRoleClick(role.id)}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-base">{role.emoji}</span>
                            <div className="text-left">
                              <div className="text-sm font-medium">{role.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {role.shortDescription}
                              </div>
                            </div>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
