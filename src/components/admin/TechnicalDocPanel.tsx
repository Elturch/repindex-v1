import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Brain, RefreshCw, Cpu, Clock, BookOpen, Zap, Shield, Database, Globe, Bot, ArrowRight } from 'lucide-react';

const TechnicalDocPanel: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Documentación Técnica</h2>
          <p className="text-sm text-muted-foreground">
            Referencia interna para el equipo técnico — contenido estático
          </p>
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["architecture"]} className="space-y-3">

        {/* ==================== SECCIÓN 1: ARQUITECTURA RIX ==================== */}
        <AccordionItem value="architecture" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <Brain className="h-5 w-5 text-primary" />
              <div className="text-left">
                <p className="font-semibold">Arquitectura del Agente RIX</p>
                <p className="text-xs text-muted-foreground font-normal">RAG híbrido de producción — 5 patrones combinados</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4" /> Tipo de Arquitectura
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  El motor <code className="bg-muted px-1.5 py-0.5 rounded text-xs">chat-intelligence</code> implementa un
                  <strong> RAG híbrido de producción</strong> que combina 5 patrones arquitectónicos:
                </p>
                <div className="grid gap-2">
                  {[
                    { name: 'Adaptive RAG', desc: 'Enrutador de complejidad (categorizeQuestion) con 3 niveles: quick, complete, exhaustive. Ajusta volumen de datos e intensidad analítica según la pregunta.' },
                    { name: 'GraphRAG', desc: 'Traversal de relaciones tipadas (COMPITE_CON, MISMO_SUBSECTOR, MISMO_SECTOR) mediante expand_entity_graph_with_scores para contexto entre pares.' },
                    { name: 'Corrective RAG (CRAG)', desc: 'Guardrails de calidad: validación IBEX-35, selección inteligente de periodo con umbral mínimo de 10 registros, re-fetches dirigidos.' },
                    { name: 'Fusion RAG', desc: 'Recuperación paralela de 7 fuentes: Keywords, Vector Store, Rankings estructurados, Snapshots corporativos, Noticias, Grafo y Estadísticas.' },
                    { name: 'Conversational RAG', desc: 'Memoria de sesión via conversationHistory para continuidad conversacional multi-turno.' },
                  ].map((pattern) => (
                    <div key={pattern.name} className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                      <Badge variant="outline" className="h-fit whitespace-nowrap shrink-0">{pattern.name}</Badge>
                      <p className="text-muted-foreground text-xs">{pattern.desc}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowRight className="h-4 w-4" /> Flujo de Datos
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {['Pregunta', 'Categorización', 'Detección empresas', 'Carga datos (rix_runs_v2)', 'Construcción contexto', 'LLM', 'Respuesta'].map((step, i) => (
                    <React.Fragment key={step}>
                      <Badge variant="secondary" className="text-xs">{step}</Badge>
                      {i < 6 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                    </React.Fragment>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" /> Anti-alucinación
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                    <li>Filtrado off-topic con regex antes de RAG</li>
                    <li>Pre-filtrado por modelo e índice bursátil</li>
                    <li>Ordenamiento determinista por ticker</li>
                    <li>Guardrail de completitud IBEX-35</li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4" /> LLMs y Modos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                    <li><strong>Primario:</strong> OpenAI GPT-4o</li>
                    <li><strong>Fallback:</strong> Google Gemini 2.0 Flash</li>
                    <li><strong>Modo Rix Press:</strong> Periodista integrado para informes con tono editorial</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== SECCIÓN 2: BARRIDO SEMANAL ==================== */}
        <AccordionItem value="sweep" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-primary" />
              <div className="text-left">
                <p className="font-semibold">Barrido Semanal de Datos</p>
                <p className="text-xs text-muted-foreground font-normal">Domingos — 35 fases — 179 empresas — 6 modelos IA</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            <div className="grid md:grid-cols-3 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Cuándo</CardDescription>
                  <CardTitle className="text-lg">Domingos 00:00 UTC</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">35 fases escalonadas cada 5 minutos (00:00–02:50 UTC)</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Censo</CardDescription>
                  <CardTitle className="text-lg">179 empresas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Incluye registros históricos de emisores renombrados o dados de baja</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Duración típica</CardDescription>
                  <CardTitle className="text-lg">11–22 horas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Baseline: ~17h (domingo 01:00 a 18:00 CET)</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Cómo funciona</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Cada fase procesa ~5 empresas (35 fases × ~5 = 175+ empresas con margen)</li>
                  <li>Para cada empresa: búsqueda web (<code className="bg-muted px-1 rounded">rix-search-v2</code>) + análisis IA (<code className="bg-muted px-1 rounded">rix-analyze-v2</code>) con 8 métricas RIX</li>
                  <li>Cadencia híbrida: 3 empresas simultáneas (primer 70%) → 1 empresa (último 30%)</li>
                  <li>Reintentos automáticos hasta 1.000 intentos por empresa</li>
                  <li>Watchdog cada 5 minutos como red de seguridad 24/7</li>
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Cadena de automatización post-barrido</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge>100% completado</Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <Badge variant="secondary">auto_sanitize</Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <Badge variant="secondary">auto_populate_vectors</Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <Badge variant="secondary">auto_generate_newsroom</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Tablas involucradas: <code className="bg-muted px-1 rounded">sweep_progress</code>, <code className="bg-muted px-1 rounded">rix_runs_v2</code> (única fuente de verdad; <code>rix_runs</code> y <code>rix_trends</code> deprecadas)
                </p>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== SECCIÓN 3: CONEXIONES IA ==================== */}
        <AccordionItem value="ai-connections" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <Cpu className="h-5 w-5 text-primary" />
              <div className="text-left">
                <p className="font-semibold">Conexiones con IAs</p>
                <p className="text-xs text-muted-foreground font-normal">8 proveedores IA + 3 servicios auxiliares</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Proveedores de IA</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Uso principal</TableHead>
                      <TableHead>Secret</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { provider: 'OpenAI', model: 'GPT-4o', use: 'Agente Rix, análisis RIX, noticias', secret: 'OPENAI_API_KEY' },
                      { provider: 'Google', model: 'Gemini 2.0 Flash', use: 'Fallback Agente, audit emisores, scraping', secret: 'GOOGLE_GEMINI_API_KEY' },
                      { provider: 'Perplexity', model: 'Sonar Pro', use: 'Búsqueda web en barrido RIX', secret: 'PERPLEXITY_API_KEY' },
                      { provider: 'DeepSeek', model: 'DeepSeek V3', use: 'Modelo análisis RIX', secret: 'DEEPSEEK_API_KEY' },
                      { provider: 'xAI', model: 'Grok 3', use: 'Modelo análisis RIX', secret: 'XAI_API_KEY' },
                      { provider: 'Alibaba', model: 'Qwen Max', use: 'Modelo análisis RIX', secret: 'DASHSCOPE_API_KEY' },
                      { provider: 'Anthropic', model: 'Claude', use: 'Agente comercial', secret: 'ANTHROPIC_API_KEY' },
                      { provider: 'Firecrawl', model: '—', use: 'Scraping webs corporativas', secret: 'FIRECRAWL_API_KEY' },
                    ].map((row) => (
                      <TableRow key={row.provider}>
                        <TableCell className="font-medium text-xs">{row.provider}</TableCell>
                        <TableCell className="text-xs">{row.model}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.use}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs font-mono">{row.secret}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Servicios auxiliares</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Servicio</TableHead>
                      <TableHead>Uso</TableHead>
                      <TableHead>Secret</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { service: 'Resend', use: 'Envío de emails (magic links, formularios de contacto)', secret: 'RESEND_API_KEY' },
                      { service: 'Tavily', use: 'Búsqueda web alternativa', secret: 'TAVILY_API_KEY' },
                      { service: 'EODHD', use: 'Precios de acciones en tiempo real', secret: 'EODHD_API_KEY' },
                    ].map((row) => (
                      <TableRow key={row.service}>
                        <TableCell className="font-medium text-xs">{row.service}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.use}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs font-mono">{row.secret}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        {/* ==================== SECCIÓN 4: CRONs ==================== */}
        <AccordionItem value="crons" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary" />
              <div className="text-left">
                <p className="font-semibold">CRONs del Sistema</p>
                <p className="text-xs text-muted-foreground font-normal">35 sweep jobs + watchdog + vector store + noticias + mantenimiento</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-2">
            {[
              {
                category: 'Barrido RIX',
                icon: <RefreshCw className="h-4 w-4" />,
                jobs: [
                  { name: 'rix-sweep-phase-01 a phase-35', schedule: 'Domingos 00:00–02:50 UTC (cada 5 min)', desc: 'Cada fase procesa ~5 empresas del censo. 35 fases cubren las 179 empresas.' },
                  { name: 'rix-sweep-watchdog-15min', schedule: 'Cada 5 min, 24/7', desc: 'Red de seguridad: detecta trabajo pendiente y lo reanuda. Dispara cadena post-barrido al 100%.' },
                ],
              },
              {
                category: 'Vector Store',
                icon: <Database className="h-4 w-4" />,
                jobs: [
                  { name: 'populate-vector-store-weekly', schedule: 'Domingos 23:00 UTC', desc: 'Indexación incremental de datos nuevos al Vector Store. Continuaciones cada 5 min hasta completar.' },
                ],
              },
              {
                category: 'Noticias',
                icon: <Globe className="h-4 w-4" />,
                jobs: [
                  { name: 'generate-news-story-weekly', schedule: 'Lunes 06:00 UTC', desc: 'Genera todas las noticias del Newsroom basadas en los datos del barrido.' },
                ],
              },
              {
                category: 'Corporate Scraping',
                icon: <Globe className="h-4 w-4" />,
                jobs: [
                  { name: 'corporate-scrape-watchdog-15min', schedule: 'Cada 15 min', desc: 'Procesa empresas pendientes de scraping web corporativo en lotes de 5.' },
                ],
              },
              {
                category: 'Mantenimiento',
                icon: <Shield className="h-4 w-4" />,
                jobs: [
                  { name: 'refresh-issuer-status-monthly', schedule: 'Día 1 cada mes, 03:00 UTC', desc: 'Audit con IA del estado de cotización, IBEX family y tickers de todos los emisores.' },
                ],
              },
            ].map((group) => (
              <Card key={group.category}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    {group.icon} {group.category}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead>Horario</TableHead>
                        <TableHead>Descripción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.jobs.map((job) => (
                        <TableRow key={job.name}>
                          <TableCell><Badge variant="outline" className="text-xs font-mono whitespace-nowrap">{job.name}</Badge></TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{job.schedule}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{job.desc}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default TechnicalDocPanel;
