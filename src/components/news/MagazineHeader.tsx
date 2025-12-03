import { Calendar, TrendingUp } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface MagazineHeaderProps {
  weekLabel: string;
  publishedAt?: string;
}

export function MagazineHeader({ weekLabel, publishedAt }: MagazineHeaderProps) {
  const formattedDate = publishedAt 
    ? new Date(publishedAt).toLocaleDateString('es-ES', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    : null;

  return (
    <header className="border-b-2 border-foreground pb-4 mb-8">
      {/* Top bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
        <div className="flex items-center gap-4">
          <span className="uppercase tracking-widest font-medium">Boletín Semanal</span>
          <Separator orientation="vertical" className="h-4" />
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formattedDate || weekLabel}
          </span>
        </div>
        <div className="flex items-center gap-1 text-primary">
          <TrendingUp className="h-3 w-3" />
          <span className="font-medium">Edición Nº {getWeekNumber()}</span>
        </div>
      </div>

      {/* Masthead */}
      <div className="text-center py-4">
        <h1 className="text-5xl md:text-6xl font-serif font-bold tracking-tight">
          RepIndex
        </h1>
        <p className="text-sm text-muted-foreground mt-2 tracking-wide uppercase">
          La Autoridad en Reputación Corporativa de las IAs
        </p>
      </div>

      {/* Section labels */}
      <div className="flex justify-center gap-6 text-xs uppercase tracking-widest text-muted-foreground pt-2">
        <span>IBEX-35</span>
        <span>Cotizadas</span>
        <span>Privadas</span>
        <span>Sectores</span>
        <span>Modelos IA</span>
      </div>
    </header>
  );
}

function getWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 604800000;
  return Math.ceil(diff / oneWeek);
}
