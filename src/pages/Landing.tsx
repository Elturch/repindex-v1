import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { MiniTablesGrid } from "@/components/landing/MiniTablesGrid";
import { StatsSection } from "@/components/landing/StatsSection";
import { CTASection } from "@/components/landing/CTASection";
import { Layout } from "@/components/layout/Layout";
import { Waves } from "@/components/landing/Waves";

export default function Landing() {
  return (
    <Layout>
      {/* Fondo de ondas animadas - fixed, cubre toda la pantalla */}
      <Waves 
        className="z-0"
        strokeColor="rgba(100, 150, 255, 0.10)"
        backgroundColor="transparent"
        pointerSize={0}
      />
      
      {/* Contenido con z-index superior */}
      <div className="min-h-screen relative z-10">
        <HeroSection />
        <MiniTablesGrid />
        <FeaturesSection />
        <StatsSection />
        <CTASection />
        
        {/* Footer */}
        <footer className="py-8 px-4 border-t border-border/50 bg-background">
          <div className="container mx-auto max-w-6xl text-center text-sm text-muted-foreground">
            <p>© 2025 RepIndex.ai - Análisis Reputacional Inteligente</p>
          </div>
        </footer>
      </div>
    </Layout>
  );
}
