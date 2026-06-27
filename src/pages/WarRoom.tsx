import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Radar, Filter, TrendingUp, Layers, Gauge, BrainCircuit, HeartPulse,
  Activity, SearchCheck, Scale, Siren, Swords, Crosshair, Lightbulb,
  ListChecks, FileOutput, Lock, ArrowRight, BarChart3, Megaphone,
  BookOpen,
} from "lucide-react";
import { Helmet } from "react-helmet-async";
import { ContactSection } from "@/components/landing/ContactSection";

type Mark = "C" | "P" | "N";

function HarveyBall({ state }: { state: Mark }) {
  const label = state === "C" ? "Completo" : state === "P" ? "Parcial" : "No disponible";
  return (
    <span role="img" aria-label={label} className="inline-flex items-center justify-center">
      <svg width="16" height="16" viewBox="0 0 16 16" className="text-foreground">
        {state === "C" && <circle cx="8" cy="8" r="6.5" fill="currentColor" />}
        {state === "P" && (
          <>
            <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M8 1.5 A6.5 6.5 0 0 0 8 14.5 Z" fill="currentColor" />
          </>
        )}
        {state === "N" && <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2" />}
      </svg>
    </span>
  );
}

const modules = [
  { block: "Monitorización e ingesta", items: [
    { icon: Radar, title: "Monitorización multicanal 24/7", desc: "Medios y redes sociales en un solo panel vivo, actualizado cada día." },
    { icon: Filter, title: "Ingesta algorítmica filtrada", desc: "Un algoritmo decide qué es señal y qué es ruido: solo entra lo relevante, nunca un volcado en bruto." },
    { icon: TrendingUp, title: "Motor de amplificación", desc: "Cada pieza se pondera por volumen, difusión y frescura para saber no solo qué se dice, sino cuánto se amplifica." },
    { icon: Layers, title: "Relatos vivos", desc: "Agrupa automáticamente la cobertura dispersa en historias con nombre, estado y criticidad: nuevas, vivas y críticas." },
  ]},
  { block: "Diagnóstico e inteligencia", items: [
    { icon: Gauge, title: "Índice de Salud Reputacional (0-100)", desc: "No mide cuánto se habla, sino la carga de riesgo: promedio ponderado de cobertura negativa, alertas, intensidad emocional, amplificación tier 1-2 y reputación ante las IAs." },
    { icon: BrainCircuit, title: "Reputación ante las IAs (GEO)", desc: "Mide cómo te perciben ChatGPT, Perplexity y Gemini. La dimensión que ninguna otra herramienta cubre." },
    { icon: HeartPulse, title: "Huella emocional", desc: "Las 8 emociones que proyecta tu marca, desglosadas, para entender el tono real más allá del positivo/negativo." },
    { icon: Activity, title: "Momentum 24h", desc: "Compara las últimas 24h con las previas para detectar el giro emocional antes de que sea titular." },
    { icon: SearchCheck, title: "Forense auditable (sin caja negra)", desc: "Cada puntuación tiene fórmula pública y enlaza a su pieza fuente. 100% trazable: la IA agrupa y nombra, no inventa notas." },
    { icon: Scale, title: "Suelos éticos y legales", desc: "Reglas explícitas que respetan la presunción de inocencia y elevan la criticidad en conflictos judiciales o laborales graves." },
  ]},
  { block: "Anticipación y acción", items: [
    { icon: Siren, title: "Radar de crisis (alerta temprana)", desc: "Mide la aceleración 24h y la concentración del riesgo, e identifica el efecto palanca que desactiva la mayor parte de la amenaza." },
    { icon: Swords, title: "Batalla de narrativas", desc: "Reparte la conversación entre tu mensaje, la crisis y la industria, ponderada por alcance, para ver si te tapan." },
    { icon: Crosshair, title: "Pieza más peligrosa ahora", desc: "Señala en cada momento la mención individual con más capacidad de daño y su engagement real." },
    { icon: Lightbulb, title: "Oportunidades ocultas", desc: "Positivos infrautilizados listos para amplificar, ventana horaria óptima de publicación y huecos narrativos que tu competencia podría ocupar." },
    { icon: ListChecks, title: "Plan del día + acciones recomendadas", desc: "Brief IA que define la batalla del día y traduce todo a acciones priorizadas por urgencia, cada una justificada con su dato." },
  ]},
  { block: "Reporting y modos", items: [
    { icon: FileOutput, title: "Salidas ejecutivas", desc: "Exporta a PDF e Informe, activa el Modo TV para sala y recibe el correo matinal automático, en ventanas de 7, 30 y 90 días con histórico." },
    { icon: BookOpen, title: "Metodología declarada", desc: "Fórmulas públicas, criterios explícitos y trazabilidad completa: sabes qué mide, por qué y cómo se calcula cada métrica. Sin caja negra." },
  ]},
];

const competitors = ["War Room", "Brandwatch", "Buzzsumo", "Brand24", "Talkwalker", "Meltwater", "Mention"];

const sources: Array<[string, Mark[]]> = [
  ["Prensa/medios online (Google News)", ["C","C","P","P","C","C","P"]],
  ["X (Twitter)",                         ["C","C","P","C","C","C","C"]],
  ["Instagram",                           ["C","C","N","C","C","C","C"]],
  ["Facebook",                            ["C","C","N","C","C","C","C"]],
  ["YouTube",                             ["C","C","C","C","C","C","P"]],
  ["TikTok",                              ["C","C","N","C","C","C","P"]],
  ["Bluesky",                             ["C","P","N","P","P","P","N"]],
  ["Ingesta algorítmica filtrada",        ["C","P","N","P","P","P","P"]],
];

const exclusiveRows = new Set([
  "Reputación ante las IAs / GEO",
  "Carga de riesgo (no volumen)",
  "Forense auditable (sin caja negra)",
  "Suelos éticos/legales",
  "Brief IA + Plan del día",
  "Acciones justificadas",
]);

const intel: Array<[string, Mark[]]> = [
  ["Reputación ante las IAs / GEO",                ["C","N","N","N","N","N","N"]],
  ["Índice Salud Reputacional 0-100",              ["C","N","N","P","N","N","N"]],
  ["Carga de riesgo (no volumen)",                 ["C","N","N","N","N","N","N"]],
  ["Agrupación en relatos vivos",                  ["C","P","N","N","P","P","N"]],
  ["Motor de amplificación",                       ["C","P","P","P","C","P","P"]],
  ["Forense auditable (sin caja negra)",           ["C","N","N","N","N","N","N"]],
  ["Trazabilidad 100% a la pieza",                 ["C","P","P","P","P","P","P"]],
  ["Suelos éticos/legales",                        ["C","N","N","N","N","N","N"]],
  ["Análisis emocional (8 emociones)",              ["C","P","N","P","C","P","N"]],
  ["Momentum 24h",                                 ["C","P","N","N","P","P","N"]],
  ["Radar de crisis (aceleración + palanca)",      ["C","P","N","P","P","P","P"]],
  ["Batalla de narrativas (por alcance)",          ["C","P","N","N","P","N","N"]],
  ["Pieza más peligrosa ahora",                    ["C","P","N","P","P","P","P"]],
  ["Oportunidades ocultas",                        ["C","P","P","N","P","P","N"]],
  ["Ventana horaria óptima publicación",           ["C","P","N","N","P","P","N"]],
  ["Huecos narrativos / silencio estratégico",     ["C","P","N","N","P","P","N"]],
  ["Brief IA + Plan del día",                      ["C","N","N","N","N","N","N"]],
  ["Acciones justificadas",                        ["C","N","N","N","N","N","N"]],
];

function scrollToContact() {
  document.getElementById("contact-section")?.scrollIntoView({ behavior: "smooth" });
}

function ModuleCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <Card className="h-full">
      <CardContent className="p-5 flex flex-col gap-3">
        <Icon className="h-6 w-6 text-foreground" strokeWidth={1.5} />
        <h3 className="text-base font-semibold leading-snug text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
      </CardContent>
    </Card>
  );
}

function ComparativaWarRoom() {
  const colCount = competitors.length + 1;
  const RowGroup = ({ label }: { label: string }) => (
    <tr className="bg-muted/40">
      <td colSpan={colCount} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        — {label} —
      </td>
    </tr>
  );
  const renderRow = ([name, marks]: [string, Mark[]]) => {
    const isExclusive = exclusiveRows.has(name);
    return (
      <tr key={name} className="border-t border-border/50">
        <td className="sticky left-0 z-10 bg-card px-4 py-3 text-sm text-foreground min-w-[260px]">
          <div className="flex items-center gap-2">
            <span>{name}</span>
            {isExclusive && <Badge variant="outline" className="text-[10px] py-0 px-1.5">Exclusivo</Badge>}
          </div>
        </td>
        {marks.map((m, i) => (
          <td key={i} className={cn("px-4 py-3 text-center", i === 0 && "bg-primary/5")}>
            <HarveyBall state={m} />
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-muted/60">
              <th className="sticky left-0 z-20 bg-muted/60 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground min-w-[260px]">
                Capacidad / Fuente
              </th>
              {competitors.map((c, i) => (
                <th key={c} className={cn(
                  "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-center",
                  i === 0 ? "bg-primary/10 text-foreground" : "text-muted-foreground"
                )}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <RowGroup label="Fuentes monitorizadas" />
            {sources.map(renderRow)}
            <RowGroup label="Inteligencia y capacidades" />
            {intel.map(renderRow)}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-border/60 bg-muted/20 text-xs text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="flex items-center gap-1.5"><HarveyBall state="C" /> Completo</span>
        <span className="flex items-center gap-1.5"><HarveyBall state="P" /> Parcial / limitado</span>
        <span className="flex items-center gap-1.5"><HarveyBall state="N" /> No disponible</span>
      </div>
      <p className="px-4 py-3 text-xs text-muted-foreground border-t border-border/60">
        Columnas War Room verificadas con paneles reales (jun 2026). Ingesta algorítmica filtrada por señal, no volcado en bruto. Capacidades de terceros según su documentación pública; varían por plan.
      </p>
    </div>
  );
}

export default function WarRoom() {
  return (
    <Layout>
      <Helmet>
        <title>War Room — Inteligencia reputacional en vivo | RepIndex</title>
        <meta name="description" content="War Room: centro de mando aliado de RepIndex que da profundidad, contexto y acción diaria a tu reputación ante medios, redes e IAs." />
      </Helmet>

      <article className="space-y-20 pb-20">
        {/* HERO */}
        <section className="pt-10 pb-4 text-center max-w-4xl mx-auto">
          <Badge variant="outline" className="mb-4">Herramienta aliada</Badge>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
            War Room — Inteligencia reputacional en vivo
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
            RepIndex mide cómo te ven las IAs. War Room es el centro de mando que da profundidad, contexto y acción a tu reputación, para cualquier empresa o directivo expuesto.
          </p>
          <Button size="lg" onClick={scrollToContact} className="gap-2">
            Solicita una demo <ArrowRight className="h-4 w-4" />
          </Button>
        </section>

        {/* PUENTE */}
        <section className="grid sm:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {[
            { icon: BarChart3, t: "Medir", d: "RepIndex calcula tu RIX Score ante 6 modelos de IA." },
            { icon: SearchCheck, t: "Reportar", d: "Informes claros y trazables." },
            { icon: Megaphone, t: "Actuar", d: "War Room convierte el diagnóstico en decisiones diarias." },
          ].map((s, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <s.icon className="h-5 w-5 text-foreground mb-3" strokeWidth={1.5} />
                <h3 className="font-semibold text-foreground mb-1">{s.t}</h3>
                <p className="text-sm text-muted-foreground">{s.d}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* ¿PARA QUIÉN? */}
        <section className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">¿Para quién?</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Card><CardContent className="p-6">
              <h3 className="font-semibold text-foreground mb-2">Empresas</h3>
              <p className="text-sm text-muted-foreground">Marcas que necesitan vigilar y defender su reputación.</p>
            </CardContent></Card>
            <Card><CardContent className="p-6">
              <h3 className="font-semibold text-foreground mb-2">Directivos y figuras públicas expuestas</h3>
              <p className="text-sm text-muted-foreground">Protección reputacional individual en tiempo real.</p>
            </CardContent></Card>
          </div>
        </section>

        {/* MÓDULOS */}
        <section className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-8 text-center">Módulos</h2>
          <div className="space-y-10">
            {modules.map((b) => (
              <div key={b.block}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">{b.block}</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {b.items.map((it) => <ModuleCard key={it.title} {...it} />)}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* DEMO */}
        <section className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-2 text-center">Demo</h2>
          <p className="text-sm text-muted-foreground text-center mb-6">War Room real con datos demo (empresa ficticia ACME).</p>
          <div className="relative rounded-lg border border-border/60 overflow-hidden bg-card shadow-soft">
            <div className="relative w-full" style={{ aspectRatio: "16 / 10" }}>
              <iframe
                src="https://acme-warroom.tiiny.co"
                title="War Room demo — ACME"
                className="absolute inset-0 w-full h-full"
                loading="lazy"
              />
            </div>
            <div className="px-4 py-2 border-t border-border/60 bg-muted/20 text-xs text-muted-foreground text-center">
              Demo navegable con datos ficticios (ACME). <a href="https://acme-warroom.tiiny.co" target="_blank" rel="noreferrer" className="underline">Abrir en nueva pestaña</a>.
            </div>
          </div>
        </section>

        {/* COMPARATIVA */}
        <section className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">Comparativa</h2>
          <ComparativaWarRoom />
        </section>

        {/* CONTACTO */}
        <ContactSection defaultInterest="War Room" />
      </article>
    </Layout>
  );
}