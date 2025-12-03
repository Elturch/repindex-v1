import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MagazineHeaderProps {
  weekLabel: string;
  publishedAt?: string;
}

export function MagazineHeader({ weekLabel, publishedAt }: MagazineHeaderProps) {
  const formattedDate = publishedAt 
    ? format(new Date(publishedAt), "d 'de' MMMM 'de' yyyy", { locale: es })
    : format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });

  const handlePrint = () => {
    window.print();
  };

  return (
    <header className="text-center py-8 mb-8 border-b-2 border-foreground print:py-4 print:mb-4 print:border-b">
      {/* Top bar with date and print button */}
      <div className="flex items-center justify-between mb-4 print:mb-2">
        <time className="text-xs uppercase tracking-widest text-muted-foreground">
          {formattedDate}
        </time>
        
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handlePrint}
          className="print:hidden gap-2 text-muted-foreground hover:text-foreground"
        >
          <Printer className="h-4 w-4" />
          <span className="hidden sm:inline">Imprimir</span>
        </Button>
        
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Edición Semanal
        </span>
      </div>

      {/* Main masthead */}
      <div className="space-y-2">
        <h1 className="text-5xl md:text-7xl font-serif font-black tracking-tight print:text-4xl">
          RepIndex
        </h1>
        <p className="text-sm md:text-base uppercase tracking-[0.3em] text-muted-foreground font-medium">
          La Autoridad en Reputación Corporativa de las IAs
        </p>
      </div>

      {/* Week indicator */}
      <div className="mt-6 print:mt-3">
        <span className="inline-block px-4 py-1 bg-primary/10 text-primary rounded-full text-sm font-semibold print:bg-transparent print:border print:border-foreground">
          {weekLabel}
        </span>
      </div>

      {/* Tagline for print */}
      <p className="hidden print:block text-xs text-muted-foreground mt-4">
        Análisis semanal de cómo ChatGPT, Perplexity, Gemini y DeepSeek evalúan la reputación de las principales empresas españolas
      </p>
    </header>
  );
}
