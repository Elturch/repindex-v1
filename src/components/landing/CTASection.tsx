import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { FaChartLine, FaRobot } from "react-icons/fa";

export function CTASection() {
  const navigate = useNavigate();

  return (
    <section className="py-12 px-4 bg-gradient-to-b from-accent/5 to-background">
      <div className="container mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-3 sm:space-y-4 px-2"
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold" style={{ fontSize: 'clamp(1.25rem, 4vw, 2.25rem)' }}>
            Comienza tu Análisis Reputacional
          </h2>
          <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto" style={{ fontSize: 'clamp(0.8rem, 2vw, 1.125rem)' }}>
            Accede al dashboard completo con análisis en tiempo real o consulta el Agente Rix
            para obtener insights personalizados sobre cualquier empresa.
          </p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4"
          >
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                size="lg"
                onClick={() => navigate("/dashboard")}
                className="w-full sm:w-auto group"
              >
                <FaChartLine className="mr-2 group-hover:scale-110 transition-transform" />
                Explorar Dashboard
              </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/chat")}
                className="w-full sm:w-auto group"
              >
                <FaRobot className="mr-2 group-hover:scale-110 transition-transform" />
                Agente Rix
              </Button>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
