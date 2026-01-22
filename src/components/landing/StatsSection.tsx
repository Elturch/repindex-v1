import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { useIssuerCount } from "@/hooks/useIssuerCount";

interface Stat {
  value: string;
  label: string;
  suffix?: string;
}

function getStats(companyCount: number): Stat[] {
  return [
    { value: String(companyCount), label: "Empresas Analizadas", suffix: "+" },
    { value: "4", label: "Modelos de IA" },
    { value: "8", label: "Métricas de Reputación" },
    { value: "1", label: "Actualización Semanal" }
  ];
}

function AnimatedCounter({ value, suffix = "" }: { value: string; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const numericValue = parseInt(value);

  useEffect(() => {
    if (isInView) {
      let start = 0;
      const duration = 2000;
      const increment = numericValue / (duration / 16);

      const timer = setInterval(() => {
        start += increment;
        if (start >= numericValue) {
          setCount(numericValue);
          clearInterval(timer);
        } else {
          setCount(Math.floor(start));
        }
      }, 16);

      return () => clearInterval(timer);
    }
  }, [isInView, numericValue]);

  return (
    <span ref={ref} translate="no" className="tabular-nums">
      {count}{suffix}
    </span>
  );
}

export function StatsSection() {
  const { data: companyCount = 160 } = useIssuerCount();
  const stats = getStats(companyCount);

  return (
    <section className="py-12 px-4 bg-background">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-6 sm:mb-8 px-2"
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2" style={{ fontSize: 'clamp(1.25rem, 4vw, 2.25rem)' }}>
            RepIndex en Números
          </h2>
          <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto" style={{ fontSize: 'clamp(0.8rem, 2vw, 1.125rem)' }}>
            Datos actualizados del análisis reputacional más completo del mercado español
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
            >
              <Card className="p-3 sm:p-4 md:p-6 text-center hover:shadow-lg transition-shadow duration-300 h-full flex flex-col justify-center min-h-[100px] sm:min-h-[120px]">
                <motion.div
                  className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary mb-1"
                  style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)' }}
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                </motion.div>
                <p className="text-[10px] sm:text-xs md:text-sm text-muted-foreground font-medium leading-tight" style={{ fontSize: 'clamp(0.625rem, 1.5vw, 0.875rem)' }}>
                  {stat.label}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
