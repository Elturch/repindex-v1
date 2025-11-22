import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { TopFiveSection } from "@/components/landing/TopFiveSection";
import { StatsSection } from "@/components/landing/StatsSection";
import { CTASection } from "@/components/landing/CTASection";
import { Layout } from "@/components/layout/Layout";

export default function Landing() {
  return (
    <Layout>
      <div className="min-h-screen">
        <HeroSection />
        <FeaturesSection />
        <TopFiveSection />
        <StatsSection />
        <CTASection />
        
        {/* Footer */}
        <footer className="py-8 px-4 border-t border-border/50 bg-background">
          <div className="container mx-auto max-w-6xl text-center text-sm text-muted-foreground">
            <p>© 2025 Repindex.ai - Análisis Reputacional Inteligente</p>
          </div>
        </footer>
      </div>
    </Layout>
  );
}
