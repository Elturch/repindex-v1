import { Trash2, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReportMemoryEntry } from "@/lib/reports/reportMemory";

interface ReportMemoryListProps {
  reports: ReportMemoryEntry[];
  activeId: string | null;
  onSelect: (entry: ReportMemoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onNew: () => void;
}

export function ReportMemoryList({
  reports,
  activeId,
  onSelect,
  onRemove,
  onClear,
  onNew,
}: ReportMemoryListProps) {
  return (
    <aside className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Informes cargados
        </h2>
        <span className="text-xs text-muted-foreground">{reports.length}</span>
      </div>

      <Button onClick={onNew} size="sm" className="gap-1.5 justify-start">
        <Plus className="h-3.5 w-3.5" /> Nuevo informe
      </Button>

      <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto pr-1 -mr-1">
        {reports.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-2 py-3">
            Aún no has generado ningún informe.
          </p>
        ) : (
          reports.map((r) => {
            const isActive = r.id === activeId;
            return (
              <div
                key={r.id}
                className={cn(
                  "group relative rounded-md border px-2.5 py-2 text-left transition-colors cursor-pointer",
                  isActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                )}
                onClick={() => onSelect(r)}
              >
                <div className="flex items-start gap-2">
                  <FileText
                    className={cn(
                      "h-3.5 w-3.5 mt-0.5 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{r.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(r.createdAt).toLocaleString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(r.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    aria-label="Eliminar de la memoria"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {reports.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-xs text-muted-foreground gap-1.5 justify-start"
        >
          <Trash2 className="h-3 w-3" /> Limpiar memoria
        </Button>
      )}
    </aside>
  );
}