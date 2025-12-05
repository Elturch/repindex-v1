import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Trophy, Award, Building2, Briefcase } from "lucide-react";
import { useLandingTopFives } from "@/hooks/useLandingTopFives";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MiniTableProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  data: Array<{ empresa: string; ticker: string; rix: number; ai: string }>;
  variant?: "success" | "danger" | "info";
}

const MiniTable = ({ title, subtitle, icon, data, variant = "info" }: MiniTableProps) => {
  const variantColors = {
    success: "text-excellent",
    danger: "text-insufficient",
    info: "text-primary"
  };

  // Ensure data is an array and has items
  const safeData = data && Array.isArray(data) ? data : [];

  if (safeData.length === 0) {
    return (
      <Card className="p-6 hover:shadow-card-hover transition-shadow">
        <div className="flex items-start gap-3 mb-4">
          <div className={`${variantColors[variant]}`}>
            {icon}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">{title}</h3>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay datos disponibles
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-3 sm:p-4 md:p-6 hover:shadow-card-hover transition-shadow">
      <div className="flex items-start gap-2 mb-2 sm:mb-3 md:mb-4">
        <div className={`${variantColors[variant]} flex-shrink-0`}>
          <span className="[&>svg]:w-5 [&>svg]:h-5 sm:[&>svg]:w-6 sm:[&>svg]:h-6">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm sm:text-base md:text-lg leading-tight">{title}</h3>
          <p className="text-[10px] sm:text-xs md:text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="space-y-1.5 sm:space-y-2">
        {safeData.slice(0, 5).map((item, idx) => (
          <div
            key={`${item.ticker}-${item.ai}-${idx}`}
            className="flex items-center justify-between py-1.5 sm:py-2 border-b border-border/50 last:border-0 gap-2"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[11px] sm:text-sm truncate leading-tight">{item.empresa}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{item.ticker}</p>
            </div>
            <Badge variant="outline" className="ml-1 sm:ml-2 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 flex-shrink-0">
              {item.rix.toFixed(1)}
            </Badge>
          </div>
        ))}
      </div>

      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-4"
      >
        Ver más →
      </Link>
    </Card>
  );
};

export function MiniTablesGrid() {
  const { data, isLoading } = useLandingTopFives();

  if (isLoading) {
    return (
      <section className="py-12 px-4 bg-muted/30">
        <div className="container mx-auto max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-6 animate-pulse">
                <div className="h-24 bg-muted rounded" />
              </Card>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!data) return null;

  const tables = [
    {
      title: "Top 5 RIX",
      subtitle: "Mejores índices de reputación",
      icon: <Trophy className="w-6 h-6" />,
      data: data.topOverall || [],
      variant: "success" as const
    },
    {
      title: "Bottom 5 RIX",
      subtitle: "Índices más bajos",
      icon: <TrendingDown className="w-6 h-6" />,
      data: data.bottomOverall || [],
      variant: "danger" as const
    },
    {
      title: "Top 5 Cotizadas",
      subtitle: "Empresas en bolsa",
      icon: <Building2 className="w-6 h-6" />,
      data: data.topTraded || [],
      variant: "info" as const
    },
    {
      title: "Top 5 No Cotizadas",
      subtitle: "Empresas privadas",
      icon: <Briefcase className="w-6 h-6" />,
      data: data.topUntraded || [],
      variant: "info" as const
    },
    {
      title: "Top Movers UP",
      subtitle: "Mayores subidas semanales",
      icon: <TrendingUp className="w-6 h-6" />,
      data: data.topMoversUp || [],
      variant: "success" as const
    },
    {
      title: "Top Movers DOWN",
      subtitle: "Mayores bajadas semanales",
      icon: <TrendingDown className="w-6 h-6" />,
      data: data.topMoversDown || [],
      variant: "danger" as const
    }
  ];

  return (
    <section className="py-8 sm:py-12 px-2 sm:px-4 bg-muted/30">
      <div className="container mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-6 sm:mb-8"
        >
          <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-2" style={{ fontSize: 'clamp(1.125rem, 4vw, 2.25rem)' }}>
            RepIndex Corporativo
          </h2>
          <p className="text-muted-foreground text-xs sm:text-sm md:text-base lg:text-lg max-w-2xl mx-auto px-1" style={{ fontSize: 'clamp(0.7rem, 2vw, 1.125rem)' }}>
            Explora las métricas de reputación corporativa analizadas por inteligencias artificiales
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren: 0.1
              }
            }
          }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6"
        >
          {tables.map((table, idx) => (
            <motion.div
              key={idx}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 }
              }}
            >
              <MiniTable {...table} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
