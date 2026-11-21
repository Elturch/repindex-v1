import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout/Layout";
import { EspecialesSubscribe } from "@/components/especiales/EspecialesSubscribe";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, ExternalLink, FlaskConical, GitCompareArrows } from "lucide-react";

// ============================================================================
// Configuración de especiales (lista estática, contenido público y cacheable).
// Para cambiar el destino del especial principal, edita SOLO estas URLs.
// TODO: cuando el análisis migre a la app, sustituir la URL provisional por
// la ruta interna "/especiales/debate/cara-a-cara-29n".
// ============================================================================
const CARA_A_CARA_29N_URL = "https://debate.warrooms.info";
const METODOLOGIA_SESGO_URL = "https://debate.warrooms.info";

interface Special {
  id: string;
  title: string;
  subtitle: string;
  status: "live" | "upcoming";
  url?: string;
}

const UPCOMING_SPECIALS: Special[] = [
  {
    id: "debate-cuatro-26n",
    title: "Debate a cuatro · 26-N",
    subtitle: "Sánchez, Feijóo, Abascal, Colau",
    status: "upcoming",
  },
];

export default function Especiales() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  // Avisos de retorno desde los enlaces de confirmación/baja del correo.
  // Se muestran una sola vez y se limpian de la URL.
  useEffect(() => {
    const confirmado = searchParams.get("confirmado");
    const baja = searchParams.get("baja");

    if (confirmado === "1") {
      toast({ title: "¡Suscripción confirmada! Te avisaremos de cada nuevo especial." });
    } else if (confirmado === "0") {
      toast({
        title: "No hemos podido confirmar tu suscripción: el enlace no es válido o ha caducado.",
        variant: "destructive",
      });
    } else if (baja === "1") {
      toast({ title: "Te has dado de baja. No recibirás más avisos de especiales." });
    } else {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.delete("confirmado");
    next.delete("baja");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout>
      <Helmet>
        <title>Especiales · RepIndex.ai</title>
        <meta
          name="description"
          content="Especiales de RepIndex.ai: análisis puntuales elaborados por el equipo de RepIndex, empezando por El Cara a Cara · 29-N."
        />
      </Helmet>

      <div className="max-w-screen-xl mx-auto py-4 space-y-12">
        {/* Cabecera de la sección */}
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Especiales</h1>
          <p className="text-muted-foreground max-w-2xl">
            Análisis puntuales elaborados por el equipo de RepIndex.ai, fuera del
            seguimiento semanal habitual.
          </p>
        </header>

        {/* Pieza destacada */}
        <section aria-label="Especial destacado">
          <Card className="overflow-hidden border-primary/20">
            <CardHeader className="space-y-3 pb-4">
              <Badge variant="secondary" className="w-fit">
                Especial destacado
              </Badge>
              <CardTitle className="text-2xl sm:text-3xl leading-tight">
                El Cara a Cara · 29-N
              </CardTitle>
              <CardDescription className="text-base sm:text-lg">
                Sánchez frente a Feijóo, analizado frase a frase por la IA de RepIndex
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
                Análisis del equipo de RepIndex.ai · 13 secciones · doble puntuación
                a ciegas, con verificadores y estadísticos independientes · elaborado
                con IA
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="gap-2">
                  <a href={CARA_A_CARA_29N_URL} target="_blank" rel="noopener noreferrer">
                    Leer el análisis
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <a href={METODOLOGIA_SESGO_URL} target="_blank" rel="noopener noreferrer">
                    <FlaskConical className="h-4 w-4" />
                    Metodología y control de sesgo
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Suscripción por correo */}
        <section aria-label="Suscripción a especiales" className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Recibe cada nuevo especial</h2>
          <EspecialesSubscribe source="especiales-index" />
        </section>

        {/* Rejilla de próximos especiales */}
        <section aria-label="Más especiales" className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Más especiales</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {UPCOMING_SPECIALS.map((special) => (
              <Card key={special.id} className="flex flex-col">
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg leading-snug">{special.title}</CardTitle>
                    <Badge variant="outline" className="shrink-0">
                      Próximamente
                    </Badge>
                  </div>
                  <CardDescription>{special.subtitle}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  {special.url ? (
                    <Button asChild variant="outline" size="sm" className="gap-2">
                      <a href={special.url} target="_blank" rel="noopener noreferrer">
                        Ver especial
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Disponible próximamente.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Comparativa transversal (futura) */}
        <section aria-label="Comparativa" className="space-y-4">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold tracking-tight">Comparativa</h2>
          </div>
          <Card className="border-dashed">
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Próximamente: la evolución entre debates.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </Layout>
  );
}
