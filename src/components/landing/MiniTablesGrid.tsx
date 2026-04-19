import { motion } from "framer-motion";
import { useState } from "react";
import { TrendingUp, TrendingDown, Trophy, Building2, Briefcase, Calendar, Info } from "lucide-react";
import { useLandingTopFives, type RankingMode } from "@/hooks/useLandingTopFives";
import { useLandingAIModel } from "@/contexts/LandingAIModelContext";
import { AIModelSelector } from "./AIModelSelector";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface MiniTableProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  data: Array<{ empresa: string; ticker: string; rix: number; ai: string; consensusLevel?: "alto" | "medio" | "bajo" }>;
  variant?: "success" | "danger" | "info";
  metricLabel: string;
}

const MiniTable = ({ title, subtitle, icon, data, variant = "info", metricLabel }: MiniTableProps) => {
  const variantColors = {
    success: "text-excellent",
    danger: "text-insufficient",
    info: "text-primary"
  };

  const safeData = data && Array.isArray(data) ? data : [];

  if (safeData.length === 0) {
    return (
      <Card className="p-6 hover:shadow-card-hover transition-shadow">
        <div className="flex items-start gap-3 mb-4">
          <div className={`${variantColors[variant]}`}>{icon}</div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">{title}</h3>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground text-center py-4">No hay datos disponibles</p>
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
          <Badge variant="secondary" className="mt-1 text-[9px] sm:text-[10px] px-1.5 py-0 font-normal">
            {metricLabel}
          </Badge>
        </div>
      </div>

      <div className="space-y-1.5 sm:space-y-2">
        {safeData.slice(0, 5).map((item, idx) => (
          <div
            key={`${item.ticker}-${idx}`}
            className="flex items-center justify-between py-1.5 sm:py-2 border-b border-border/50 last:border-0 gap-2"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[11px] sm:text-sm truncate leading-tight">{item.empresa}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {item.ticker}
                {item.consensusLevel && (
                  <span className="ml-1 opacity-70">· consenso {item.consensusLevel}</span>
                )}
              </p>
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
  const { selectedModel } = useLandingAIModel();
  const { data, isLoading } = useLandingTopFives(selectedModel);

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

  // IBEX 35 Rankings
  const ibexTables = [
    {
      title: "Top 5 IBEX 35",
      subtitle: "Mejores índices del IBEX",
      icon: <Trophy className="w-6 h-6" />,
      data: data.topIbex || [],
      variant: "success" as const
    },
    {
      title: "Bottom 5 IBEX 35",
      subtitle: "Índices más bajos del IBEX",
      icon: <TrendingDown className="w-6 h-6" />,
      data: data.bottomIbex || [],
      variant: "danger" as const
    },
    {
      title: "IBEX Movers UP",
      subtitle: "Mayores subidas semanales",
      icon: <TrendingUp className="w-6 h-6" />,
      data: data.ibexMoversUp || [],
      variant: "success" as const
    },
    {
      title: "IBEX Movers DOWN",
      subtitle: "Mayores bajadas semanales",
      icon: <TrendingDown className="w-6 h-6" />,
      data: data.ibexMoversDown || [],
      variant: "danger" as const
    }
  ];

  // Non-IBEX Rankings
  const otherTables = [
    {
      title: "Top 5 Resto",
      subtitle: "Mejores fuera del IBEX",
      icon: <Trophy className="w-6 h-6" />,
      data: data.topOverall || [],
      variant: "success" as const
    },
    {
      title: "Bottom 5 Resto",
      subtitle: "Índices más bajos (sin IBEX)",
      icon: <TrendingDown className="w-6 h-6" />,
      data: data.bottomOverall || [],
      variant: "danger" as const
    },
    {
      title: "Top 5 Cotizadas",
      subtitle: "Cotizadas fuera del IBEX",
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
      subtitle: "Mayores subidas (sin IBEX)",
      icon: <TrendingUp className="w-6 h-6" />,
      data: data.topMoversUp || [],
      variant: "success" as const
    },
    {
      title: "Top Movers DOWN",
      subtitle: "Mayores bajadas (sin IBEX)",
      icon: <TrendingDown className="w-6 h-6" />,
      data: data.topMoversDown || [],
      variant: "danger" as const
    }
  ];

  return (
    <section className="py-8 sm:py-12 px-2 sm:px-4 bg-muted/30">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
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
          {data.latestWeek && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs sm:text-sm mb-2">
              <Calendar className="w-4 h-4" />
              <span>
                Última actualización: {format(parseISO(data.latestWeek), "d 'de' MMMM yyyy", { locale: es })}
              </span>
            </div>
          )}
          <p className="text-muted-foreground text-xs sm:text-sm md:text-base lg:text-lg max-w-2xl mx-auto px-1 mb-4" style={{ fontSize: 'clamp(0.7rem, 2vw, 1.125rem)' }}>
            Explora las métricas de reputación corporativa analizadas por inteligencias artificiales
          </p>
          
          {/* AI Model Selector */}
          <AIModelSelector />
        </motion.div>

        {/* IBEX 35 Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-8 sm:mb-12"
        >
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
            <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-primary whitespace-nowrap">
              🏛️ IBEX 35
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          </div>
          
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
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6"
          >
            {ibexTables.map((table, idx) => (
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
        </motion.div>

        {/* Other Rankings Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-muted-foreground/30 to-transparent" />
            <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-muted-foreground whitespace-nowrap">
              📊 Resto del Mercado
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-muted-foreground/30 to-transparent" />
          </div>
          
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
            {otherTables.map((table, idx) => (
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
        </motion.div>
      </div>
    </section>
  );
}
