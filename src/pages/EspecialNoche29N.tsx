import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout/Layout";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, Legend,
} from "recharts";

/* Endpoint de datos (la página no calcula nada; solo pinta). */
export const ELEC29N_STATE_URL = "https://jzkjykmrwisijiqlwuua.supabase.co/functions/v1/elec29n?op=state";
const REFRESH_MS = 20_000;

/* Paleta editorial tipo WSJ (estilo propio del especial, como el HTML del Debate a Ocho). */
const C = { paper: "#f6f1e4", ink: "#1d1a14", muted: "#6b6455", rule: "#d8cfb8", olive: "#5b6b2e", ochre: "#b8862b", red: "#9e2b25", grey: "#8a8475", card: "#fbf8ef" };
const SERIF = "Georgia, 'Times New Roman', serif";

type Any = any;
type Pastilla = { ts: string; clave: string; tipo: "inicio" | "certeza" | "vuelco" | "primera" | "hora" | "mayoria" | "escanos" | "engano" | "poder" | "alambre" | "cera" | "apuesta" | "calidad" | "tramo"; texto: string; ancla: string; prioridad: 1 | 2 | 3; partido: string | null; escrutado: number };
type Certeza = { id: string; texto: string; prob: number; ambito: string; ancla: string; prov: string | null; estado: "seguro" | "abierto"; hora?: string; minutos?: number };
type Ultimo = { winner: string; runnerUp: string; votesNeeded: number };
type EnJuegoProvincia = { p: string; nombre: string; escanos: number; cerrado: number; enJuego: number; votosPorEscano: number; valorVoto: number; ultimo: Ultimo | null; escrutado: number };
type Panel = {
  [key: string]: Any;
  vacio?: boolean;
  certezas?: { seguro?: Certeza[]; abierto?: Certeza[]; conHora?: Certeza[]; nota?: string };
  pendiente?: { votosPendientes?: number; filas?: { k: string; nombre: string; contado: number; pendiente: number; cuotaContado: number; cuotaFinal: number; diferencia: number }[]; bolsas?: { cls: string; nombre: string; votos: number; inclinacion?: { k: string; nombre: string; cuota: number }[] }[]; engano?: { recuentoNombre: string; proyeccionNombre: string } | null };
  porque?: { desde?: string | null; escAntes?: number | null; cambios?: { k: string; nombre: string; antes: number; ahora: number; delta: number; provincias?: { p: string; nombre: string; d: number; escAntes: number; escAhora: number }[] }[] };
  poder?: { partidos?: { k: string; nombre: string; poder: number; p10: number; p90: number; escanos: number }[]; nota?: string };
  enJuego?: { total?: number; provincias?: EnJuegoProvincia[]; nota?: string };
  apuesta?: { total: number; aciertaMasVotado: number; repartoExacto: number; nacional?: { k: string; nombre: string; apuesta: number; ahora: number }[]; provincias?: { p: string; nombre: string; apuestaMasVotado: string; ahoraMasVotado: string; aciertaMasVotado: boolean; repartoExacto: boolean }[]; sha256?: string; nota?: string } | null;
  calidad?: { cuarentena?: { id: string; n: string; p: string; motivo: string }[]; nota?: string };
};
type Estado = { modo?: "simulacro" | "real"; panel?: Panel | null; historia?: Any[]; relato?: Any[]; pastillas?: Pastilla[]; sobre2?: { sellado_at?: string; sha256?: string } | null };
const GUARDARRAILES = "Ninguna cifra la escribe una inteligencia artificial: todas salen del motor de cálculo. Los titulares se generan con reglas fijas y un verificador comprueba que cada número del texto coincide con los datos; si no coincide, no se publica. Solo se declara primera fuerza con un 90 % o más. Nada se publica por debajo del 0,5 % escrutado.";
const madrid = (ts?: string | Date | null) => ts ? new Date(ts).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }) : "—";
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-ES", { maximumFractionDigits: 1 })}`;
function EditorialButton({ className = "", style, ...props }: ButtonProps) {
  return <Button variant="ghost" className={`block h-auto rounded-none whitespace-normal p-0 hover:opacity-80 ${className}`} style={{ color: C.ink, background: "transparent", ...style }} {...props} />;
}
const pct = (x?: number | null) => (x == null ? "—" : `${Math.round(x * 100)} %`);
const num = (x?: number | null) => (x == null ? "—" : x.toLocaleString("es-ES"));
/* Separador de miles es-ES también con 4 cifras (1.317). */
const miles = (x?: number | null) => {
  if (x == null || Number.isNaN(x)) return "—";
  const [i, d] = x.toLocaleString("es-ES", { maximumFractionDigits: 1, useGrouping: false }).split(",");
  const neg = i.startsWith("-"); const int = (neg ? i.slice(1) : i).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "−" : ""}${int}${d ? "," + d : ""}`;
};
const DISTINTO: [string, string, string][] = [
  ["La proyección, no el recuento", "Cada municipio contado se compara consigo mismo en elecciones anteriores para estimar lo que falta.", "rangos"],
  ["Horquillas, no números mágicos", "Un mínimo, un máximo y la probabilidad de cada escenario. Si no se sabe, lo decimos.", "rangos"],
  ["Cuándo lo sabremos", "Qué es ya seguro y a qué hora, al ritmo del recuento, lo será lo demás.", "certezas"],
  ["El recuento engaña", "Qué falta por contar y hacia quién se inclina ese voto.", "pendiente"],
  ["A cuántos votos", "Cuántos votos bien colocados cambiarían una mayoría. El escaño más barato y el más frágil de cada partido.", "reparto"],
  ["Concentrar o dispersar", "Cuánto premia o castiga el sistema a cada partido por dónde tiene sus votos, y cuántos votos no eligen a nadie.", "reparto"],
  ["Quién decide", "El poder real de cada partido para formar mayoría, más allá de sus escaños.", "poder"],
  ["Por qué se ha movido", "Cada cambio de la proyección, explicado por la provincia que lo provoca.", "porque"],
  ["Dónde ha cambiado el voto", "Del pueblo de 500 vecinos a la gran ciudad.", "tamano"],
  ["Pueblos faro", "25 municipios que llevan seis elecciones votando como España, probados contra el pasado.", "faros"],
  ["El sobre sellado", "Antes de que cierren las urnas sellamos quién está votando más; la huella demuestra que no lo tocamos.", "movilizacion"],
  ["Lo que se dice contra lo que dicen los datos", "Escuchamos la emisión completa de La 1 y contrastamos cada afirmación con la proyección de ese minuto.", "relato"],
  ["El voto del exterior", "Qué escaños puede mover el recuento del extranjero, días después.", "cera"],
  ["Nos examinamos en público", "Cómo se movió nuestra proyección frente al recuento y frente al resultado final.", "examen"],
];
const EXAM_TABS: [string, string][] = [["PP", "PP"], ["PSOE", "PSOE"], ["VOX", "Vox"], ["SUMAR", "Sumar"]];

function Section({ id, title, kicker, children }: { id: string; title: string; kicker?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="elec-section py-8" style={{ borderTop: `1px solid ${C.rule}` }}>
      {kicker && <div className="text-xs uppercase tracking-widest mb-1" style={{ color: C.ochre }}>{kicker}</div>}
      <h2 className="text-2xl md:text-3xl mb-4" style={{ fontFamily: SERIF }}>{title}</h2>
      {children}
    </section>
  );
}

export default function EspecialNoche29N() {
  const [st, setSt] = useState<Estado | null>(null);
  const [err, setErr] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [openProv, setOpenProv] = useState<string | null>(null);
  const [allProv, setAllProv] = useState(false);
  const [focusParty, setFocusParty] = useState<string | null>(null);

  const [pastillas, setPastillas] = useState<Pastilla[]>([]);
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const [showDecided, setShowDecided] = useState(false);
  const [showAllAir, setShowAllAir] = useState(false);
  const [showAllHora, setShowAllHora] = useState(false);
  const [openMay, setOpenMay] = useState<number | null>(null);
  const [examTab, setExamTab] = useState("PP");
  const [sortProv, setSortProv] = useState({ key: "votesNeeded", asc: true });
  const carousel = useRef<HTMLDivElement>(null);
  const liveBar = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const touchUntil = useRef(0);
  const glowTimer = useRef<ReturnType<typeof setTimeout>>();
  const litSection = useRef<HTMLElement | null>(null);
  const keyOf = (p: Pastilla) => `${p.ts}-${p.clave}`;
  const go = (id: string, prov?: string | null) => {
    if (prov) { setAllProv(true); setOpenProv(prov); }
    const el = document.getElementById(id);
    if (!el) return;
    const offset = (liveBar.current?.getBoundingClientRect().bottom ?? 222) + 16;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: reduced ? "auto" : "smooth" });
    window.history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    if (glowTimer.current) clearTimeout(glowTimer.current);
    litSection.current?.removeAttribute("data-lit");
    el.setAttribute("data-lit", "true"); litSection.current = el;
    glowTimer.current = setTimeout(() => el.removeAttribute("data-lit"), 1500);
  };
  const advance = (direction: number) => {
    const el = carousel.current;
    if (!el) return;
    const end = el.scrollWidth - el.clientWidth;
    el.scrollTo({ left: direction > 0 && el.scrollLeft >= end - 8 ? 0 : Math.max(0, el.scrollLeft + direction * Math.max(240, el.clientWidth * 0.7)), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  useEffect(() => {
    const t = setInterval(() => { if (!paused.current && Date.now() > touchUntil.current) advance(1); }, 6000);
    return () => { clearInterval(t); if (glowTimer.current) clearTimeout(glowTimer.current); };
  }, []);
  useEffect(() => {
    if (!st?.pastillas?.length) return;
    setPastillas(previous => {
      const known = new Set(previous.map(keyOf));
      const added = st.pastillas?.filter(p => !known.has(keyOf(p))) ?? [];
      const merged = new Map((st.pastillas ?? []).map(p => [keyOf(p), p]));
      previous.forEach(p => { if (!merged.has(keyOf(p))) merged.set(keyOf(p), p); });
      if (!added.length) return previous;
      return [...merged.values()].sort((a, b) => b.ts.localeCompare(a.ts));
    });
  }, [st?.pastillas]);
  const seenKeys = useRef<Set<string>>(new Set());
  useEffect(() => {
    const added = pastillas.filter(p => !seenKeys.current.has(keyOf(p)));
    pastillas.forEach(p => seenKeys.current.add(keyOf(p)));
    if (!added.length) return;
    setNewKeys(new Set(added.map(keyOf)));
    carousel.current?.scrollTo({ left: 0, behavior: "smooth" });
    const t = setTimeout(() => setNewKeys(new Set()), 3000);
    return () => clearTimeout(t);
  }, [pastillas]);

  useEffect(() => {
    document.title = "Noche electoral 29-N en directo · Especiales RepIndex";
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(ELEC29N_STATE_URL, { method: "GET" });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (alive) { setSt(j); setErr(false); setUpdated(new Date()); }
      } catch { if (alive) setErr(true); }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const panel = st?.panel ?? null;
  const historia: Any[] = st?.historia ?? [];
  const relato: Any[] = st?.relato ?? [];
  const partidos: Any[] = panel?.partidos ?? [];
  const byK = useMemo(() => Object.fromEntries(partidos.map((p) => [p.k, p])), [partidos]);
  const name = (k: string) => byK[k]?.nombre ?? "Otros";
  const color = (k: string) => byK[k]?.color ?? C.grey;

  const sortedP = [...partidos].sort((a, b) => (b.p50 ?? 0) - (a.p50 ?? 0));
  const top4 = sortedP.slice(0, 4).map((p) => p.k);
  const maxScale = Math.max(200, ...partidos.map((p) => p.p90 ?? 0), ...partidos.map((p) => p.bruto ?? 0));

  const originalProvs: Any[] = panel?.provincias ?? [];
  const provs: Any[] = [...(panel?.enJuego?.provincias ?? originalProvs)].sort((a, b) => {
    const value = (p: Any) => sortProv.key === "votesNeeded" ? p.ultimo?.votesNeeded ?? Infinity : sortProv.key === "winner" ? name(p.ultimo?.winner) : sortProv.key === "runnerUp" ? name(p.ultimo?.runnerUp) : p[sortProv.key] ?? 0;
    const av = value(a), bv = value(b);
    return (typeof av === "string" ? av.localeCompare(String(bv), "es") : av - bv) * (sortProv.asc ? 1 : -1);
  });
  const provShown = allProv ? provs : provs.slice(0, 15);
  const sortColumn = (key: string) => setSortProv(s => ({ key, asc: s.key === key ? !s.asc : key !== "enJuego" && key !== "valorVoto" }));
  const openProvince = (p: string) => go("alambre", p);
  const pillColor = (p: Pastilla) => ["vuelco", "mayoria", "engano"].includes(p.tipo) ? C.red : ["certeza", "hora"].includes(p.tipo) ? C.ochre : C.olive;
  const navigatePill = (p: Pastilla) => {
    const province = p.ancla === "alambre" ? provs.find(v => p.texto.toLocaleLowerCase("es").startsWith(v.nombre.toLocaleLowerCase("es"))) : null;
    go(p.ancla, province?.p);
  };
  const certezaItem = (item: Certeza, bar = false) => (
    <EditorialButton key={item.id} className="block w-full py-3 text-left" onClick={() => go(item.prov ? "alambre" : item.ancla, item.prov)}>
      <span className="block text-sm">{item.texto}</span>
      {bar && <span className="mt-2 flex items-center gap-2"><span className="relative block h-1 flex-1" style={{ background: C.rule }}><span className="absolute inset-y-0 left-0" style={{ width: pct(item.prob), background: C.ochre }} /></span><span className="text-xs" style={{ color: C.muted }}>{pct(item.prob)}</span></span>}
    </EditorialButton>
  );

  const abiertoList = [...(panel?.certezas?.abierto ?? [])].sort((a, b) => b.prob - a.prob);
  const abiertoShown = showAllAir ? abiertoList : abiertoList.slice(0, 12);
  const conHoraList = panel?.certezas?.conHora ?? [];
  const conHoraShown = showAllHora ? conHoraList : conHoraList.slice(0, 8);

  const chartData = historia.map((h) => {
    const row: Any = { hora: h.hora ?? madrid(h.ts) };
    for (const k of top4) {
      const v = h.p?.[k];
      if (v) { row[`${k}_band`] = [v[0], v[2]]; row[`${k}_p50`] = v[1]; row[`${k}_bruto`] = v[3]; }
    }
    (h.s ?? []).forEach((v: number, i: number) => (row[`s${i}`] = Math.round(v * 100)));
    return row;
  });

  const primera = panel?.primera?.[0];
  const sumas: Any[] = panel?.sumas ?? [];
  const hora = panel?.horaSimulada;
  const reparto: Any = panel?.reparto;
  const tamano: Any = panel?.tamano;
  const sectionOn: Record<string, boolean> = { rangos: true, certezas: !!panel?.certezas, pendiente: !!panel?.pendiente, reparto: !!reparto, poder: !!panel?.poder, porque: !!panel?.porque, tamano: !!tamano, faros: !!panel?.faros, movilizacion: true, relato: true, cera: true, examen: historia.length > 0 };
  const examen = (() => {
    const data = historia.filter(h => h.esc != null && h.p?.[examTab]).map(h => { const v = h.p[examTab]; return { esc: h.esc, band: [v[0], v[2]], p50: v[1], bruto: v[3] }; });
    const last = data[data.length - 1];
    const final = last && last.esc >= 99 ? last.p50 : null;
    const ref = data.find(d => d.esc >= 25);
    const frase = ref ? `Con el ${miles(ref.esc)} % escrutado, la proyección decía ${miles(ref.p50)} y el recuento ${miles(ref.bruto)}${final != null ? `; el resultado fue ${miles(final)}` : ""}` : "";
    return { data, final, frase };
  })();

  return (
    <Layout>
      <Helmet><link rel="canonical" href="https://repindex.ai/especiales/elecciones/noche-29n" /></Helmet>
      <div className="elec-page" style={{ background: C.paper, color: C.ink, minHeight: "100vh" }}>
        <style>{`
          .elec-page .elec-section { scroll-margin-top: 260px; transition: background-color 1.5s, box-shadow 1.5s; }
          .elec-page [data-lit="true"] { background-color: ${C.ochre}18; box-shadow: inset 3px 0 ${C.ochre}; }
          .elec-page .elec-ticker { scrollbar-width: thin; scrollbar-color: ${C.grey} ${C.ink}; }
          .elec-page .elec-pill { border-radius: 12px; flex-shrink: 0; scroll-snap-align: start; width: 85vw; max-width: 85vw; overflow: hidden; }
          .elec-page .elec-pill-text { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
          @media (min-width: 641px) { .elec-page .elec-pill { width: 380px; max-width: 380px; } .elec-page .elec-pill.elec-latest { width: 420px; max-width: 420px; } }
          @media (max-width: 640px) { .elec-page .elec-section { scroll-margin-top: 280px; } }
          .elec-page .elec-new { animation: elec-enter .4s ease-out, elec-ring 1s ease-in-out 3; }
          .elec-page .elec-live-dot { animation: elec-pulse 1.5s ease-in-out infinite; }
          .elec-page table th, .elec-page table td { padding-right: 16px; }
          @keyframes elec-enter { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: translateX(0); } }
          @keyframes elec-ring { 50% { box-shadow: 0 0 0 3px ${C.ochre}; } }
          @keyframes elec-pulse { 50% { opacity: .4; } }
          @media (prefers-reduced-motion: reduce) { .elec-page *, .elec-page .elec-new, .elec-page .elec-live-dot { animation: none; transition: none; scroll-behavior: auto; } }
        `}</style>
        <div ref={liveBar} className="sticky top-[72px] z-40 w-full" style={{ background: C.ink, color: C.paper, width: "100vw", marginLeft: "calc(50% - 50vw)" }}>
          {st?.modo === "simulacro" && <div className="text-center text-xs sm:text-sm font-semibold px-3 py-2" style={{ background: C.ochre, color: C.ink }}>ENSAYO · Así habría funcionado este panel la noche del 23J de 2023. Votos reales de cada municipio; el orden de llegada de las mesas es simulado.{panel?.horaSimulada != null && <> Hora simulada: {panel.horaSimulada}</>}{panel?.ensayo?.vuelta != null && <> · Vuelta {panel.ensayo.vuelta}</>}. La noche real empieza aquí el domingo 29 a las 21:00.{panel?.ensayo?.final === true && <> · Fin del recuento: vuelve a empezar en unos minutos</>}</div>}
          <div className="relative flex h-24 sm:h-[110px] items-stretch gap-0 sm:gap-2 px-0 sm:px-4" onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }} onTouchStart={() => { paused.current = true; }} onTouchEnd={() => { paused.current = false; touchUntil.current = Date.now() + 10_000; }} onTouchCancel={() => { paused.current = false; touchUntil.current = Date.now() + 10_000; }} onFocusCapture={() => { paused.current = true; }} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) paused.current = false; }}>
            <div className="hidden sm:block shrink-0 self-center text-sm leading-tight pr-1"><span className="flex items-center gap-1.5 font-bold"><span className="elec-live-dot inline-block h-2 w-2 rounded-full" style={{ background: C.red }} />EN DIRECTO</span><span className="block mt-1" style={{ color: C.grey }}>{panel?.vacio ? 0 : pastillas.length} titulares</span></div>
            <div className="sm:hidden absolute left-1 top-1/2 z-10 w-12 -translate-y-1/2 text-center text-[13px] leading-[14px]"><span className="flex items-center justify-center gap-1 font-bold"><span className="elec-live-dot inline-block h-2 w-2 rounded-full" style={{ background: C.red }} />EN</span><span className="block font-bold">DIRECTO</span><span className="block mt-1" style={{ color: C.grey }}>{panel?.vacio ? 0 : pastillas.length} titulares</span></div>
            <EditorialButton aria-label="Titulares más recientes" title="Titulares más recientes" className="absolute sm:static left-14 top-1/2 sm:top-auto z-20 -translate-y-1/2 sm:translate-y-0 shrink-0 self-center h-10 w-10 text-3xl" style={{ color: C.paper, background: C.ink, border: `1px solid ${C.muted}`, borderRadius: "50%" }} onClick={() => { touchUntil.current = Date.now() + 10_000; advance(-1); }}>‹</EditorialButton>
            <div ref={carousel} className="elec-ticker flex h-full min-w-0 flex-1 items-center gap-3 overflow-x-auto snap-x snap-proximity py-1 sm:py-2 pl-14 sm:pl-1 pr-0 sm:pr-1" style={{ touchAction: "pan-x pan-y" }}>
              {!panel?.vacio && pastillas.length > 0 ? pastillas.map((p, index) => {
                const latest = index === 0;
                return <EditorialButton key={keyOf(p)} aria-label={p.texto} title={p.texto} onClick={() => navigatePill(p)} className={`elec-pill ${latest ? "elec-latest" : ""} ${newKeys.has(keyOf(p)) ? "elec-new" : ""}`} style={{ display: "flex", height: "100%", background: C.card, color: C.ink, border: latest ? `2px solid ${C.ochre}` : `1px solid ${C.rule}` }}>
                  <span aria-hidden="true" className="h-full w-1 shrink-0" style={{ background: pillColor(p) }} />
                  <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-12 sm:px-3 py-1.5 sm:py-2 text-left">
                    <span className="flex items-center gap-2 whitespace-nowrap text-[11px] leading-[13px]" style={{ color: C.muted }}>
                      {latest && <span className="font-bold uppercase" style={{ color: C.ochre }}>Último</span>}
                      <time className="shrink-0">{madrid(p.ts)}</time>
                      {st?.modo === "simulacro" && <span className="shrink-0 rounded-sm px-1 font-semibold uppercase" style={{ background: C.ochre, color: C.ink }}>Ensayo 23J</span>}
                    </span>
                    <span className="elec-pill-text text-[15px] sm:text-base font-medium leading-[1.2]">{p.texto}</span>
                  </span>
                </EditorialButton>;
              }) : <p className="text-sm sm:text-base py-1" style={{ color: C.grey }}>Los titulares aparecerán en cuanto el recuento oficial supere el 0,5 % escrutado</p>}
            </div>
            <EditorialButton aria-label="Titulares anteriores" title="Titulares anteriores" className="absolute sm:static right-0 top-1/2 sm:top-auto z-20 -translate-y-1/2 sm:translate-y-0 shrink-0 self-center h-10 w-10 text-3xl" style={{ color: C.paper, background: C.ink, border: `1px solid ${C.muted}`, borderRadius: "50%" }} onClick={() => { touchUntil.current = Date.now() + 10_000; advance(1); }}>›</EditorialButton>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 pt-2 pb-16">
          <header className="pt-8 pb-4 text-center" style={{ borderBottom: `3px double ${C.ink}` }}>
            <div className="text-xs uppercase tracking-[0.3em]" style={{ color: C.muted }}>Especiales RepIndex · En directo</div>
            <h1 className="text-4xl md:text-6xl my-2" style={{ fontFamily: SERIF }}>Noche electoral 29-N</h1>
            <div className="italic" style={{ fontFamily: SERIF, color: C.muted }}>Un análisis del equipo de RepIndex.ai</div>
            <div className="text-xs mt-2" style={{ color: C.muted }}>
              Última actualización: {updated ? madrid(updated) : "—"}
              {panel?.ts && <> · dato del panel {madrid(panel.ts)}</>}
              {hora && <> · hora {hora}</>}
              {err && <span style={{ color: C.red }}> · sin conexión, reintentando</span>}
            </div>
          </header>

          {!panel ? (
            <p className="text-center py-24 text-xl" style={{ fontFamily: SERIF, color: C.muted }}>
              {st ? "El panel se enciende con el primer dato oficial" : "Cargando…"}
            </p>
          ) : (
            <>
              {/* A. GOLPE */}
              <section id="arriba" className="elec-section relative overflow-hidden py-8 text-center">
                {st?.modo === "simulacro" && <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center select-none" style={{ zIndex: 0 }}><span className="whitespace-nowrap font-bold" style={{ fontFamily: SERIF, fontSize: "clamp(64px, 16vw, 200px)", color: C.ochre, opacity: 0.09, transform: "rotate(-24deg)" }}>ENSAYO 23J</span></div>}
                <div className="relative" style={{ zIndex: 1 }}>
                {!panel?.vacio && <>
                <EditorialButton onClick={() => go("rangos")} className="block mx-auto">
                  <div className="text-7xl md:text-9xl font-bold leading-none" style={{ fontFamily: SERIF }}>
                    {(panel.escrutado ?? 0).toLocaleString("es-ES", { maximumFractionDigits: 1 })}<span className="text-4xl md:text-6xl"> %</span>
                  </div>
                  <div className="text-sm uppercase tracking-widest mt-1" style={{ color: C.muted }}>escrutado{hora ? ` · ${hora}` : ""}</div>
                </EditorialButton>
                </>}
                <p className="text-2xl md:text-3xl mt-6 max-w-3xl mx-auto" style={{ fontFamily: SERIF }}>{panel.frase}</p>
                {!panel?.vacio && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
                  {primera && (
                    <EditorialButton onClick={() => { setFocusParty(primera.k); go("rangos"); }} className="p-4 text-left hover:opacity-80" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
                      <div className="text-5xl font-bold" style={{ fontFamily: SERIF, color: color(primera.k) }}>{pct(primera.prob)}</div>
                      <div className="text-sm mt-1">probabilidad de que <b>{name(primera.k)}</b> sea primera fuerza</div>
                    </EditorialButton>
                  )}
                  {sumas.slice(0, 2).map((s, i) => (
                    <EditorialButton key={i} onClick={() => go(panel?.poder ? "poder" : "noche")} className="p-4 text-left hover:opacity-80" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
                      <div className="text-5xl font-bold" style={{ fontFamily: SERIF }}>{pct(s.prob176)}</div>
                      <div className="text-sm mt-1">probabilidad de que <b>{s.nombre}</b> llegue a 176</div>
                      <div className="text-xs mt-1" style={{ color: C.muted }}>horquilla {s.p10}–{s.p90} · central {s.p50}</div>
                    </EditorialButton>
                  ))}
                  {panel?.enJuego?.total != null && <EditorialButton className="p-4 text-left" style={{ background: C.card, border: `1px solid ${C.rule}` }} onClick={() => go("alambre")}><span className="block text-5xl font-bold" style={{ fontFamily: SERIF, color: C.ochre }}>{num(panel?.enJuego?.total)}</span><span className="block mt-1 text-sm">Escaños en juego</span></EditorialButton>}
                </div>}
                {!panel?.vacio && panel?.pendiente?.engano && <EditorialButton className="block w-full p-4 mt-5 text-left" style={{ background: C.red, color: C.paper }} onClick={() => go("pendiente")}>El recuento engaña: {panel?.pendiente?.engano?.recuentoNombre} va primero en votos contados, pero el voto que falta da ventaja a {panel?.pendiente?.engano?.proyeccionNombre}</EditorialButton>}
                {!panel?.vacio && <nav aria-label="Secciones del especial" className="flex flex-wrap justify-center gap-2 mt-6">
                  {[["distinto", "Por qué este panel", true], ["certezas", "Certezas", panel?.certezas], ["pendiente", "Voto pendiente", panel?.pendiente], ["porque", "Por qué cambia", panel?.porque], ["rangos", "Rangos", true], ["faros", "Pueblos faro", panel?.faros], ["movilizacion", "Movilización", true], ["poder", "Poder", panel?.poder], ["reparto", "Votos y escaños", panel?.reparto], ["tamano", "Territorio", panel?.tamano], ["noche", "La noche", true], ["examen", "A examen", historia.length > 0], ["alambre", "En juego", true], ["apuesta", "Apuesta", true], ["cera", "CERA", true], ["senado", "Senado", true], ["relato", "Relato", true], ["cotejos", "Cotejos", true], ["calidad", "Calidad", panel?.calidad], ["metodo", "Método", true]].filter(([, , visible]) => visible).map(([id, label]) => <EditorialButton key={String(id)} className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: C.rule }} onClick={() => go(String(id))}>{String(label)}</EditorialButton>)}
                </nav>}
                </div>
              </section>
              {!panel?.vacio && <Section id="distinto" kicker="Por qué este panel" title="Lo que este panel ve y los demás no">
                <p className="text-lg max-w-3xl" style={{ fontFamily: SERIF }}>La noche electoral de siempre enseña los votos según llegan. Este panel enseña lo que esos votos dicen del final, con cuánta seguridad y desde cuándo, y explica cómo se convierten en escaños.</p>
                <div className="mt-6 p-5" style={{ background: C.card, border: `1px solid ${C.rule}`, borderLeft: `4px solid ${C.ochre}` }}>
                  <h3 className="text-xl mb-3" style={{ fontFamily: SERIF }}>Lo que pasó el 23J</h3>
                  <ul className="space-y-4 text-base">
                    <li>A las 21:13, con el 11 % escrutado, el recuento daba al PSOE 128 escaños y al PP 122. El PP acabó la noche con 136 y el PSOE con 122.<span className="block text-xs mt-1" style={{ color: C.muted }}>Fuente: <a className="underline" href="https://maldita.es/malditodato/20230723/resultados-elecciones-generales/" target="_blank" rel="noopener noreferrer">Maldita.es, directo del 23J</a></span></li>
                    <li>Con los votos de aquella noche, a PP + Vox les faltaron 7 escaños para la mayoría: 23.323 votos más, colocados donde menos costaban, se los habrían dado.<span className="block text-xs mt-1" style={{ color: C.muted }}>Fuente: cálculo de RepIndex con los datos oficiales del Ministerio del Interior</span></li>
                    <li>El escaño más frágil del PSOE estaba en Madrid, a 1.317 votos. Días después, el voto desde el extranjero se lo dio al PP.<span className="block text-xs mt-1" style={{ color: C.muted }}>Fuente: cálculo de RepIndex; <a className="underline" href="https://www.elindependiente.com/espana/2023/07/28/baile-de-escanos-voto-cera/" target="_blank" rel="noopener noreferrer">El Independiente</a></span></li>
                  </ul>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
                  {DISTINTO.filter(([, , a]) => sectionOn[a]).map(([t, d, a]) => <EditorialButton key={t} className="block w-full p-4 text-left" style={{ background: C.card, border: `1px solid ${C.rule}` }} onClick={() => go(a)}><b className="block">{t}</b><span className="block text-sm mt-1" style={{ color: C.muted }}>{d}</span></EditorialButton>)}
                </div>
                <h3 className="text-xl mt-8 mb-3" style={{ fontFamily: SERIF }}>La IA: dónde sí y dónde no</h3>
                <div className="grid md:grid-cols-2 gap-6 text-sm">
                  <div><div className="font-bold mb-2" style={{ color: C.olive }}>SÍ</div><ul className="space-y-2 list-disc pl-5">
                    <li>Escucha y transcribe la emisión completa de La 1, distingue quién habla y localiza cada afirmación comprobable para contrastarla con el dato de ese minuto.</li>
                    <li>Agentes de IA construyeron los métodos y los pusieron a prueba con seis elecciones generales (2011-2023) antes de publicarlos.</li>
                    <li>Los titulares del carrusel salen de reglas fijas y un verificador comprueba cada cifra contra los datos: si una cifra no cuadra, el titular no se publica.</li>
                  </ul></div>
                  <div><div className="font-bold mb-2" style={{ color: C.red }}>NO</div><ul className="space-y-2 list-disc pl-5">
                    <li>Ninguna IA calcula ni redacta una cifra. Los números salen de aritmética que cualquiera puede repetir con los datos de Interior.</li>
                    <li>Nuestro límite: si dentro de un mismo municipio se cuentan antes las mesas de un signo, eso no se ve con datos por municipio. Por eso las horquillas son anchas al principio. Este ensayo lo reproduce a propósito: en él, las mesas con más participación y más voto a la derecha se cuentan al final.</li>
                  </ul></div>
                </div>
              </Section>}
              {!panel?.vacio && <>
              {panel?.certezas && <Section id="certezas" title="Lo que ya sabemos y lo que no">
                <div className="grid md:grid-cols-3 gap-6">
                  <div><h3 className="font-semibold pb-2" style={{ color: C.olive }}>✓ Ya es seguro</h3>
                    {panel?.certezas?.seguro?.filter(i => !i.prov).map(i => certezaItem(i))}
                    {!!panel?.certezas?.seguro?.filter(i => i.prov).length && <><EditorialButton className="text-sm underline py-3" onClick={() => setShowDecided(!showDecided)} aria-expanded={showDecided}>+ {panel?.certezas?.seguro?.filter(i => i.prov).length} provincias decididas {showDecided ? "▾" : "▸"}</EditorialButton>{showDecided && panel?.certezas?.seguro?.filter(i => i.prov).map(i => certezaItem(i))}</>}
                  </div>
                  <div><h3 className="font-semibold pb-2" style={{ color: C.ochre }}>Aún en el aire</h3>{abiertoShown.map(i => certezaItem(i, true))}{abiertoList.length > 12 && <EditorialButton className="text-sm underline py-2" onClick={() => setShowAllAir(v => !v)} aria-expanded={showAllAir}>{showAllAir ? "Cerrar" : `Ver todos (${abiertoList.length})`}</EditorialButton>}</div>
                  <div><h3 className="font-semibold pb-2">Lo sabremos hacia…</h3>{conHoraShown.map(i => <EditorialButton key={i.id} className="block w-full py-3 text-left" onClick={() => go(i.prov ? "alambre" : i.ancla, i.prov)}><span className="block text-3xl" style={{ fontFamily: SERIF }}>{i.hora ?? "—"}</span><span className="block text-sm mt-1">{i.texto}</span></EditorialButton>)}{conHoraList.length > 8 && <EditorialButton className="text-sm underline py-2" onClick={() => setShowAllHora(v => !v)} aria-expanded={showAllHora}>{showAllHora ? "Cerrar" : `Ver todos (${conHoraList.length})`}</EditorialButton>}<p className="text-xs italic" style={{ color: C.muted }}>estimación al ritmo actual de recuento</p></div>
                </div>{panel?.certezas?.nota && <p className="text-xs mt-4" style={{ color: C.muted }}>{panel?.certezas?.nota}</p>}
              </Section>}
              {panel?.pendiente && <Section id="pendiente" title="El voto que falta por contar">
                <EditorialButton className="block text-left mb-6" onClick={() => document.getElementById("bolsas-pendientes")?.scrollIntoView({ behavior: "smooth", block: "center" })}><span className="block text-5xl md:text-6xl" style={{ fontFamily: SERIF }}>{num(panel?.pendiente?.votosPendientes)}</span><span className="block text-sm mt-1">votos aún sin contar</span></EditorialButton>
                <p className="text-xs mb-4" style={{ color: C.muted }}>◇ Cuota en el recuento · barra: cuota final proyectada</p>
                <div className="space-y-4">{panel?.pendiente?.filas?.slice(0, 8).map(f => <div key={f.k}>
                  <EditorialButton className="flex w-full justify-between gap-2 text-sm mb-1" onClick={() => { setFocusParty(f.k); go("rangos"); }}><b>{f.nombre}</b><span style={{ color: f.diferencia > 0 ? C.olive : f.diferencia < 0 ? C.red : C.muted }}>{signed(f.diferencia)} pts</span></EditorialButton>
                  <div className="relative h-4" style={{ background: C.rule }}><div className="h-full" style={{ width: `${f.cuotaFinal}%`, background: color(f.k) }} /><span className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rotate-45" title={`Recuento: ${num(f.cuotaContado)} %`} style={{ left: `${f.cuotaContado}%`, marginLeft: -6, border: `2px solid ${C.ink}`, background: C.paper }} /></div>
                  <div className="flex justify-between mt-1 text-xs" style={{ color: C.muted }}><span>Recuento: {num(f.cuotaContado)} %</span><span>Proyección: {num(f.cuotaFinal)} %</span></div>
                </div>)}</div>
                <div id="bolsas-pendientes" className="mt-8"><h3 className="text-xl mb-4" style={{ fontFamily: SERIF }}>Dónde está ese voto</h3>{panel?.pendiente?.bolsas?.map(b => <div key={b.cls} className="py-3"><div className="flex flex-wrap justify-between gap-2 text-sm mb-2"><b>{b.nombre}</b><span>{num(b.votos)} votos pendientes</span></div><div className="flex h-5 overflow-hidden" style={{ background: C.rule }}>{b.inclinacion?.slice(0, 3).map(i => <EditorialButton key={i.k} className="h-full" title={`${i.nombre}: ${num(i.cuota)} %`} style={{ width: `${i.cuota}%`, background: color(i.k) }} onClick={() => { setFocusParty(i.k); go("rangos"); }} aria-label={`${i.nombre}: ${num(i.cuota)} %`} />)}</div><div className="flex flex-wrap gap-3 text-xs mt-1">{b.inclinacion?.slice(0, 3).map(i => <span key={i.k} style={{ color: color(i.k) }}>{i.nombre} {num(i.cuota)} %</span>)}</div></div>)}</div>
              </Section>}
              {panel?.porque && <Section id="porque" title="Por qué se ha movido">
                {panel?.porque?.desde && <p className="text-sm mb-5" style={{ color: C.muted }}>Desde la foto de las {madrid(panel?.porque?.desde)} ({num(panel?.porque?.escAntes)} % escrutado)</p>}
                {!panel?.porque?.cambios?.length ? <p style={{ color: C.muted }}>Sin cambios en la proyección desde la última foto</p> : <div className="grid sm:grid-cols-2 gap-4">{panel?.porque?.cambios?.map(c => <div key={c.k} className="p-4" style={{ background: C.card, borderTop: `3px solid ${color(c.k)}` }}><EditorialButton className="flex w-full justify-between gap-2 text-xl" onClick={() => { setFocusParty(c.k); go("rangos"); }}><span style={{ fontFamily: SERIF }}>{c.nombre} {c.antes} → {c.ahora}</span><b style={{ color: c.delta > 0 ? C.olive : c.delta < 0 ? C.red : C.muted }}>{signed(c.delta)}</b></EditorialButton><div className="flex flex-wrap gap-2 mt-3">{c.provincias?.map(p => <EditorialButton key={p.p} className="text-xs border rounded-full px-2 py-1" style={{ borderColor: C.rule }} onClick={() => openProvince(p.p)}>{p.nombre} {signed(p.d)} · {num(p.escAntes)} → {num(p.escAhora)} % escrutado</EditorialButton>)}</div></div>)}</div>}
              </Section>}
              {/* B. RANGOS */}
              <Section id="rangos" kicker="Congreso" title="Escaños: recuento oficial frente a proyección">
                <div className="flex flex-wrap gap-4 text-xs mb-3" style={{ color: C.muted }}>
                  <span className="flex items-center gap-1"><span style={{ display: "inline-block", width: 10, height: 10, border: `2px solid ${C.ink}`, transform: "rotate(45deg)" }} /> Recuento oficial</span>
                  <span className="flex items-center gap-1"><span style={{ display: "inline-block", width: 4, height: 14, background: C.ink }} /> Proyección RepIndex (central)</span>
                  <span className="flex items-center gap-1"><span style={{ display: "inline-block", width: 20, height: 10, background: C.rule }} /> Horquilla p10–p90</span>
                  {focusParty && <EditorialButton className="underline" onClick={() => setFocusParty(null)}>Quitar filtro ({name(focusParty)})</EditorialButton>}
                </div>
                <div className="space-y-2">
                  {sortedP.filter((p) => !focusParty || p.k === focusParty).map((p) => {
                    const x = (v: number) => `${Math.min(100, (v / maxScale) * 100)}%`;
                    return (
                      <div key={p.k} className="grid grid-cols-[88px_1fr_56px] md:grid-cols-[140px_1fr_80px] items-center gap-2">
                        <EditorialButton className="text-left text-sm font-semibold truncate" onClick={() => setFocusParty(focusParty === p.k ? null : p.k)}>{p.nombre}</EditorialButton>
                        <div className="relative h-7" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
                          <div className="absolute top-0 bottom-0" style={{ left: x(p.p10), width: `calc(${x(p.p90)} - ${x(p.p10)})`, background: p.color, opacity: 0.25 }} />
                          <div className="absolute top-0 bottom-0" style={{ left: x(p.p50), width: 4, marginLeft: -2, background: p.color }} title={`Proyección: ${p.p50}`} />
                          <div className="absolute" style={{ left: x(p.bruto ?? 0), top: "50%", width: 10, height: 10, marginLeft: -5, marginTop: -5, border: `2px solid ${C.ink}`, transform: "rotate(45deg)", background: "transparent" }} title={`Recuento oficial: ${p.bruto}`} />
                          <div className="absolute top-[-4px] bottom-[-4px]" style={{ left: x(176), width: 1, background: C.red }} />
                          <span className="absolute right-1 top-1 text-[10px]" style={{ color: C.muted }}>{p.p50} ({p.p10}–{p.p90}) · oficial {p.bruto}</span>
                        </div>
                        <div className="text-sm text-right">{p.cuota?.toLocaleString("es-ES")} %</div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs mt-1 text-right" style={{ color: C.red }}>línea roja: 176, mayoría absoluta</div>
                <p className="italic mt-4" style={{ fontFamily: SERIF }}>La diferencia entre las dos marcas es lo que el orden de recuento aún esconde.</p>
              </Section>
              {panel?.faros && (() => { const F = panel.faros; const est = F.estimacion ?? {}; const pro = F.proyeccion ?? {}; const lista = [...(F.lista ?? [])].sort((a: Any, b: Any) => Number(!!b.terminado) - Number(!!a.terminado)); const FC: Record<string, string> = { PP: "#1d5fa8", PSOE: "#d4202c" }; const fx = (v?: number | null) => v == null ? "—" : v.toLocaleString("es-ES", { maximumFractionDigits: 1 }); return (
              <Section id="faros" kicker="Muestra" title="Pueblos faro">
                <div className="text-center mb-6">
                  {F.terminados != null && <div className="text-4xl sm:text-6xl" style={{ fontFamily: SERIF }}>{F.terminados} de {F.total ?? 25} pueblos faro han terminado</div>}
                  <p className="mt-3 text-lg" style={{ fontFamily: SERIF }}>{est.PP == null ? "Aún no ha terminado ninguno" : `Apuntan a PP ${fx(est.PP)} % y PSOE ${fx(est.PSOE)} %; la proyección del modelo dice ${fx(pro.PP)} % y ${fx(pro.PSOE)} %`}</p>
                </div>
                {est.PP != null && <div className="space-y-4 mb-8">{(["PP", "PSOE"] as const).map(k => <div key={k}><b style={{ color: FC[k] }}>{k}</b>{[["Faros", est[k], 1], ["Proyección", pro[k], 0.45]].map(([l, v, o]) => v == null ? null : <div key={String(l)} className="flex items-center gap-2 text-sm mt-1"><span className="w-24 shrink-0">{l}</span><div className="flex-1 h-4" style={{ background: C.rule }}><div className="h-full" style={{ width: `${Math.min(100, Number(v))}%`, background: FC[k], opacity: Number(o) }} /></div><span className="w-14 text-right">{fx(Number(v))} %</span></div>)}</div>)}</div>}
                {lista.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">{lista.map((f: Any) => <div key={f.id} className="p-3 text-sm" style={{ background: C.card, border: `1px solid ${C.rule}`, color: f.terminado ? C.ink : C.grey }}><b className="block">{f.n}</b>{f.censo != null && <span className="block text-xs">Censo {num(f.censo)}</span>}{f.terminado ? <span className="block text-xs mt-1">{f.PP != null && <span style={{ color: FC.PP }}>PP {fx(f.PP)} % </span>}{f.PSOE != null && <span style={{ color: FC.PSOE }}>PSOE {fx(f.PSOE)} %</span>}</span> : <span className="block text-xs mt-1 italic">contando</span>}</div>)}</div>}
                {F.nota && <p className="text-xs italic mt-4" style={{ color: C.muted }}>{F.nota}</p>}
              </Section>); })()}
              <Section id="movilizacion" kicker="Participación" title="Quién está votando (sobre de las 18:30)">
                {panel?.movilizacion ? (() => { const M = panel.movilizacion; const e = M.efecto ?? {}; const big = (l: string, v?: number | null) => v == null ? null : <div className="p-4 text-center" style={{ background: C.card }}><div className="text-sm">{l}</div><div className="text-4xl" style={{ fontFamily: SERIF, color: v > 0 ? C.olive : v < 0 ? C.red : C.ink }}>{signed(v)} puntos</div></div>; const parts = ["PP", "PSOE", "VOX", "SUMAR", "OTR"].filter(k => e[k] != null); const mx = Math.max(1, ...parts.map(k => Math.abs(e[k]))); return <>
                  {M.lectura && <p className="text-2xl sm:text-3xl text-center mb-6" style={{ fontFamily: SERIF }}>{M.lectura}</p>}
                  <div className="grid sm:grid-cols-2 gap-4 mb-4">{big("Derecha (PP + Vox)", e.DER)}{big("Izquierda (PSOE + Sumar)", e.IZQ)}</div>
                  {M.participacion26 != null && <p className="text-center mb-6">Participación a las {M.hora ?? "—"}: {num(M.participacion26)} %{M.participacion23 != null && ` (en 2023, ${num(M.participacion23)} %)`}</p>}
                  <div className="space-y-2">{parts.map(k => <div key={k} className="flex items-center gap-2 text-sm"><span className="w-14 shrink-0 font-semibold">{k}</span><div className="flex-1 flex h-4"><div className="w-1/2 flex justify-end" style={{ borderRight: `1px solid ${C.ink}` }}>{e[k] < 0 && <div className="h-full" style={{ width: `${Math.abs(e[k]) / mx * 100}%`, background: color(k) }} />}</div><div className="w-1/2">{e[k] > 0 && <div className="h-full" style={{ width: `${e[k] / mx * 100}%`, background: color(k) }} />}</div></div><span className="w-14 text-right">{signed(e[k])}</span></div>)}</div>
                  <div className="text-xs mt-4 space-y-1" style={{ color: C.muted }}>{M.validacion && <p>{M.validacion}</p>}{M.nota && <p>{M.nota}</p>}{M.sha256 && <p className="break-all">Huella del sobre: <span className="font-mono">{M.sha256}</span></p>}</div>
                </>; })() : st?.sobre2 ? <div className="p-6 text-center" style={{ background: C.card, border: `1px dashed ${C.ochre}` }}>
                  <p className="text-2xl" style={{ fontFamily: SERIF }}>Sobre sellado a las {madrid(st.sobre2.sellado_at)}. Se abre a las 21:00.</p>
                  {st.sobre2.sha256 && <p className="font-mono text-xs break-all mt-3">{st.sobre2.sha256}</p>}
                  <p className="text-sm mt-3" style={{ color: C.muted }}>Calculamos con el avance de participación de las 18:00 qué electorados están acudiendo más y lo sellamos antes de que cierren las urnas. La huella demuestra que no lo cambiamos después.</p>
                </div> : <p style={{ color: C.muted }}>El sobre se sella el domingo hacia las 18:30, con el avance de participación de las 18:00.</p>}
              </Section>

              {panel?.poder && <Section id="poder" title="Quién tiene la llave">
                <div className="space-y-5">{panel?.poder?.partidos?.map((p, i) => <EditorialButton key={p.k} className="block w-full text-left" onClick={() => { setFocusParty(p.k); go("rangos"); }}>
                  <span className={`flex flex-wrap justify-between gap-2 mb-2 ${i === 0 ? "font-bold text-lg" : "text-sm"}`}><span>{p.nombre}</span><span>{num(p.poder)} % del poder · {num(p.escanos)} escaños</span></span>
                  <span className="relative block h-5" style={{ background: C.rule }}><span className="absolute inset-y-0 left-0" style={{ width: `${p.poder}%`, background: color(p.k), opacity: i === 0 ? 1 : .6 }} /><span className="absolute top-1/2 h-px" style={{ left: `${p.p10}%`, width: `${p.p90 - p.p10}%`, background: C.ink }} /><span className="absolute top-1 bottom-1 w-px" style={{ left: `${p.p10}%`, background: C.ink }} /><span className="absolute top-1 bottom-1 w-px" style={{ left: `${p.p90}%`, background: C.ink }} /></span><span className="block mt-1 text-xs" style={{ color: C.muted }}>Horquilla: {num(p.p10)}–{num(p.p90)} %</span>
                </EditorialButton>)}</div>
                <div className="grid sm:grid-cols-2 gap-4 mt-8">{sumas.map((s, i) => <EditorialButton key={i} className="block p-4 text-left" style={{ background: C.card, border: `1px solid ${C.rule}` }} onClick={() => go("noche")}><span className="block text-4xl" style={{ fontFamily: SERIF }}>{pct(s.prob176)}</span><b className="block mt-2">{s.nombre}</b><span className="block text-sm">Probabilidad de llegar a 176 · horquilla {s.p10}–{s.p90} · central {s.p50}</span><span className="block text-xs mt-1" style={{ color: C.muted }}>{s.partidos?.map(name).join(" + ")}</span></EditorialButton>)}</div>
                {panel?.poder?.nota && <p className="italic text-sm mt-4" style={{ color: C.muted }}>{panel?.poder?.nota}</p>}
              </Section>}
              {reparto && <Section id="reparto" kicker="Votos y escaños" title="A cuántos votos está cada mayoría">
                <div className="grid md:grid-cols-2 gap-4">{(reparto.mayorias ?? []).map((m: Any, i: number) => {
                  const margen = m.sobran != null && m.faltan == null;
                  return <div key={i} style={{ background: C.card, border: `1px solid ${C.rule}` }}>
                    <EditorialButton className="block w-full p-5 text-left" aria-expanded={openMay === i} onClick={() => setOpenMay(openMay === i ? null : i)}>
                      <span className="block font-semibold">{margen ? `${m.nombre}: ${miles(m.escanos)} escaños. Mayoría con ${miles(m.sobran)} de margen.` : `${m.nombre}: ${miles(m.escanos)} escaños. Le faltan ${miles(m.faltan)}.`}</span>
                      {(margen ? m.votosDeMargen : m.votosQueFaltan) != null && <span className="block text-5xl md:text-6xl mt-3" style={{ fontFamily: SERIF, color: margen ? C.olive : C.red }}>{miles(margen ? m.votosDeMargen : m.votosQueFaltan)} votos</span>}
                      <span className="block text-sm mt-1" style={{ color: C.muted }}>{margen ? "perdidos donde menos cuesta, se la quitarían" : "bien colocados, le darían la mayoría"}</span>
                      {m.pasos?.length > 0 && <span className="block text-xs mt-2 underline" style={{ color: C.ochre }}>{openMay === i ? "Ocultar pasos" : `Ver pasos (${m.pasos.length})`}</span>}
                    </EditorialButton>
                    {openMay === i && m.pasos?.length > 0 && <ol className="px-5 pb-5 space-y-1 text-sm list-decimal pl-9">{m.pasos.map((s: Any, j: number) => <li key={j}>{margen ? `${s.prov}: ${miles(s.votos)} votos menos a ${s.partidoNombre} le dan el escaño a ${s.aQuienNombre}` : `${s.prov}: ${miles(s.votos)} votos más a ${s.partidoNombre} le quitan un escaño a ${s.aQuienNombre}`}</li>)}</ol>}
                  </div>;
                })}</div>
                {reparto.votosSinEscanoPct != null && <p className="mt-8 text-2xl md:text-3xl" style={{ fontFamily: SERIF }}><span className="text-5xl" style={{ color: C.ochre }}>{miles(reparto.votosSinEscanoPct)} %</span> de los votos no eligen a ningún diputado en su provincia{reparto.votosSinEscano != null && <> ({miles(reparto.votosSinEscano)} votos)</>}</p>}
                {reparto.partidos?.length > 0 && <>
                  <h3 className="text-xl mt-8 mb-1" style={{ fontFamily: SERIF }}>Concentrar o dispersar</h3>
                  <p className="text-xs mb-4" style={{ color: C.muted }}>Barra llena: escaños reales. Barra clara: si España fuera una sola circunscripción.</p>
                  <div className="space-y-4">{(() => { const mx = Math.max(1, ...reparto.partidos.map((p: Any) => Math.max(p.escanos ?? 0, p.proporcional ?? 0))); return reparto.partidos.map((p: Any) => <div key={p.k} className="grid gap-2 md:grid-cols-[1fr_220px] items-center text-sm">
                    <div><div className="flex justify-between gap-2 mb-1"><b>{p.nombre}</b>{p.prima != null && <span style={{ color: p.prima > 0 ? C.olive : p.prima < 0 ? C.red : C.muted }}>{signed(p.prima)} escaños</span>}</div>
                      <div className="h-3" style={{ background: C.rule }}><div className="h-full" style={{ width: `${((p.escanos ?? 0) / mx) * 100}%`, background: color(p.k) }} /></div>
                      <div className="h-3 mt-1" style={{ background: C.rule }}><div className="h-full" style={{ width: `${((p.proporcional ?? 0) / mx) * 100}%`, background: color(p.k), opacity: .35 }} /></div>
                      <div className="text-xs mt-1" style={{ color: C.muted }}>{miles(p.escanos)} reales · {miles(p.proporcional)} proporcionales</div></div>
                    <div className="text-xs">{p.votosPorEscano != null && <span className="block">{miles(p.votosPorEscano)} votos por escaño</span>}{p.huerfanosPct != null && <span className="block" style={{ color: C.muted }}>{miles(p.huerfanosPct)} % de sus votos sin escaño</span>}</div>
                  </div>); })()}</div>
                  <div className="overflow-x-auto mt-8"><table className="w-full text-sm text-left"><thead><tr style={{ borderBottom: `1px solid ${C.ink}` }}><th className="py-2">Partido</th><th>Escaño más barato</th><th>Escaño más frágil</th></tr></thead><tbody>{reparto.partidos.map((p: Any) => <tr key={p.k} style={{ borderBottom: `1px solid ${C.rule}` }}><td className="py-2 font-semibold" style={{ color: color(p.k) }}>{p.nombre}</td><td>{p.barato ? `${p.barato.prov}: ${miles(p.barato.votos)} votos · se lo quitaría a ${p.barato.aQuienNombre}` : "—"}</td><td>{p.fragil ? `${p.fragil.prov}: ${miles(p.fragil.votos)} votos · sería para ${p.fragil.paraQuienNombre}` : "—"}</td></tr>)}</tbody></table></div>
                </>}
                {reparto.nota && <p className="text-xs mt-4" style={{ color: C.muted }}>{reparto.nota}</p>}
              </Section>}
              {tamano && <Section id="tamano" kicker="Territorio" title="Dónde ha cambiado el voto">
                {tamano.referenciaNombre && <p className="text-sm mb-4" style={{ color: C.muted }}>Cambio frente a {tamano.referenciaNombre}, en puntos, solo con municipios ya contados al 100 %</p>}
                {(() => { const cols: Any[] = tamano.filas?.[0]?.cambios ?? []; const mx = Math.max(1, ...(tamano.filas ?? []).flatMap((f: Any) => (f.cambios ?? []).map((c: Any) => Math.abs(c.cambio ?? 0)))); return <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr style={{ borderBottom: `1px solid ${C.ink}` }}><th className="py-2">Tamaño</th>{cols.map(c => <th key={c.k} style={{ color: color(c.k) }}>{c.nombre}</th>)}</tr></thead><tbody>{(tamano.filas ?? []).map((f: Any) => <tr key={f.nombre} style={{ borderBottom: `1px solid ${C.rule}` }}><td className="py-2"><b>{f.nombre}</b>{f.municipios != null && <span className="block text-xs" style={{ color: C.muted }}>{miles(f.municipios)} municipios</span>}</td>{cols.map(col => { const c = f.cambios?.find((x: Any) => x.k === col.k); if (!c || c.cambio == null) return <td key={col.k}>—</td>; const col2 = c.cambio > 0 ? C.olive : c.cambio < 0 ? C.red : C.muted; return <td key={col.k} className="min-w-[80px]"><span style={{ color: col2, fontWeight: 600 }}>{signed(c.cambio)}</span><span className="block h-1.5 mt-1" style={{ width: `${(Math.abs(c.cambio) / mx) * 100}%`, background: col2 }} /></td>; })}</tr>)}</tbody></table></div>; })()}
                {tamano.nota && <p className="text-xs mt-4" style={{ color: C.muted }}>{tamano.nota}</p>}
              </Section>}
              {/* C. NOCHE */}
              <Section id="noche" kicker="Evolución" title="El gráfico de la noche">
                {chartData.length === 0 ? <p style={{ color: C.muted }}>Aún no hay histórico.</p> : (
                  <>
                    <div className="h-80">
                      <ResponsiveContainer>
                        <ComposedChart data={chartData}>
                          <CartesianGrid stroke={C.rule} strokeDasharray="2 4" />
                          <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <ReferenceLine y={176} stroke={C.red} strokeDasharray="4 2" />
                          {top4.map((k) => <Area key={k + "b"} dataKey={`${k}_band`} stroke="none" fill={color(k)} fillOpacity={0.15} legendType="none" name={`${name(k)} p10–p90`} isAnimationActive={false} />)}
                          {top4.map((k) => <Line key={k + "m"} dataKey={`${k}_p50`} stroke={color(k)} strokeWidth={2} dot={false} name={`${name(k)} proyección`} isAnimationActive={false} />)}
                          {top4.map((k) => <Line key={k + "r"} dataKey={`${k}_bruto`} stroke={color(k)} strokeDasharray="5 4" dot={false} name={`${name(k)} recuento`} legendType="none" isAnimationActive={false} />)}
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs" style={{ color: C.muted }}>Línea continua y banda: proyección RepIndex. Línea discontinua: recuento oficial.</p>
                    <h3 className="text-lg mt-6 mb-2" style={{ fontFamily: SERIF }}>Probabilidad de llegar a 176</h3>
                    <div className="h-56">
                      <ResponsiveContainer>
                        <LineChart data={chartData}>
                          <CartesianGrid stroke={C.rule} strokeDasharray="2 4" />
                          <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} unit=" %" tick={{ fontSize: 11 }} />
                          <Tooltip />
                          {sumas.map((s, i) => <Line key={i} dataKey={`s${i}`} name={s.nombre} stroke={[C.olive, C.ochre, C.red, C.grey][i % 4]} dot={false} strokeWidth={2} isAnimationActive={false} />)}
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </Section>

              {historia.length > 0 && <Section id="examen" kicker="Transparencia" title="El panel, a examen">
                <div className="flex flex-wrap gap-2 mb-4" role="tablist">{EXAM_TABS.map(([k, l]) => <EditorialButton key={k} role="tab" aria-selected={examTab === k} className="rounded-full border px-3 py-1 text-sm" style={{ borderColor: examTab === k ? color(k) : C.rule, background: examTab === k ? color(k) : "transparent", color: examTab === k ? C.paper : C.ink }} onClick={() => setExamTab(k)}>{l}</EditorialButton>)}</div>
                {examen.frase && <p className="text-lg mb-3" style={{ fontFamily: SERIF }}>{examen.frase}</p>}
                <div className="h-80"><ResponsiveContainer><ComposedChart data={examen.data}>
                  <CartesianGrid stroke={C.rule} strokeDasharray="2 4" />
                  <XAxis dataKey="esc" type="number" domain={[0, 100]} unit=" %" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip />
                  <Area dataKey="band" stroke="none" fill={color(examTab)} fillOpacity={0.18} name="horquilla p10–p90" isAnimationActive={false} />
                  <Line dataKey="p50" stroke={color(examTab)} strokeWidth={2} dot={false} name="proyección" isAnimationActive={false} />
                  <Line dataKey="bruto" stroke={C.grey} strokeDasharray="5 4" dot={false} name="recuento" isAnimationActive={false} />
                  {examen.final != null && <ReferenceLine y={examen.final} stroke={C.ink} strokeWidth={1} label={{ value: `resultado final: ${examen.final}`, position: "insideTopLeft", fontSize: 11, fill: C.ink }} />}
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </ComposedChart></ResponsiveContainer></div>
                <p className="text-xs mt-2" style={{ color: C.muted }}>Cada punto es lo que el panel publicó en ese minuto. No borramos ni corregimos lo publicado.</p>
              </Section>}

              <Section id="alambre" kicker="Provincias" title="Escaños en juego y lo que vale un voto">
                {panel?.enJuego?.total != null && <EditorialButton className="block text-left mb-5" onClick={() => { setAllProv(true); document.getElementById("tabla-alambre")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><span className="block text-6xl" style={{ fontFamily: SERIF, color: C.ochre }}>{num(panel?.enJuego?.total)}</span><span className="block text-sm">escaños en juego</span></EditorialButton>}
                <div id="tabla-alambre" className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead><tr className="text-left" style={{ borderBottom: `2px solid ${C.ink}` }}>
                      {[["nombre", "Provincia"], ["escrutado", "Escrutado"], ["cerrado", "Reparto cerrado"], ["enJuego", "En juego"], ["winner", "Último escaño"], ["runnerUp", "Lo persigue"], ["votesNeeded", "Votos que faltan"], ["valorVoto", "Valor del voto"]].map(([key, label]) => <th key={key} className="py-2" aria-sort={sortProv.key === key ? sortProv.asc ? "ascending" : "descending" : "none"}><EditorialButton className="text-left font-semibold" onClick={() => sortColumn(key)}>{label}{sortProv.key === key ? sortProv.asc ? " ↑" : " ↓" : " ↕"}</EditorialButton></th>)}
                    </tr></thead>
                    <tbody>{provShown.map(p => {
                      const detail = originalProvs.find(v => v.p === p.p) ?? p;
                      return <Fragment key={p.p}>
                        <tr style={{ borderBottom: `1px solid ${C.rule}` }}>
                          <td className="py-3 font-semibold"><EditorialButton className="text-left" onClick={() => setOpenProv(openProv === p.p ? null : p.p)} aria-expanded={openProv === p.p}>{openProv === p.p ? "▾" : "▸"} {p.nombre}</EditorialButton></td>
                          <td>{num(p.escrutado)} %</td><td>{pct(p.cerrado)}</td><td>{num(p.enJuego)}</td><td style={{ color: p.ultimo ? color(p.ultimo.winner) : C.muted }}>{p.ultimo ? name(p.ultimo.winner) : "—"}</td><td>{p.ultimo ? name(p.ultimo.runnerUp) : "—"}</td><td>{num(p.ultimo?.votesNeeded)}</td><td>{p.valorVoto == null ? "—" : `×${num(p.valorVoto)}`}</td>
                        </tr>
                        {openProv === p.p && <tr><td colSpan={8} className="p-3" style={{ background: C.card }}>
                          <div className="text-xs mb-2" style={{ color: C.muted }}>{num(p.escanos)} escaños{p.votosPorEscano != null && <> · {num(p.votosPorEscano)} votos por escaño</>}{p.ultimo && <> · persigue: {name(p.ultimo.runnerUp)}</>}</div>
                          <table className="text-sm"><thead><tr><th className="text-left pr-6">Partido</th><th>Oficial</th><th>Proyección</th></tr></thead><tbody>{Array.from(new Set([...Object.keys(detail.proy ?? {}), ...Object.keys(detail.bruto ?? {})])).map(k => <tr key={k}><td style={{ color: color(k) }}>{name(k)}</td><td className="text-center">{detail.bruto?.[k] ?? "—"}</td><td className="text-center">{detail.proy?.[k] ?? "—"}</td></tr>)}</tbody></table>
                        </td></tr>}
                      </Fragment>;
                    })}</tbody>
                  </table>
                </div>
                {provs.length > 15 && <EditorialButton className="mt-3 underline text-sm" onClick={() => setAllProv(!allProv)}>{allProv ? "Ver solo 15 provincias" : `Ver las ${provs.length}`}</EditorialButton>}
                {panel?.enJuego?.nota && <p className="mt-4 text-xs italic" style={{ color: C.muted }}>{panel?.enJuego?.nota}</p>}
              </Section>
              <Section id="apuesta" title="La apuesta sellada frente al recuento">
                {!panel?.apuesta ? <p>Se abre a las 21:00 con el sobre de la Apuesta RepIndex</p> : <>
                  <div className="flex flex-wrap gap-6 mb-5"><EditorialButton className="block text-left" onClick={() => document.getElementById("apuesta-provincias")?.scrollIntoView({ behavior: "smooth", block: "center" })}><span className="block text-5xl" style={{ fontFamily: SERIF, color: C.olive }}>{num(panel?.apuesta?.aciertaMasVotado)} de {num(panel?.apuesta?.total)}</span><span className="block text-sm">provincias con el más votado acertado</span></EditorialButton><EditorialButton className="block text-left" onClick={() => document.getElementById("apuesta-provincias")?.scrollIntoView({ behavior: "smooth", block: "center" })}><span className="block text-5xl" style={{ fontFamily: SERIF }}>{num(panel?.apuesta?.repartoExacto)}</span><span className="block text-sm">provincias con el reparto exacto</span></EditorialButton></div>
                  <div className="overflow-x-auto"><table className="w-full min-w-[360px] text-sm"><thead><tr className="text-left"><th>Partido</th><th>Apuesta</th><th>Ahora</th><th>Diferencia</th></tr></thead><tbody>{panel?.apuesta?.nacional?.map(p => <tr key={p.k} style={{ borderBottom: `1px solid ${C.rule}` }}><td className="py-2"><EditorialButton style={{ color: color(p.k) }} onClick={() => { setFocusParty(p.k); go("rangos"); }}>{p.nombre}</EditorialButton></td><td>{num(p.apuesta)}</td><td>{num(p.ahora)}</td><td style={{ color: p.ahora > p.apuesta ? C.olive : p.ahora < p.apuesta ? C.red : C.muted }}>{signed(p.ahora - p.apuesta)}</td></tr>)}</tbody></table></div>
                  <div id="apuesta-provincias" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 mt-4">{panel?.apuesta?.provincias?.map(p => <EditorialButton key={p.p} className="block text-left text-xs py-2" onClick={() => openProvince(p.p)}><b>{p.nombre}</b><span className="block" style={{ color: p.aciertaMasVotado ? C.olive : C.red }}>{p.aciertaMasVotado ? "✓" : "✗"} Más votado · {name(p.apuestaMasVotado)} → {name(p.ahoraMasVotado)}</span><span style={{ color: p.repartoExacto ? C.olive : C.muted }}>{p.repartoExacto ? "✓" : "✗"} Reparto exacto</span></EditorialButton>)}</div>
                  {panel?.apuesta?.nota && <p className="text-xs mt-4" style={{ color: C.muted }}>{panel?.apuesta?.nota}</p>}
                </>}
                <EditorialButton asChild className="underline mt-4 text-sm"><a href="/especiales/elecciones/apuesta-29n">La Apuesta RepIndex · 29-N →</a></EditorialButton>
              </Section>

              {/* E. CERA */}
              <Section id="cera" kicker="Voto exterior" title="El voto desde el extranjero (CERA)">
                <p className="mb-3">El voto de los residentes en el extranjero se cuenta el viernes 4 de diciembre, en el escrutinio general.</p>
                {(panel.ceraRiesgo ?? []).length === 0 ? <p style={{ color: C.muted }}>Ninguna provincia en riesgo por ahora.</p> : (
                  <ul className="divide-y" style={{ borderColor: C.rule }}>
                    {panel.ceraRiesgo.map((c: Any) => {
                      const pierde = c.pierde ?? c.exterior?.pierde ?? c.ultimo?.winner;
                      const gana = c.gana ?? c.exterior?.gana ?? c.ultimo?.runnerUp;
                      return (
                        <li key={c.p} className="py-2 flex flex-wrap justify-between gap-2">
                          <EditorialButton className="font-semibold underline-offset-2 hover:underline" onClick={() => { setAllProv(true); setOpenProv(c.p); go("alambre"); }}>{c.nombre}</EditorialButton>
                          <span>{pierde ? name(pierde) : "—"} → {gana ? name(gana) : "—"}</span>
                          <span className="text-sm" style={{ color: C.muted }}>{num(c.votosExterior ?? c.exterior?.votosExterior)} votos exteriores esperados</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              {/* F. SENADO */}
              <Section id="senado" kicker="Cortes Generales" title="Congreso frente a Senado">
                {panel.senado && (
                  <>
                    <div className="flex flex-wrap gap-3 mb-2">
                      {(panel.senado.reparto ?? []).map((r: Any) => (
                        <div key={r.k} className="px-3 py-2" style={{ background: C.card, borderLeft: `4px solid ${color(r.k)}` }}>
                          <div className="text-2xl font-bold" style={{ fontFamily: SERIF }}>{r.escanos}</div><div className="text-xs">{r.nombre}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs mb-4" style={{ color: C.muted }}>Senadores electos en urnas: {panel.senado.total}. {panel.senado.nota}</p>
                    <h3 className="text-lg mb-2" style={{ fontFamily: SERIF }}>Circunscripciones en disputa o ajustadas</h3>
                    {(() => {
                      const list = (panel.senado.circs ?? []).filter((c: Any) => c.estado === "en disputa" || c.estado === "ajustado");
                      if (!list.length) return <p className="mb-4" style={{ color: C.muted }}>Ninguna por ahora.</p>;
                      return (
                        <div className="grid md:grid-cols-2 gap-3 mb-6">
                          {list.map((c: Any) => (
                            <div key={c.circ} className="p-3 text-sm" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
                              <div className="flex justify-between"><b>{c.nombre}</b><span style={{ color: c.estado === "en disputa" ? C.red : C.ochre }}>{c.estado} · margen {num(c.margen)}</span></div>
                              <ul className="mt-1">{c.electos.map((e: Any, i: number) => <li key={i}>{e.nombre} <span style={{ color: color(e.partido) }}>({name(e.partido)})</span> · {num(e.proyectado)}</li>)}</ul>
                              {c.primeroFuera && <div className="mt-1" style={{ color: C.muted }}>Primero fuera: {c.primeroFuera.nombre} ({name(c.primeroFuera.partido)}) · {num(c.primeroFuera.proyectado)}</div>}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                )}
                <h3 className="text-lg mb-2" style={{ fontFamily: SERIF }}>Voto dividido</h3>
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="text-left" style={{ borderBottom: `2px solid ${C.ink}` }}><th className="py-2">Partido</th><th className="text-right">% Congreso</th><th className="text-right">% Senado</th><th className="text-right hidden sm:table-cell">Esc. Congreso</th><th className="text-right hidden sm:table-cell">Esc. Senado</th></tr></thead>
                  <tbody>{(panel.dividido ?? []).map((d: Any) => (
                    <tr key={d.k} style={{ borderBottom: `1px solid ${C.rule}` }}><td className="py-1" style={{ color: color(d.k) }}>{d.nombre}</td><td className="text-right">{d.congreso ?? "—"}</td><td className="text-right">{d.senado ?? "—"}</td><td className="text-right hidden sm:table-cell">{d.escCongreso}</td><td className="text-right hidden sm:table-cell">{d.escSenado}</td></tr>
                  ))}</tbody>
                </table></div>
              </Section>

              {/* G. RELATO */}
              <Section id="relato" kicker="Verificación" title="Relato contra dato">
                {relato.length === 0 ? <p style={{ color: C.muted }}>Aún no hay afirmaciones registradas.</p> : (
                  <ul className="space-y-4">
                    {relato.map((r, i) => {
                      const v = (r.veredicto ?? "").toLowerCase();
                      const bg = v.includes("respaldan") ? C.olive : v.includes("prematuro") ? C.ochre : v.includes("contradicen") ? C.red : C.grey;
                      return (
                        <li key={i} className="p-3" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
                          <div className="text-xs" style={{ color: C.muted }}>{r.quien}{r.minuto_video ? ` · min. ${r.minuto_video}` : ""}{r.ts ? ` · ${madrid(r.ts)}` : ""}</div>
                          <p className="italic my-1" style={{ fontFamily: SERIF }}>«{r.frase}»</p>
                          <span className="inline-block text-xs px-2 py-0.5 rounded" style={{ background: bg, color: C.paper }}>{r.veredicto}</span>
                          <p className="text-sm mt-1">{r.explicacion}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              {/* H. COTEJOS */}
              <Section id="cotejos" kicker="Robustez" title="Cotejos con elecciones anteriores">
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="text-left" style={{ borderBottom: `2px solid ${C.ink}` }}><th className="py-2">Partido</th><th className="text-right">Proyección</th>{(panel.cotejos ?? []).map((c: Any) => <th key={c.b} className="text-right">{c.nombre}</th>)}</tr></thead>
                  <tbody>{sortedP.map((p) => (
                    <tr key={p.k} style={{ borderBottom: `1px solid ${C.rule}` }}><td className="py-1" style={{ color: p.color }}>{p.nombre}</td><td className="text-right">{p.p50}</td>{(panel.cotejos ?? []).map((c: Any) => <td key={c.b} className="text-right">{p.cotejos?.[c.b] ?? "—"}</td>)}</tr>
                  ))}</tbody>
                </table></div>
              </Section>
              {panel?.calidad && <Section id="calidad" title="Control de calidad">
                {panel?.calidad?.cuarentena?.length ? <ul className="space-y-3">{panel?.calidad?.cuarentena?.map(q => <li key={q.id} className="text-sm"><b>{q.n}</b> · {q.motivo}</li>)}</ul> : <p style={{ color: C.olive }}>Ningún dato en revisión</p>}
                {panel?.calidad?.nota && <p className="text-xs mt-3" style={{ color: C.muted }}>{panel?.calidad?.nota}</p>}
                <aside className="p-4 mt-5 text-sm leading-relaxed" style={{ background: C.card, borderLeft: `3px solid ${C.olive}` }}><h3 className="font-semibold mb-2">Guardarraíles</h3><p>{GUARDARRAILES}</p></aside>
              </Section>}
              </>}
            </>
          )}

          {/* I. MÉTODO */}
          {!panel?.vacio && <section id="metodo" className="elec-section py-8" style={{ borderTop: `1px solid ${C.rule}` }}>
            <details>
              <summary className="cursor-pointer text-xl" style={{ fontFamily: SERIF }}>Método</summary>
              <div className="mt-3 space-y-2 text-sm leading-relaxed">
                <p><b>Fuente:</b> Ministerio del Interior (resultados provisionales oficiales).</p>
                <p>Cada municipio contado se compara consigo mismo en elecciones anteriores; lo que falta por contar se estima con municipios parecidos (misma provincia y tamaño).</p>
                <p>El sistema aprende durante la noche cuánto cambia un municipio desde que empieza a contar hasta que termina.</p>
                <p>Reparto con la ley D'Hondt y barrera del 3 % por provincia. 300 simulaciones por cotejo (600 en total) por minuto dan las horquillas (p10–p90).</p>
                <p>Regla de publicación: solo se declara primera fuerza con un 90 % o más; si no, «empate técnico».</p>
                <p>Cada proyección queda guardada con su hora y se publicará al final el acierto a cada hora.</p>
                <p>{GUARDARRAILES}</p>
                {panel?.margenOrden != null && <p><b>Margen por orden de llegada:</b> {panel.margenOrden.toLocaleString("es-ES")}</p>}
              </div>
            </details>
          </section>}
        </div>
      </div>
    </Layout>
  );
}
