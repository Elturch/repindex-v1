import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { FaRobot, FaChartLine } from "react-icons/fa";
export function HeroSection() {
  const navigate = useNavigate();
  return <section className="relative py-12 px-4 overflow-hidden bg-gradient-to-b from-background to-accent/5">
      <div className="container mx-auto max-w-6xl">
        <motion.div initial={{
        opacity: 0,
        y: 20
      }} animate={{
        opacity: 1,
        y: 0
      }} transition={{
        duration: 0.6
      }} className="text-center space-y-4">
          {/* Main title */}
          <motion.h1 initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.3,
          duration: 0.6
        }} className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight max-w-4xl mx-auto leading-tight" style={{
          fontSize: 'clamp(1.5rem, 4vw, 3rem)'
        }}>La autoridad reputacional 
corporativa de las IAs</motion.h1>

          {/* Subtitle */}
          <motion.p initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.4,
          duration: 0.6
        }} className="text-base sm:text-lg md:text-xl font-semibold text-yellow-500 max-w-3xl mx-auto" style={{
          fontSize: 'clamp(0.875rem, 2.5vw, 1.5rem)'
        }}>
            AI Corporate Reputation Authority
          </motion.p>

          {/* Description */}
          <motion.p initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.5,
          duration: 0.6
        }} className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto px-2" style={{
          fontSize: 'clamp(0.8rem, 2vw, 1.125rem)'
        }}>
            Analizamos cómo las inteligencias artificiales construyen la narrativa 
            de las principales corporaciones
          </motion.p>

          {/* CTAs */}
          <motion.div initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: 0.6,
          duration: 0.6
        }} className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <Button size="lg" onClick={() => navigate("/dashboard")} className="w-full sm:w-auto group whitespace-nowrap px-6">
              <FaChartLine className="mr-2 flex-shrink-0 group-hover:scale-110 transition-transform" />
              <span className="truncate sm:whitespace-nowrap">Ver el RepIndex</span>
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/chat")} className="w-full sm:w-auto group">
              <FaRobot className="mr-2 group-hover:scale-110 transition-transform" />
              Agente Rix
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>;
}