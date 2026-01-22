import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useIssuerCount, formatIssuerCount } from "@/hooks/useIssuerCount";

const getfaqs = (issuerCount: string) => [
  {
    question: "¿Qué es el índice RIX?",
    answer: "El RIX (Reputation Index) es una puntuación de 0 a 100 que mide cómo las principales inteligencias artificiales (ChatGPT, Perplexity, Gemini y DeepSeek) perciben y describen la reputación de una empresa. Se calcula semanalmente analizando las respuestas de estos 4 modelos de IA sobre cada compañía."
  },
  {
    question: "¿Con qué frecuencia se actualizan los datos?",
    answer: "Los datos del RepIndex se actualizan semanalmente. Cada domingo realizamos nuevas consultas a los 4 modelos de IA y procesamos los resultados. El análisis editorial del Newsroom se publica cada lunes con las noticias más relevantes de la semana."
  },
  {
    question: "¿Qué modelos de IA se analizan?",
    answer: "Analizamos los 4 principales modelos de IA del mercado: ChatGPT (OpenAI GPT-4o), Perplexity (búsqueda con fuentes), Gemini (Google) y DeepSeek-R1. Estos modelos representan la visión más influyente de cómo la IA percibe a las empresas."
  },
  {
    question: "¿Qué empresas cubre RepIndex?",
    answer: `Actualmente analizamos más de ${issuerCount} empresas españolas, incluyendo todas las del IBEX-35, IBEX Medium Cap, IBEX Small Cap, y las principales empresas no cotizadas de España. Continuamente ampliamos la cobertura según la demanda.`
  },
  {
    question: "¿Cuáles son las 8 métricas del RIX?",
    answer: "El RIX se compone de 8 métricas: NVM (Narrativa y Visibilidad Mediática), DRM (Desempeño y Resultados), SIM (Sostenibilidad e Impacto), RMM (Reputación de Marca), CEM (Comportamiento Ético), GAM (Gestión del Talento), DCM (Digital e Innovación) y CXM (Experiencia del Cliente)."
  },
  {
    question: "¿Por qué es importante la reputación en las IAs?",
    answer: "Las IAs generativas como ChatGPT y Perplexity son cada vez más consultadas por consumidores, inversores y profesionales. Cómo estas IAs describen a una empresa afecta directamente a su percepción pública, decisiones de compra y valoración de mercado. RepIndex permite monitorizar y gestionar esta nueva dimensión reputacional."
  }
];

// Generate FAQ Schema JSON-LD
export function getFAQSchema(issuerCount: string = "160") {
  const faqs = getfaqs(issuerCount);
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  };
}

export function FAQSection() {
  const { data: issuerCount = 160 } = useIssuerCount();
  const faqs = getfaqs(formatIssuerCount(issuerCount));
  
  return (
    <section className="py-16 px-4 bg-accent/5" aria-label="Preguntas frecuentes">
      <div className="container mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Preguntas Frecuentes
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Todo lo que necesitas saber sobre RepIndex y el índice RIX
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left font-medium">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
