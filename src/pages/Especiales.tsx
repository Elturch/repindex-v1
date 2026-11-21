import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { EspecialesSubscribe } from "@/components/especiales/EspecialesSubscribe";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import "@/components/especiales/junta/junta.css";

// ============================================================================
// Índice de Especiales. El catálogo (categorías y especiales) vive en Supabase:
// tablas public.especiales_categorias y public.especiales (lectura pública por RLS).
// Si la consulta falla, se muestra la copia de respaldo FALLBACK de abajo.
// ============================================================================

type Categoria = { slug: string; nombre: string; descripcion: string; ambito: string; orden: number };
type Especial = {
  slug: string;
  categoria_slug: string;
  titulo: string;
  subtitulo: string | null;
  entidad: string | null;
  fecha_evento: string | null;
  etiqueta_fecha: string | null;
  estado: "publicado" | "proximamente";
  url: string | null;
  url_externa: boolean;
  metodo_url: string | null;
  destacado: boolean;
  resumen: string | null;
  cifras: { k: string; v: string }[];
  publicado_at: string | null;
};

const FALLBACK: { categorias: Categoria[]; especiales: Especial[] } = {
  categorias: [
    { slug: "debates-electorales", nombre: "Debates electorales", descripcion: "Cara a caras y debates a varios en televisión, analizados frase a frase: ideas, tono y veracidad.", ambito: "politica", orden: 10 },
    { slug: "juntas-accionistas", nombre: "Juntas generales de accionistas", descripcion: "Las juntas del IBEX 35 y de las grandes no cotizadas, desde la grabación íntegra: lo que se dijo, lo que se verificó y lo que se prometió.", ambito: "empresa", orden: 20 },
    { slug: "juntas-extraordinarias", nombre: "Juntas extraordinarias", descripcion: "Fusiones, OPAs, ampliaciones y cambios de control: las juntas convocadas fuera de calendario, cuando más está en juego.", ambito: "empresa", orden: 30 },
    { slug: "estado-nacion", nombre: "Debate sobre el estado de la Nación", descripcion: "El gran examen anual al Gobierno en el Congreso: cifras, promesas y réplicas, verificadas.", ambito: "politica", orden: 40 },
    { slug: "investiduras", nombre: "Investiduras", descripcion: "Los debates en los que se elige presidente del Gobierno: programa, apoyos y compromisos.", ambito: "politica", orden: 50 },
    { slug: "mociones-censura", nombre: "Mociones de censura", descripcion: "El cara a cara parlamentario más duro: candidato alternativo, acusaciones y votación.", ambito: "politica", orden: 60 },
    { slug: "sesiones-control", nombre: "Sesiones de control", descripcion: "Las preguntas al Gobierno de los miércoles, cuando un tema candente las convierte en noticia.", ambito: "politica", orden: 70 },
    { slug: "comparecencias", nombre: "Comparecencias", descripcion: "Comparecencias extraordinarias del presidente del Gobierno, ministros o el gobernador del Banco de España.", ambito: "politica", orden: 80 },
    { slug: "noches-electorales", nombre: "Noches electorales", descripcion: "Resultados y discursos en directo: lo que dijo cada líder frente a lo que dijeron las urnas.", ambito: "politica", orden: 90 },
    { slug: "foros", nombre: "Foros y grandes citas económicas", descripcion: "Los foros donde hablan los presidentes del IBEX y el Gobierno, cuando hay algo que contar.", ambito: "empresa", orden: 100 },
  ],
  especiales: [
    { slug: "junta-mapfre-2026", categoria_slug: "juntas-accionistas", titulo: "La Junta de MAPFRE, examinada minuto a minuto", subtitulo: "Junta General de MAPFRE · 13 de marzo de 2026 · analizada desde la grabación íntegra del directo", entidad: "MAPFRE", fecha_evento: "2026-03-13", etiqueta_fecha: "13-M", estado: "publicado", url: "/especiales/juntas/mapfre-2026", url_externa: false, metodo_url: "/especiales/juntas/mapfre-2026/metodo", destacado: true, resumen: "MAPFRE cumplió lo que prometió, salvo el crecimiento: en la junta cambió la forma de medirlo. 11 secciones · acta de 138 momentos enlazados al minuto exacto del vídeo · 32 cifras verificadas a doble ciego con documentos oficiales.", cifras: [{ k: "Fiabilidad del relato", v: "91/100" }, { k: "Promesas de 2025 cumplidas", v: "5 de 6" }, { k: "Brecha relato-cifras", v: "Media" }, { k: "Esquive en las preguntas", v: "43%" }], publicado_at: null },
    { slug: "cara-a-cara-29n", categoria_slug: "debates-electorales", titulo: "El Cara a Cara · 29-N", subtitulo: "Sánchez frente a Feijóo, analizado frase a frase por la IA de RepIndex", entidad: null, fecha_evento: null, etiqueta_fecha: "29-N", estado: "publicado", url: "https://debate.warrooms.info", url_externa: true, metodo_url: "https://debate.warrooms.info", destacado: true, resumen: "13 secciones · doble puntuación a ciegas, con verificadores y estadísticos independientes · elaborado con IA", cifras: [], publicado_at: null },
    { slug: "debate-cuatro-26n", categoria_slug: "debates-electorales", titulo: "Debate a cuatro · 26-N", subtitulo: "Sánchez, Feijóo, Abascal, Colau", entidad: null, fecha_evento: null, etiqueta_fecha: "26-N", estado: "proximamente", url: null, url_externa: false, metodo_url: null, destacado: false, resumen: "Se analizará desde la grabación íntegra del directo.", cifras: [], publicado_at: null },
  ],
};

const COLS = "slug,categoria_slug,titulo,subtitulo,entidad,fecha_evento,etiqueta_fecha,estado,url,url_externa,metodo_url,destacado,resumen,cifras,publicado_at";

async function fetchCatalogo() {
  const sb = supabase as any;
  const [c, e] = await Promise.all([
    sb.from("especiales_categorias").select("*").order("orden"),
    sb.from("especiales").select(COLS).in("estado", ["publicado", "proximamente"]),
  ]);
  if (c.error || e.error || !c.data?.length) throw new Error("catalogo");
  return { categorias: c.data as Categoria[], especiales: e.data as Especial[] };
}

function Go({ e, children, className }: { e: Especial; children: React.ReactNode; className?: string }) {
  if (!e.url) return <span className={className}>{children}</span>;
  return e.url_externa ? (
    <a className={className} href={e.url} target="_blank" rel="noopener noreferrer">{children}</a>
  ) : (
    <Link className={className} to={e.url}>{children}</Link>
  );
}

function MetodoLink({ e }: { e: Especial }) {
  if (!e.metodo_url) return null;
  return e.metodo_url.startsWith("http") ? (
    <a className="go2" href={e.metodo_url} target="_blank" rel="noopener noreferrer">Método y control de sesgo</a>
  ) : (
    <Link className="go2" to={e.metodo_url}>Método y control de sesgo</Link>
  );
}

const hoy = () =>
  new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase());

export default function Especiales() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["especiales-catalogo"], queryFn: fetchCatalogo, staleTime: 5 * 60_000, retry: 1 });
  const cat = data ?? FALLBACK;

  // Avisos de retorno desde los enlaces de confirmación/baja del correo.
  useEffect(() => {
    const confirmado = searchParams.get("confirmado");
    const baja = searchParams.get("baja");
    if (confirmado === "1") toast({ title: "¡Suscripción confirmada! Te avisaremos de cada nuevo especial." });
    else if (confirmado === "0") toast({ title: "No hemos podido confirmar tu suscripción: el enlace no es válido o ha caducado.", variant: "destructive" });
    else if (baja === "1") toast({ title: "Te has dado de baja. No recibirás más avisos de especiales." });
    else return;
    const next = new URLSearchParams(searchParams);
    next.delete("confirmado");
    next.delete("baja");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nombreCat = (s: string) => cat.categorias.find((c) => c.slug === s)?.nombre ?? "";
  const publicados = cat.especiales
    .filter((e) => e.estado === "publicado")
    .sort((a, b) => Number(b.destacado) - Number(a.destacado) || (b.fecha_evento ?? "").localeCompare(a.fecha_evento ?? ""));
  const proximos = cat.especiales.filter((e) => e.estado === "proximamente");

  return (
    <Layout>
      <Helmet>
        <title>Especiales · RepIndex.ai</title>
        <meta name="description" content="Especiales de RepIndex.ai: juntas de accionistas, debates electorales, estado de la Nación, investiduras y otros grandes directos, analizados con IA desde la grabación íntegra y verificados con fuentes oficiales." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=swap" />
      </Helmet>
      <div className="jwsj">
        <div className="mast">
          <span>{hoy()}</span>
          <span>RepIndex.ai · Especiales</span>
        </div>

        <header className="band" style={{ borderTop: 0 }}>
          <div className="wrap">
            <div className="kicker">Especiales RepIndex</div>
            <h1>Lo que se dice en directo, examinado frase a frase</h1>
            <p className="deck">Análisis con inteligencia artificial de los grandes directos de España: juntas de accionistas, debates electorales y el Parlamento. La fuente es siempre la grabación íntegra; cada cifra se verifica con documentos oficiales y cada frase enlaza a su minuto.</p>
            <div className="truth">
              <span>La grabación íntegra del directo es la fuente de verdad</span>
              <span>Verificación solo con documentos oficiales</span>
              <span>Doble puntuación a ciegas</span>
              <span>Elaborado con IA y supervisión editorial</span>
            </div>
          </div>
        </header>

        <section className="band" aria-label="Especiales publicados">
          <div className="wrap">
            <h2>Publicados</h2>
            <div className="esp-feat">
              {publicados.map((e) => (
                <article key={e.slug} className="esp-card">
                  <div className="no">{nombreCat(e.categoria_slug).toUpperCase()}{e.etiqueta_fecha ? ` · ${e.etiqueta_fecha}` : ""}</div>
                  <h3><Go e={e}>{e.titulo}</Go></h3>
                  {e.subtitulo && <p className="sub">{e.subtitulo}</p>}
                  {e.cifras?.length > 0 && (
                    <div className="esp-figs">
                      {e.cifras.map((c) => (
                        <Go key={c.k} e={e} className="esp-fig"><span className="n">{c.v}</span><span className="k">{c.k}</span></Go>
                      ))}
                    </div>
                  )}
                  {e.resumen && <p className="small">{e.resumen}</p>}
                  <div className="esp-actions">
                    <Go e={e} className="go">{e.url_externa ? "Leer el análisis ↗" : "Leer el especial →"}</Go>
                    <MetodoLink e={e} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {proximos.length > 0 && (
          <section className="band" aria-label="Próximos especiales">
            <div className="wrap">
              <h2>En camino</h2>
              <ul className="list">
                {proximos.map((e) => (
                  <li key={e.slug}>
                    <span className="st cur">Próximamente</span>
                    <b>{e.titulo}</b>{e.subtitulo ? ` — ${e.subtitulo}` : ""}
                    <div className="small">{nombreCat(e.categoria_slug)}{e.resumen ? ` · ${e.resumen}` : ""}</div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className="band" aria-label="Lo que cubrimos">
          <div className="wrap">
            <h2>Lo que cubrimos</h2>
            <p className="small">Cada tipo de directo tiene su propia batería de agentes. Un vigilante revisa cada semana el calendario de juntas, del Congreso y del Gobierno para que no se escape ninguno.</p>
            <ol className="toc">
              {cat.categorias.map((c) => {
                const pub = cat.especiales.filter((e) => e.categoria_slug === c.slug && e.estado === "publicado");
                const prox = cat.especiales.filter((e) => e.categoria_slug === c.slug && e.estado === "proximamente");
                return (
                  <li key={c.slug} id={`cat-${c.slug}`}>
                    <div className="cat">
                      <span className="no">{c.ambito === "empresa" ? "EMPRESAS" : c.ambito === "politica" ? "POLÍTICA" : "OTROS"}</span>
                      <h3>{c.nombre}</h3>
                      <p>{c.descripcion}</p>
                      {pub.map((e) => (
                        <div key={e.slug} className="cat-item"><Go e={e} className="go">{e.titulo} →</Go></div>
                      ))}
                      {prox.map((e) => (
                        <div key={e.slug} className="cat-item small">En camino: {e.titulo}</div>
                      ))}
                      {pub.length === 0 && prox.length === 0 && <div className="cat-item small"><span className="st cur">Próximamente</span></div>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="band" aria-label="Suscripción a especiales">
          <div className="wrap">
            <h2>Recibe cada nuevo especial</h2>
            <p className="small">Un aviso por correo cuando publiquemos un especial. Nada más.</p>
            <div className="esp-sub"><EspecialesSubscribe source="especiales-index" /></div>
          </div>
        </section>

        <footer className="band small">
          <div className="wrap">RepIndex.ai · Especiales. Productos elaborados con inteligencia artificial y supervisión editorial. Solo analizamos directos publicados completos: si una grabación está recortada o solo recoge los discursos, no se analiza, y lo contamos.</div>
        </footer>
      </div>
    </Layout>
  );
}
