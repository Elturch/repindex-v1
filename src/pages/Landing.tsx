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
import { LandingAIModelProvider } from "@/contexts/LandingAIModelContext";

export default function Landing() {
  return (
    <Layout>
      <LandingAIModelProvider>
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
            <div className="container mx-auto max-w-6xl text-center text-sm text-muted-foreground space-y-4">
              <p>© 2025 Reputation Index, Lda. (NIF 519 229 185)</p>
              
              {/* Legal Links */}
              <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                <a href="/termos" className="hover:text-foreground transition-colors">
                  Termos e Condições
                </a>
                <span className="text-border">|</span>
                <a href="/privacidade" className="hover:text-foreground transition-colors">
                  Privacidade
                </a>
                <span className="text-border">|</span>
                <a href="/cookies" className="hover:text-foreground transition-colors">
                  Cookies
                </a>
                <span className="text-border">|</span>
                <a href="/rgpd" className="hover:text-foreground transition-colors">
                  RGPD
                </a>
                <span className="text-border">|</span>
                <a href="/reclamacoes" className="hover:text-foreground transition-colors">
                  Reclamações
                </a>
                <span className="text-border">|</span>
                <a 
                  href="#contacto" 
                  className="text-primary hover:underline"
                >
                  Contacto
                </a>
              </nav>
            </div>
          </footer>
        </main>
      </LandingAIModelProvider>
    </Layout>
  );
}
