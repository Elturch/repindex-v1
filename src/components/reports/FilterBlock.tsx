import { ReactNode, useState } from "react";
import { ChevronDown, ChevronRight, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FilterOrigin } from "@/lib/reports/filterState";

interface FilterBlockProps {
  title: string;
  description?: string;
  origin?: FilterOrigin;
  derivedFrom?: string;
  onUnlock?: () => void;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function FilterBlock({
  title,
  description,
  origin = "free",
  derivedFrom,
  onUnlock,
  defaultOpen = true,
  children,
}: FilterBlockProps) {
  const [open, setOpen] = useState(defaultOpen);

  const badgeStyles =
    origin === "user-set"
      ? "bg-primary/10 text-primary border-primary/30"
      : origin === "derived"
      ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
      : "bg-muted text-muted-foreground border-border";

  return (
    <div className="rounded-md border border-border/60 bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="text-sm font-medium truncate">{title}</span>
          <span
            className={cn(
              "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border",
              badgeStyles,
            )}
          >
            {origin === "user-set"
              ? "tú"
              : origin === "derived"
              ? `auto${derivedFrom ? ` · ${derivedFrom}` : ""}`
              : "libre"}
          </span>
        </div>
        {origin === "derived" && onUnlock && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onUnlock();
            }}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Unlock className="h-3 w-3" /> desbloquear
          </span>
        )}
        {origin === "user-set" && (
          <Lock className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {description && open && (
        <p className="px-3 pb-1 text-xs text-muted-foreground">{description}</p>
      )}
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}