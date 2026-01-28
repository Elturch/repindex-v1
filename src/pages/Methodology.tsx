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
  TrendingUp,
  Globe,
  CheckCircle2
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
    model: "GPT-4.1 mini",
    hasWebSearch: true,
    searchMethod: "Web Search Preview",
    description: "El modelo de IA más utilizado del mundo con búsqueda web nativa. Accede a noticias y fuentes en tiempo real."
  },
  {
    name: "Perplexity",
    provider: "Perplexity AI",
    model: "Sonar Pro",
    hasWebSearch: true,
    searchMethod: "Búsqueda Nativa",
    description: "Motor de búsqueda especializado con citación de fuentes. Diseñado específicamente para búsqueda web."
  },
  {
    name: "Gemini",
    provider: "Google",
    model: "Gemini 2.5 Pro",
    hasWebSearch: true,
    searchMethod: "Google Search Grounding",
    description: "El modelo de Google con integración directa con Google Search para resultados actualizados."
  },
  {
    name: "DeepSeek",
    provider: "DeepSeek + Tavily",
    model: "DeepSeek Chat",
    hasWebSearch: true,
    searchMethod: "RAG con Tavily",
    description: "Búsqueda web mediante Tavily Search API integrada. Combina razonamiento profundo con fuentes reales."
  },
  {
    name: "Grok",
    provider: "xAI",
    model: "Grok-3",
    hasWebSearch: true,
    searchMethod: "Live Search + X",
    description: "Búsqueda en tiempo real incluyendo publicaciones de X/Twitter."
  },
  {
    name: "Qwen",
    provider: "Alibaba",
    model: "Qwen Max",
    hasWebSearch: true,
    searchMethod: "DashScope Search",
    description: "Búsqueda web integrada mediante Alibaba DashScope."
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
                El Radar Reputacional en la Era Algorítmica
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                RepIndex.ai es la primera plataforma nativa de inteligencia artificial diseñada 
                para medir, analizar y anticipar la percepción algorítmica corporativa en España.
              </p>
              <p className="text-sm text-muted-foreground/70 mt-4 max-w-xl mx-auto italic">
                "No preguntamos qué opinan las personas. Preguntamos qué dirían las IAs 
                si alguien consultara ahora mismo sobre esta empresa."
              </p>
            </motion.div>
          </div>
        </section>

        {/* De la reputación percibida a la algorítmica */}
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
                De la Reputación Percibida a la Reputación Algorítmica
              </h2>
              <div className="prose prose-lg dark:prose-invert max-w-none">
                <p>
                  <strong>RepIndex.ai</strong> nace para responder a una transformación estructural: 
                  la reputación ya no se forma únicamente en medios, encuestas o redes sociales, 
                  sino en los <strong>sistemas de inteligencia artificial que median el acceso a la información</strong>.
                </p>
                <p>
                  Hoy, antes de invertir, contratar, regular o colaborar, los distintos grupos de interés 
                  consultan a una IA. RepIndex.ai permite, por primera vez, <strong>monitorizar, estructurar 
                  y gobernar esa nueva capa reputacional</strong>: la percepción algorítmica.
                </p>
                <blockquote className="border-l-4 border-primary pl-4 italic my-6">
                  "La inteligencia artificial no solo responde preguntas: estructura la realidad informativa. 
                  Si los modelos influyen en cómo se decide, se invierte y se regula, es coherente medir 
                  cómo esos sistemas describen y priorizan a las empresas. RepIndex.ai convierte la 
                  reputación algorítmica en una variable estratégica, observable y gestionable."
                  <footer className="text-sm text-muted-foreground mt-2">— Carlota Turci, COO de RepIndex.ai</footer>
                </blockquote>
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
                El RIX: Un Nuevo Estándar de Lectura Reputacional
              </h2>
              <div className="prose prose-lg dark:prose-invert max-w-none mb-8">
                <p>
                  El núcleo de la plataforma es el <strong>RIX (Reputation Index)</strong>, una puntuación 
                  de 0 a 100 que sintetiza la percepción colectiva de las IAs mediante la combinación de 
                  ocho métricas estructurales, alineadas con los principales ejes de la reputación corporativa.
                </p>
                <p>
                  El sistema analiza semanalmente las respuestas de los modelos, sus fuentes, su coherencia 
                  y su tono, generando una <strong>base de datos longitudinal de narrativas algorítmicas</strong>, 
                  con capacidad para detectar tendencias, divergencias y riesgos reputacionales emergentes.
                </p>
                <p className="text-muted-foreground text-sm">
                  RepIndex.ai no sustituye a los estudios tradicionales de reputación: los complementa 
                  con una capa prospectiva, centrada en la <strong>probabilidad de que determinados relatos 
                  se consoliden en el ecosistema informativo algorítmico</strong>.
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
                    <div className="text-4xl font-bold text-primary mb-2">6</div>
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

        {/* Arquitectura Multi-Modelo */}
        <section className="py-12 px-4">
          <div className="container mx-auto max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Globe className="h-6 w-6 text-primary" />
                Tecnología Nativa IA y Arquitectura Multi-Modelo
              </h2>
              
              {/* Quote del CTO */}
              <div className="prose prose-lg dark:prose-invert max-w-none mb-8">
                <blockquote className="border-l-4 border-primary pl-4 italic my-6">
                  "Nuestro objetivo no era recopilar más datos, sino entender cómo los modelos de IA 
                  priorizan, validan y narran la información corporativa. Analizamos coherencia semántica, 
                  autoridad de fuentes y evolución narrativa en tiempo casi real. Es un cambio de paradigma: 
                  pasamos de observar percepción humana a anticipar percepción algorítmica."
                  <footer className="text-sm text-muted-foreground mt-2">— Nacho Larriba, CTO de RepIndex.ai</footer>
                </blockquote>
              </div>
              
              {/* Banner 100% Web Real */}
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-6 mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900">
                    <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-green-800 dark:text-green-200 text-lg">
                      100% Búsqueda Web Real en Tiempo Real
                    </h3>
                    <p className="text-green-700 dark:text-green-300 text-sm">
                      6 modelos fundacionales con acceso a búsqueda web nativa
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  La plataforma integra de forma sistemática los principales modelos fundacionales 
                  con acceso a búsqueda web en tiempo real. Las menciones y URLs citadas en los 
                  informes son verificables y corresponden a noticias reales de la semana analizada.
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {aiModels.map((model, index) => (
                  <motion.div
                    key={model.name}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.05 }}
                  >
                    <Card className="h-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <span className="text-green-500">🌐</span>
                            {model.name}
                          </span>
                        </CardTitle>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">{model.provider}</p>
                          <Badge variant="secondary" className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs">
                            {model.searchMethod}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-muted-foreground">{model.description}</p>
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

        {/* Radar Temprano - Nueva sección */}
        <section className="py-12 px-4">
          <div className="container mx-auto max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-primary" />
                Una Nueva Prioridad para las Organizaciones
              </h2>
              <div className="prose prose-lg dark:prose-invert max-w-none mb-8">
                <p>
                  RepIndex.ai surge en un momento en el que la reputación es <strong>instantánea</strong>, 
                  <strong> multidimensional</strong> y <strong>algorítmicamente mediada</strong>.
                </p>
                <p>
                  En este nuevo entorno, la gestión reputacional ya no puede limitarse a reaccionar ante crisis: 
                  debe <strong>anticipar cómo se construye el relato</strong> en los sistemas que filtran la realidad.
                </p>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                <Card className="border-primary/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3">🎯 Radar Temprano</h3>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      <li>• Detectar sesgos emergentes</li>
                      <li>• Identificar deterioros narrativos</li>
                      <li>• Priorizar señales críticas</li>
                      <li>• Diseñar estrategias de corrección antes de que el daño sea visible</li>
                    </ul>
                  </CardContent>
                </Card>
                <Card className="border-primary/20">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3">📊 Capacidades de Procesamiento</h3>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      <li>• Prompts estructurados</li>
                      <li>• Embeddings semánticos</li>
                      <li>• Vectores reputacionales</li>
                      <li>• Señales de autoridad y consistencia</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Rigor en la Ejecución - Nueva sección */}
        <section className="py-12 px-4 bg-accent/5">
          <div className="container mx-auto max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                Rigor en la Ejecución
              </h2>
              <p className="text-muted-foreground mb-8">
                La arquitectura del sistema garantiza reproducibilidad, estandarización y control de sesgos.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3">🔄 Ejecución Sistemática</h3>
                    <p className="text-sm text-muted-foreground">
                      Cada domingo, el sistema ejecuta consultas machine-to-machine 
                      vía API con prompts estructurados e invariables para todas 
                      las empresas del censo.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3">📊 Variables de Contraste</h3>
                    <p className="text-sm text-muted-foreground">
                      Para empresas cotizadas: precio de cierre semanal (viernes). 
                      Para todas: volumen de menciones Tier-1. Anclas empíricas 
                      que permiten validación estadística continua.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3">⚙️ Reproducibilidad</h3>
                    <p className="text-sm text-muted-foreground">
                      La estandarización elimina sesgos por usuario, contexto o 
                      historial de conversación. Consultas idénticas para todos los 
                      modelos garantizan comparabilidad.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-3">🔬 Divergencia Inter-modelo</h3>
                    <p className="text-sm text-muted-foreground">
                      La divergencia (σ) entre 6 modelos independientes es una medida 
                      de incertidumbre epistémica. Cuando coinciden, la señal es robusta.
                      La divergencia alta indica realidad informativa fragmentada.
                    </p>
                  </CardContent>
                </Card>
              </div>
              <p className="text-xs text-muted-foreground/70 mt-6 italic text-center">
                La ponderación de métricas parte de criterio experto y evolucionará 
                según evidencia estadística conforme madure el dataset longitudinal.
              </p>
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
                  Cobertura: El Corporate Spain
                </h2>
                <div className="prose dark:prose-invert">
                  <p>En esta primera fase, la plataforma cubre el <strong>IBEX 35 y el núcleo del Corporate Spain</strong>:</p>
                  <ul>
                    <li>Todas las empresas del <strong>IBEX-35</strong></li>
                    <li>Empresas del <strong>IBEX Medium Cap</strong></li>
                    <li>Empresas del <strong>IBEX Small Cap</strong></li>
                    <li>Principales empresas <strong>no cotizadas</strong> de España</li>
                  </ul>
                  <p className="text-sm text-muted-foreground">
                    Actualmente analizamos <strong>más de {issuerCountFormatted} empresas</strong>. 
                    Continuamente ampliamos la cobertura según la demanda del mercado.
                  </p>
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
                  Frecuencia y Disponibilidad
                </h2>
                <div className="prose dark:prose-invert">
                  <ul>
                    <li><strong>Datos RIX:</strong> Actualizados cada domingo</li>
                    <li><strong>Newsroom:</strong> Análisis editorial publicado cada lunes</li>
                    <li><strong>Histórico:</strong> Datos disponibles desde enero 2025</li>
                    <li><strong>Lanzamiento:</strong> 1 de enero de 2026</li>
                  </ul>
                  <p className="text-sm text-muted-foreground">
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
          <div className="container mx-auto max-w-4xl text-center">
            <p className="text-lg font-semibold text-primary mb-2">
              RepIndex.ai
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              El radar reputacional en la era algorítmica
            </p>
            <p className="text-xs text-muted-foreground">
              © 2026 RepIndex.ai - La reputación algorítmica como variable estratégica
            </p>
          </div>
        </footer>
      </main>
    </Layout>
  );
}
