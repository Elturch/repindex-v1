import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Printer, Archive, Rss } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

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
      {/* Top bar with date, archive and print button */}
      <div className="flex items-center justify-between mb-4 print:mb-2">
        <time className="text-xs uppercase tracking-widest text-muted-foreground">
          {formattedDate}
        </time>
        
        <div className="flex items-center gap-1 sm:gap-2 print:hidden">
          <Button 
            variant="ghost" 
            size="sm" 
            asChild
            className="gap-1 sm:gap-2 text-muted-foreground hover:text-foreground px-2 sm:px-3"
          >
            <Link to="/noticias/archivo">
              <Archive className="h-4 w-4" />
              <span className="hidden sm:inline">Archivo</span>
            </Link>
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            asChild
            className="gap-1 sm:gap-2 text-muted-foreground hover:text-foreground px-2 sm:px-3"
          >
            <a 
              href="https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/rss-feed" 
              target="_blank" 
              rel="noopener noreferrer"
              title="Suscríbete vía RSS"
            >
              <Rss className="h-4 w-4" />
              <span className="hidden sm:inline">RSS</span>
            </a>
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handlePrint}
            className="gap-1 sm:gap-2 text-muted-foreground hover:text-foreground px-2 sm:px-3"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Imprimir</span>
          </Button>
        </div>
        
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
