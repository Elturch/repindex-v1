import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { EspecialesSubscribe } from "@/components/especiales/EspecialesSubscribe";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// Portada de Especiales, organizada como la portada de un diario digital:
// secciones (Elecciones 29-N, Empresas), una noticia-resumen por especial,
// y al final lo que viene y cómo trabajamos.
// Catálogo en Supabase: public.especiales_categorias y public.especiales
// (columnas de portada: seccion, titular, entradilla, cuerpo, enlaces, orden_portada).
// ============================================================================

type Categoria = { slug: string; nombre: string; descripcion: string; ambito: string; orden: number };
type Enlace = { t: string; u: string };
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
  seccion: string | null;
  titular: string | null;
  entradilla: string | null;
  cuerpo: string | null;
  enlaces: Enlace[] | null;
  orden_portada: number | null;
};

const COLS =
  "slug,categoria_slug,titulo,subtitulo,entidad,fecha_evento,etiqueta_fecha,estado,url,url_externa,metodo_url,destacado,resumen,cifras,publicado_at,seccion,titular,entradilla,cuerpo,enlaces,orden_portada";

async function fetchCatalogo() {
  const sb = supabase as any;
  const [c, e] = await Promise.all([
    sb.from("especiales_categorias").select("*").order("orden"),
    sb.from("especiales").select(COLS).in("estado", ["publicado", "proximamente"]),
  ]);
  if (c.error || e.error || !c.data?.length) throw new Error("catalogo");
  return { categorias: c.data as Categoria[], especiales: e.data as Especial[] };
}

function Go({ to, ext, children, className }: { to: string | null; ext?: boolean; children: React.ReactNode; className?: string }) {
  if (!to) return <span className={className}>{children}</span>;
  if (ext || to.startsWith("http")) return <a className={className} href={to} target="_blank" rel="noopener noreferrer">{children}</a>;
  if (to.includes("#")) return <a className={className} href={to}>{children}</a>;
  return <Link className={className} to={to}>{children}</Link>;
}

const hoy = () =>
  new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase());

const CSS = `
.ep{--ink:#15130f;--muted:#6b665c;--line:#d9d3c5;--paper:#f6f3ec;--acc:#5b6b1f;--warn:#b3192b;background:var(--paper);color:var(--ink);font-family:'Source Serif 4',Georgia,serif}
.ep a{color:inherit;text-decoration:none}
.ep .w{max-width:1200px;margin:0 auto;padding:0 24px}
.ep .top{display:flex;justify-content:space-between;font:600 12px/1 'Libre Franklin',system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:14px 0 10px;border-bottom:1px solid var(--line)}
.ep .plate{display:flex;align-items:baseline;justify-content:space-between;gap:24px;flex-wrap:wrap;padding:14px 0 10px;border-bottom:3px double var(--ink)}
.ep .plate h1{font-family:'Libre Caslon Text',Georgia,serif;font-weight:700;font-size:44px;line-height:1;margin:0;letter-spacing:-.01em}
.ep .plate p{margin:0;font-size:15px;color:var(--muted);max-width:560px}
.ep nav.sec{display:flex;gap:22px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--ink);font:700 12px 'Libre Franklin',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}
.ep nav.sec a:hover{color:var(--acc)}
.ep section.s{padding:26px 0 8px}
.ep .sh{display:flex;align-items:baseline;gap:12px;border-top:3px solid var(--ink);padding-top:8px;margin-bottom:16px}
.ep .sh h2{font:800 15px 'Libre Franklin',system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;margin:0}
.ep .sh span{font-size:13px;color:var(--muted)}
.ep .g-lead{display:grid;grid-template-columns:2fr 1fr;gap:28px}
.ep .g-lead>aside{border-left:1px solid var(--line);padding-left:28px}
.ep .g2{display:grid;grid-template-columns:1fr 1fr;gap:28px;border-top:1px solid var(--line);margin-top:22px;padding-top:20px}
.ep .g2>article+article{border-left:1px solid var(--line);padding-left:28px}
.ep .kick{font:700 11px 'Libre Franklin',system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--acc);margin-bottom:6px}
.ep .kick em{font-style:normal;color:var(--muted);font-weight:600}
.ep h3{font-family:'Libre Caslon Text',Georgia,serif;font-weight:700;margin:0 0 8px;line-height:1.15}
.ep .lead h3{font-size:34px}
.ep .sub h3{font-size:23px}
.ep aside h3{font-size:21px}
.ep h3 a:hover{text-decoration:underline;text-decoration-thickness:1px}
.ep .ent{font-size:18px;line-height:1.5;margin:0 0 12px}
.ep .sub .ent,.ep aside .ent{font-size:16px}
.ep .cuerpo p{font-size:15.5px;line-height:1.55;margin:0 0 10px;color:#2b2822}
.ep .figs{display:flex;border-top:1px solid var(--ink);border-bottom:1px solid var(--line);margin:12px 0}
.ep .figs a{flex:1;padding:8px 10px 8px 0;border-right:1px solid var(--line);margin-right:10px}
.ep .figs a:last-child{border-right:0}
.ep .figs b{display:block;font:700 26px 'Libre Franklin',system-ui,sans-serif;line-height:1.1}
.ep .figs small{display:block;font-size:12px;color:var(--muted);line-height:1.3}
.ep .sub .figs b{font-size:20px}
.ep .figs a:hover b{color:var(--acc)}
.ep ul.rel{list-style:none;padding:0;margin:10px 0 0}
.ep ul.rel li{font-size:14.5px;padding:6px 0;border-top:1px solid var(--line)}
.ep ul.rel li:before{content:"→ ";color:var(--acc);font-weight:700}
.ep ul.rel a:hover{text-decoration:underline}
.ep .cta{display:inline-block;margin-top:10px;font:700 13px 'Libre Franklin',system-ui,sans-serif;color:var(--acc)}
.ep .cta:hover{text-decoration:underline}
.ep .cta2{font:600 12px 'Libre Franklin',system-ui,sans-serif;color:var(--muted);margin-left:14px}
.ep .seal{background:#15130f;color:#f6f3ec;padding:18px}
.ep .seal .kick{color:#d9c46a}
.ep .seal .ent{color:#e8e3d6}
.ep .seal .cuerpo p{color:#cfc9bb}
.ep .seal .cta{color:#d9c46a}
.ep .soon{font-size:14px}
.ep .soon li{list-style:none;padding:8px 0;border-top:1px solid var(--line)}
.ep .soon b{font-family:'Libre Caslon Text',Georgia,serif}
.ep .chip{display:inline-block;font:700 10px 'Libre Franklin',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--ink);padding:2px 6px;margin-left:6px;vertical-align:middle}
.ep .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:0}
.ep .g4>div{padding:12px 16px 12px 0;border-top:1px solid var(--line)}
.ep .g4 h4{font:700 15px 'Libre Caslon Text',Georgia,serif;margin:0 0 4px}
.ep .g4 p{font-size:13.5px;color:var(--muted);margin:0;line-height:1.45}
.ep .how{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-top:1px solid var(--ink)}
.ep .how div{padding:12px 16px 12px 0;font-size:14px;line-height:1.45}
.ep .how b{display:block;font:700 12px 'Libre Franklin',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
.ep .subs{border-top:3px solid var(--ink);margin-top:26px;padding:16px 0 26px;display:grid;grid-template-columns:1fr 1.4fr;gap:24px;align-items:center}
.ep .subs h2{font-family:'Libre Caslon Text',Georgia,serif;font-size:24px;margin:0 0 4px}
.ep footer{border-top:1px solid var(--line);padding:14px 0 30px;font-size:13px;color:var(--muted)}
@media (max-width:900px){
 .ep .g-lead,.ep .g2,.ep .subs{grid-template-columns:1fr}
 .ep .g-lead>aside{border-left:0;padding-left:0;border-top:1px solid var(--line);padding-top:18px}
 .ep .g2>article+article{border-left:0;padding-left:0;border-top:1px solid var(--line);padding-top:18px}
 .ep .g4,.ep .how{grid-template-columns:1fr 1fr}
 .ep .lead h3{font-size:27px}
 .ep .plate h1{font-size:34px}
 .ep .figs{flex-wrap:wrap}.ep .figs a{flex:1 1 45%}
}
`;

function Kicker({ e, cats }: { e: Especial; cats: Categoria[] }) {
  const cat = cats.find((c) => c.slug === e.categoria_slug)?.nombre ?? "";
  return (
    <div className="kick">
      {cat}
      {e.etiqueta_fecha ? <em> · {e.etiqueta_fecha}</em> : null}
    </div>
  );
}

function Noticia({ e, cats, size }: { e: Especial; cats: Categoria[]; size: "lead" | "sub" | "side" }) {
  const parrafos = (e.cuerpo ?? e.resumen ?? "").split(/\n\n+/).filter(Boolean);
  const cifras = size === "side" ? [] : e.cifras ?? [];
  return (
    <>
      <Kicker e={e} cats={cats} />
      <h3>
        <Go to={e.url} ext={e.url_externa}>{e.titular || e.titulo}</Go>
      </h3>
      {e.entradilla && <p className="ent">{e.entradilla}</p>}
      {cifras.length > 0 && (
        <div className="figs">
          {cifras.map((c) => (
            <Go key={c.k} to={e.url} ext={e.url_externa}>
              <b>{c.v}</b>
              <small>{c.k}</small>
            </Go>
          ))}
        </div>
      )}
      {size !== "sub" || parrafos.length ? (
        <div className="cuerpo">{parrafos.map((p, i) => <p key={i}>{p}</p>)}</div>
      ) : null}
      {(e.enlaces ?? []).length > 0 && (
        <ul className="rel">
          {(e.enlaces ?? []).map((l) => (
            <li key={l.t}><Go to={l.u}>{l.t}</Go></li>
          ))}
        </ul>
      )}
      <div>
        <Go to={e.url} ext={e.url_externa} className="cta">{e.url_externa ? "Leer el análisis completo ↗" : `Leer el especial: ${e.titulo} →`}</Go>
        {e.metodo_url ? <Go to={e.metodo_url} className="cta2">Método</Go> : null}
      </div>
    </>
  );
}

export default function Especiales() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["especiales-portada"], queryFn: fetchCatalogo, staleTime: 60_000, retry: 1 });

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

  const cats = data?.categorias ?? [];
  const pub = (data?.especiales ?? []).filter((e) => e.estado === "publicado");
  const ord = (a: Especial, b: Especial) => (a.orden_portada ?? 100) - (b.orden_portada ?? 100) || (b.fecha_evento ?? "").localeCompare(a.fecha_evento ?? "");
  const elecciones = pub.filter((e) => e.seccion === "elecciones").sort(ord);
  const empresas = pub.filter((e) => e.seccion === "empresas").sort(ord);
  const otros = pub.filter((e) => e.seccion !== "elecciones" && e.seccion !== "empresas").sort(ord);
  const proximos = (data?.especiales ?? []).filter((e) => e.estado === "proximamente");
  const catsSinPublicar = cats.filter((c) => !pub.some((e) => e.categoria_slug === c.slug));
  const catsEmpresaSin = catsSinPublicar.filter((c) => c.ambito === "empresa");

  const [eLead, eSide, ...eResto] = elecciones;
  const [emLead, ...emResto] = empresas;

  return (
    <Layout>
      <Helmet>
        <title>Especiales · RepIndex.ai</title>
        <meta name="description" content="Especiales de RepIndex.ai: debates electorales, juntas de accionistas y otros grandes directos, analizados con IA desde la grabación íntegra y verificados con fuentes oficiales." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&family=Libre+Franklin:wght@600;700;800&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=swap" />
      </Helmet>
      <style>{CSS}</style>
      <div className="ep">
        <div className="w">
          <div className="top">
            <span>{hoy()}</span>
            <span>RepIndex.ai</span>
          </div>
          <div className="plate">
            <h1>Especiales</h1>
            <p>Los grandes directos de España, examinados frase a frase desde la grabación íntegra y verificados con documentos oficiales.</p>
          </div>
          <nav className="sec" aria-label="Secciones">
            {elecciones.length > 0 && <a href="#elecciones">Elecciones 29-N</a>}
            {empresas.length > 0 && <a href="#empresas">Empresas</a>}
            {otros.length > 0 && <a href="#mas">Más especiales</a>}
            <a href="#proximamente">Próximamente</a>
            <a href="#como">Cómo trabajamos</a>
            <a href="#avisos">Avisos</a>
          </nav>

          {!data && <p style={{ padding: "40px 0", color: "#6b665c" }}>Cargando la portada…</p>}

          {elecciones.length > 0 && (
            <section className="s" id="elecciones">
              <div className="sh"><h2>Elecciones generales 29-N</h2><span>Debates de campaña y la noche electoral</span></div>
              <article className="lead" style={{ marginBottom: 24 }}>
                <div className="kick">Noche electoral<em> · Domingo 29</em></div>
                <h3><Go to="/especiales/elecciones/noche-29n">La Noche Electoral</Go></h3>
                <p className="ent">En directo el domingo 29 desde las 20:00. Proyección con los datos oficiales del Ministerio del Interior.</p>
                <div><Go to="/especiales/elecciones/noche-29n" className="cta">Leer el especial: La Noche Electoral →</Go></div>
              </article>
              <div className="g-lead">
                {eLead && <article className="lead"><Noticia e={eLead} cats={cats} size="lead" /></article>}
                {eSide && (
                  <aside>
                    <div className={eSide.slug.startsWith("apuesta") ? "seal" : ""}>
                      <Noticia e={eSide} cats={cats} size="side" />
                    </div>
                  </aside>
                )}
              </div>
              {eResto.length > 0 && (
                <div className="g2">
                  {eResto.map((e) => (
                    <article key={e.slug} className="sub"><Noticia e={e} cats={cats} size="sub" /></article>
                  ))}
                </div>
              )}
            </section>
          )}

          {empresas.length > 0 && (
            <section className="s" id="empresas">
              <div className="sh"><h2>Empresas</h2><span>Juntas de accionistas y grandes citas económicas</span></div>
              <div className="g-lead">
                {emLead && <article className="lead"><Noticia e={emLead} cats={cats} size="lead" /></article>}
                <aside>
                  <div className="kick">En preparación</div>
                  <h3>Las próximas juntas del IBEX 35</h3>
                  <p className="ent">Analizaremos cada junta desde su grabación íntegra: lo que se prometió, lo que se cumplió y lo que no se dijo.</p>
                  <ul className="soon" style={{ padding: 0, margin: 0 }}>
                    {proximos.filter((p) => cats.find((c) => c.slug === p.categoria_slug)?.ambito === "empresa").map((p) => (
                      <li key={p.slug}><b>{p.titulo}</b><span className="chip">En camino</span></li>
                    ))}
                    {catsEmpresaSin.map((c) => (
                      <li key={c.slug}><b>{c.nombre}</b><span className="chip">Próximamente</span><div style={{ color: "#6b665c", fontSize: 13 }}>{c.descripcion}</div></li>
                    ))}
                  </ul>
                </aside>
              </div>
              {emResto.length > 0 && (
                <div className="g2">
                  {emResto.map((e) => (
                    <article key={e.slug} className="sub"><Noticia e={e} cats={cats} size="sub" /></article>
                  ))}
                </div>
              )}
            </section>
          )}

          {otros.length > 0 && (
            <section className="s" id="mas">
              <div className="sh"><h2>Más especiales</h2></div>
              <div className="g2" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
                {otros.map((e) => (
                  <article key={e.slug} className="sub"><Noticia e={e} cats={cats} size="sub" /></article>
                ))}
              </div>
            </section>
          )}

          <section className="s" id="proximamente">
            <div className="sh"><h2>Próximamente</h2><span>Un vigilante revisa cada semana el calendario de juntas, del Congreso y del Gobierno</span></div>
            <div className="g4">
              {proximos.filter((p) => cats.find((c) => c.slug === p.categoria_slug)?.ambito !== "empresa").map((p) => (
                <div key={p.slug}><h4>{p.titulo}<span className="chip">En camino</span></h4><p>{p.subtitulo || p.resumen}</p></div>
              ))}
              {catsSinPublicar.filter((c) => c.ambito !== "empresa").map((c) => (
                <div key={c.slug}><h4>{c.nombre}</h4><p>{c.descripcion}</p></div>
              ))}
            </div>
          </section>

          <section className="s" id="como">
            <div className="sh"><h2>Cómo trabajamos</h2></div>
            <div className="how">
              <div><b>La grabación íntegra</b>Es la única fuente. Si un directo se publica recortado o solo con los discursos, no lo analizamos y lo contamos.</div>
              <div><b>Verificación oficial</b>Cada cifra se coteja solo con documentos oficiales. Lo que no se puede comprobar se dice, no se da por falso.</div>
              <div><b>Doble lectura a ciegas</b>Dos evaluadores independientes puntúan sin conocer el trabajo del otro; un árbitro resuelve las diferencias.</div>
              <div><b>IA con supervisión</b>Elaborado con inteligencia artificial y revisado por el equipo editorial de RepIndex.ai.</div>
            </div>
          </section>

          <div className="subs" id="avisos">
            <div>
              <h2>Recibe cada nuevo especial</h2>
              <p style={{ margin: 0, color: "#6b665c", fontSize: 14 }}>Un aviso por correo cuando publiquemos un especial. Nada más.</p>
            </div>
            <EspecialesSubscribe source="especiales-index" />
          </div>

          <footer>RepIndex.ai · Especiales. Productos elaborados con inteligencia artificial y supervisión editorial. Un análisis del equipo de RepIndex.ai.</footer>
        </div>
      </div>
    </Layout>
  );
}
