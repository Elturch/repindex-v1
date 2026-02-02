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
        </main>
      </LandingAIModelProvider>
    </Layout>
  );
}
