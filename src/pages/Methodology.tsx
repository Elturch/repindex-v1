import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout/Layout";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Brain, 
  BarChart3, 
  Leaf, 
  Award, 
  Shield, 
  Users, 
  Cpu, 
  Heart,
  Calendar,
  Building2,
  TrendingUp
} from "lucide-react";
import { useIssuerCount, formatIssuerCount } from "@/hooks/useIssuerCount";

const metrics = [
  {
    code: "NVM",
    name: "Narrativa y Visibilidad Mediática",
    description: "Evalúa cómo los medios de comunicación cubren a la empresa. Incluye frecuencia de menciones, tono de la cobertura y alcance mediático percibido por las IAs.",
    icon: BarChart3,
    color: "text-blue-500"
  },
  {
    code: "DRM",
    name: "Desempeño y Resultados Empresariales",
    description: "Mide la percepción del rendimiento financiero y operativo. Las IAs evalúan resultados, crecimiento, estabilidad y proyecciones de la empresa.",
    icon: TrendingUp,
    color: "text-green-500"
  },
  {
    code: "SIM",
    name: "Sostenibilidad e Impacto Ambiental",
    description: "Analiza los compromisos ESG y medioambientales. Incluye iniciativas de sostenibilidad, huella de carbono y responsabilidad ambiental.",
    icon: Leaf,
    color: "text-emerald-500"
  },
  {
    code: "RMM",
    name: "Reputación de Marca y Marketing",
    description: "Evalúa la fortaleza y reconocimiento de marca. Considera posicionamiento, diferenciación, campañas publicitarias y percepción del consumidor.",
    icon: Award,
    color: "text-purple-500"
  },
  {
    code: "CEM",
    name: "Comportamiento Ético y Gobierno",
    description: "Mide la gobernanza corporativa y prácticas éticas. Incluye transparencia, cumplimiento normativo, diversidad en órganos de gobierno y ética empresarial.",
    icon: Shield,
    color: "text-amber-500"
  },
  {
    code: "GAM",
    name: "Gestión y Atracción del Talento",
    description: "Analiza el employer branding y gestión de RRHH. Evalúa cultura empresarial, satisfacción de empleados, desarrollo profesional y atracción de talento.",
    icon: Users,
    color: "text-pink-500"
  },
  {
    code: "DCM",
    name: "Digital y Capacidad de Innovación",
    description: "Mide la transformación digital e innovación. Incluye inversión en I+D, adopción tecnológica, patentes y capacidad de adaptación al cambio.",
    icon: Cpu,
    color: "text-cyan-500"
  },
  {
    code: "CXM",
    name: "Experiencia del Cliente",
    description: "Evalúa la satisfacción y lealtad del cliente. Analiza calidad de servicio, atención al cliente, opiniones de usuarios y fidelización.",
    icon: Heart,
    color: "text-red-500"
  }
];

const aiModels = [
  {
    name: "ChatGPT",
    provider: "OpenAI",
    model: "GPT-4o",
    description: "El modelo de IA más utilizado del mundo. Su percepción de las empresas influye directamente en millones de consultas diarias."
  },
  {
    name: "Perplexity",
    provider: "Perplexity AI",
    model: "Sonar Pro",
    description: "Motor de búsqueda con IA que cita fuentes. Proporciona respuestas fundamentadas y actualizadas sobre empresas."
  },
  {
    name: "Gemini",
    provider: "Google",
    model: "Gemini Pro",
    description: "El modelo de Google integrado en su ecosistema. Sus respuestas impactan búsquedas y servicios de Google."
  },
  {
    name: "DeepSeek",
    provider: "DeepSeek",
    model: "DeepSeek-R1",
    description: "Modelo de razonamiento avanzado. Ofrece análisis profundo con capacidad de reflexión sobre la información."
  }
];

export default function Methodology() {
  const { data: issuerCount = 160 } = useIssuerCount();
  const issuerCountFormatted = formatIssuerCount(issuerCount);
  
  const methodologySchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Metodología del Índice RepIndex (RIX)",
    "description": "Explicación detallada de cómo RepIndex calcula el índice de reputación corporativa RIX usando 4 modelos de IA y 8 métricas fundamentales.",
    "author": {
      "@type": "Organization",
      "name": "RepIndex.ai"
    },
    "publisher": {
      "@type": "Organization",
      "name": "RepIndex.ai",
      "logo": {
        "@type": "ImageObject",
        "url": "https://repindex.ai/favicon.png"
      }
    },
    "datePublished": "2025-01-01",
    "dateModified": "2025-01-20"
  };

  return (
    <Layout>
      <Helmet>
        <title>Metodología RepIndex - Cómo Calculamos el Índice RIX</title>
        <meta 
          name="description" 
          content="Descubre cómo RepIndex calcula el índice de reputación corporativa RIX. Analizamos 4 modelos de IA (ChatGPT, Perplexity, Gemini, DeepSeek) con 8 métricas fundamentales." 
        />
        <link rel="canonical" href="https://repindex.ai/metodologia" />
        <meta property="og:title" content="Metodología RepIndex - Índice RIX" />
        <meta property="og:description" content="Cómo calculamos el índice de reputación corporativa basado en IA" />
        <meta property="og:url" content="https://repindex.ai/metodologia" />
        <script type="application/ld+json">
          {JSON.stringify(methodologySchema)}
        </script>
      </Helmet>

      <main className="min-h-screen bg-background">
        {/* Hero */}
        <section className="py-16 px-4 bg-gradient-to-b from-background to-accent/5">
          <div className="container mx-auto max-w-4xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Badge variant="outline" className="mb-4">
                Metodología
              </Badge>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">
                Cómo Calculamos el Índice RIX
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                RepIndex analiza semanalmente cómo las principales inteligencias artificiales 
                perciben y describen a las empresas, generando un índice de reputación único.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Qué es RepIndex */}
        <section className="py-12 px-4">
          <div className="container mx-auto max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Brain className="h-6 w-6 text-primary" />
                ¿Qué es RepIndex?
              </h2>
              <div className="prose prose-lg dark:prose-invert max-w-none">
                <p>
                  <strong>RepIndex</strong> es el primer y único índice mundial de reputación corporativa 
                  basado en la percepción de inteligencias artificiales. A diferencia de los índices 
                  tradicionales que miden encuestas de opinión o análisis de medios, RepIndex analiza 
                  directamente cómo los modelos de IA más influyentes del mundo describen y evalúan 
                  a las empresas.
                </p>
                <p>
                  En un mundo donde cada vez más personas consultan a ChatGPT, Perplexity o Gemini 
                  para obtener información sobre empresas, <strong>la percepción que tienen las IAs 
                  se convierte en un factor crítico de reputación</strong>. RepIndex permite monitorizar 
                  y gestionar esta nueva dimensión reputacional.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* El Índice RIX */}
        <section className="py-12 px-4 bg-accent/5">
          <div className="container mx-auto max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-primary" />
                El Índice RIX
              </h2>
              <div className="prose prose-lg dark:prose-invert max-w-none mb-8">
                <p>
                  El <strong>RIX (Reputation Index)</strong> es una puntuación de 0 a 100 que representa 
                  cómo las inteligencias artificiales perciben colectivamente la reputación de una empresa. 
                  Se calcula combinando las evaluaciones de 4 modelos de IA líderes sobre 8 métricas 
                  fundamentales de reputación corporativa.
                </p>
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-center">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-4xl font-bold text-primary mb-2">0-100</div>
                    <div className="text-sm text-muted-foreground">Escala RIX</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-4xl font-bold text-primary mb-2">4</div>
                    <div className="text-sm text-muted-foreground">Modelos de IA</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-4xl font-bold text-primary mb-2">8</div>
                    <div className="text-sm text-muted-foreground">Métricas</div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Los 4 Modelos de IA */}
        <section className="py-12 px-4">
          <div className="container mx-auto max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Cpu className="h-6 w-6 text-primary" />
                Los 4 Modelos de IA Analizados
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                {aiModels.map((model, index) => (
                  <motion.div
                    key={model.name}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center justify-between">
                          {model.name}
                          <Badge variant="secondary">{model.model}</Badge>
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">{model.provider}</p>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">{model.description}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Las 8 Métricas */}
        <section className="py-12 px-4 bg-accent/5">
          <div className="container mx-auto max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Award className="h-6 w-6 text-primary" />
                Las 8 Métricas del RIX
              </h2>
              <p className="text-muted-foreground mb-8">
                Cada métrica evalúa una dimensión específica de la reputación corporativa 
                según cómo las IAs perciben a la empresa en ese aspecto.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                {metrics.map((metric, index) => (
                  <motion.div
                    key={metric.code}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.05 }}
                  >
                    <Card className="h-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <metric.icon className={`h-5 w-5 ${metric.color}`} />
                          <Badge variant="outline" className="mr-2">{metric.code}</Badge>
                          {metric.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">{metric.description}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Cobertura y Frecuencia */}
        <section className="py-12 px-4">
          <div className="container mx-auto max-w-4xl">
            <div className="grid md:grid-cols-2 gap-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <Building2 className="h-6 w-6 text-primary" />
                  Cobertura de Empresas
                </h2>
                <div className="prose dark:prose-invert">
                  <p>Actualmente analizamos <strong>más de {issuerCountFormatted} empresas españolas</strong>:</p>
                  <ul>
                    <li>Todas las empresas del <strong>IBEX-35</strong></li>
                    <li>Empresas del <strong>IBEX Medium Cap</strong></li>
                    <li>Empresas del <strong>IBEX Small Cap</strong></li>
                    <li>Principales empresas <strong>no cotizadas</strong> de España</li>
                  </ul>
                  <p>Continuamente ampliamos la cobertura según la demanda del mercado.</p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <Calendar className="h-6 w-6 text-primary" />
                  Frecuencia de Actualización
                </h2>
                <div className="prose dark:prose-invert">
                  <ul>
                    <li><strong>Datos RIX:</strong> Actualizados cada domingo</li>
                    <li><strong>Newsroom:</strong> Análisis editorial publicado cada lunes</li>
                    <li><strong>Histórico:</strong> Datos disponibles desde enero 2025</li>
                  </ul>
                  <p>
                    La frecuencia semanal permite detectar cambios significativos en la percepción 
                    de las IAs mientras mantiene estabilidad en las puntuaciones.
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 px-4 border-t border-border/50 bg-background">
          <div className="container mx-auto max-w-4xl text-center text-sm text-muted-foreground">
            <p>© 2025 RepIndex.ai - Análisis Reputacional Inteligente</p>
          </div>
        </footer>
      </main>
    </Layout>
  );
}
