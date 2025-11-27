import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { FaRobot, FaDatabase, FaSync } from "react-icons/fa";
import { IoMdTrendingUp } from "react-icons/io";

const features = [
  {
    icon: FaRobot,
    title: "Análisis Multi-IA",
    description: "Evaluaciones desde 4 modelos de IA: ChatGPT, Google Gemini, Perplexity y Deepseek",
    color: "text-chatgpt"
  },
  {
    icon: IoMdTrendingUp,
    title: "Puntuación RIX",
    description: "Índice reputacional de 0-100 basado en 8 métricas fundamentales de reputación",
    color: "text-primary"
  },
  {
    icon: FaSync,
    title: "Datos Actualizados",
    description: "Análisis semanal automático de más de 153 empresas del mercado español",
    color: "text-gemini"
  },
  {
    icon: FaDatabase,
    title: "Evolución Temporal",
    description: "Tendencias y comparativas históricas para análisis profundo de reputación",
    color: "text-perplexity"
  }
];

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export function FeaturesSection() {
  return (
    <section className="py-12 px-4 bg-background">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-2">
            Características Principales
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Herramientas avanzadas para análisis reputacional empresarial
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {features.map((feature, index) => (
            <motion.div key={index} variants={item}>
              <Card className="p-6 h-full hover:shadow-lg transition-shadow duration-300 border-border/50">
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="mb-4"
                >
                  <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                    <feature.icon className={`w-6 h-6 ${feature.color}`} />
                  </div>
                </motion.div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
