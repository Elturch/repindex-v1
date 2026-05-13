import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FilterPanel } from "./FilterPanel";
import { LivePreview } from "./LivePreview";
import { FilterState } from "@/lib/reports/filterState";
import { runCoherence, CompanyMeta } from "@/lib/reports/coherenceEngine";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFilters: FilterState;
  companies: CompanyMeta[];
  lastBatchDate: string | null;
  isRegenerating: boolean;
  onRegenerate: (filters: FilterState) => void;
  onDuplicateAndEdit: (filters: FilterState) => void;
}

export function RegenerateDialog({
  open,
  onOpenChange,
  initialFilters,
  companies,
  lastBatchDate,
  isRegenerating,
  onRegenerate,
  onDuplicateAndEdit,
}: Props) {
  const [state, setState] = useState<FilterState>(initialFilters);

  // Re-seed local state every time the dialog is (re)opened with a new report.
  useEffect(() => {
    if (open) setState(initialFilters);
  }, [open, initialFilters]);

  const coherence = useMemo(() => runCoherence(state, companies), [state, companies]);
  const hasErrors = coherence.warnings.some((w) => w.level === "error");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" /> Regenerar informe
          </DialogTitle>
          <DialogDescription>
            Filtros del informe original pre-rellenados. Modifícalos si lo deseas
            (fechas, modelos, universo, etc.) y pulsa "Regenerar" para lanzar una
            nueva ejecución con la versión actual del agente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 flex-1 overflow-hidden">
          <div className="overflow-y-auto pr-2 max-h-[60vh] lg:max-h-[65vh]">
            <FilterPanel
              state={coherence.state}
              setState={setState}
              companies={companies}
              hiddenFilters={coherence.hiddenFilters}
              lastBatchDate={lastBatchDate}
            />
          </div>
          <div className="overflow-y-auto max-h-[60vh] lg:max-h-[65vh]">
            <LivePreview
              state={coherence.state}
              warnings={coherence.warnings}
              companies={companies}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onDuplicateAndEdit(coherence.state)}
            disabled={isRegenerating}
            className="gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" /> Duplicar y editar
          </Button>
          <Button
            onClick={() => onRegenerate(coherence.state)}
            disabled={isRegenerating || hasErrors}
            className="gap-1.5"
          >
            {isRegenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Regenerar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}