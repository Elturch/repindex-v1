import { SEOHead } from "@/components/landing/SEOHead";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { MiniTablesGrid } from "@/components/landing/MiniTablesGrid";
import { StatsSection } from "@/components/landing/StatsSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { CTASection } from "@/components/landing/CTASection";
import { ContactSection } from "@/components/landing/ContactSection";
import { Layout } from "@/components/layout/Layout";
import { Waves } from "@/components/landing/Waves";

export default function Landing() {
  return (
    <Layout>
      <SEOHead />
      
      {/* Fondo de ondas animadas - fixed, cubre toda la pantalla */}
      <Waves 
        className="z-0"
        strokeColor="rgba(100, 150, 255, 0.30)"
        backgroundColor="transparent"
        pointerSize={0}
      />
      
      {/* Contenido con z-index superior */}
      <main className="min-h-screen relative z-10">
        <article>
          <HeroSection />
          <MiniTablesGrid />
          <FeaturesSection />
          <FAQSection />
          <StatsSection />
          <CTASection />
          <ContactSection />
        </article>
        
        {/* Footer */}
        <footer className="py-8 px-4 border-t border-border/50 bg-background">
          <div className="container mx-auto max-w-6xl text-center text-sm text-muted-foreground space-y-2">
            <p>© 2025 RepIndex.ai - Análisis Reputacional Inteligente</p>
            <a 
              href="#contacto" 
              className="text-primary hover:underline inline-block"
            >
              Contacto
            </a>
          </div>
        </footer>
      </main>
    </Layout>
  );
}
