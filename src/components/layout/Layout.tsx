import { ReactNode } from "react";
import { Header } from "./Header";

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export function Layout({ children, title }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header title={title} />
      <main className="container mx-auto px-4 py-6 flex-1 print:px-0 print:py-0 print:max-w-none">
        {children}
      </main>
      <footer className="border-t border-border/50 bg-card/30 backdrop-blur-sm print:hidden">
        <div className="container mx-auto px-4 py-4">
          <p className="text-xs text-center text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Actualización de Datos:</span> Los análisis RIX se ejecutan automáticamente cada domingo, garantizando información actualizada semanalmente y asegurando la solidez y confiabilidad de los datos reputacionales.
          </p>
        </div>
      </footer>
    </div>
  );
}