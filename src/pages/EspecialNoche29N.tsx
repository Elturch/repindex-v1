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
type Estado = { modo?: "simulacro" | "real"; panel?: Panel | null; historia?: Any[]; relato?: Any[]; pastillas?: Pastilla[] };
const GUARDARRAILES = "Ninguna cifra la escribe una inteligencia artificial: todas salen del motor de cálculo. Los titulares se generan con reglas fijas y un verificador comprueba que cada número del texto coincide con los datos; si no coincide, no se publica. Solo se declara primera fuerza con un 90 % o más. Nada se publica por debajo del 0,5 % escrutado.";
const madrid = (ts?: string | Date | null) => ts ? new Date(ts).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }) : "—";
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-ES", { maximumFractionDigits: 1 })}`;
function EditorialButton({ className = "", style, ...props }: ButtonProps) {
  return <Button variant="ghost" className={`block h-auto rounded-none whitespace-normal p-0 hover:opacity-80 ${className}`} style={{ color: C.ink, background: "transparent", ...style }} {...props} />;
}
const pct = (x?: number | null) => (x == null ? "—" : `${Math.round(x * 100)} %`);
const num = (x?: number | null) => (x == null ? "—" : x.toLocaleString("es-ES"));

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
    const offset = (document.querySelector("header.sticky")?.getBoundingClientRect().height ?? 64) + (liveBar.current?.getBoundingClientRect().height ?? 56) + 16;
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
  const pillColor = (p: Pastilla) => ["certeza", "apuesta"].includes(p.tipo) ? C.olive : ["vuelco", "engano"].includes(p.tipo) ? C.red : ["mayoria", "poder", "alambre"].includes(p.tipo) ? C.ochre : ["escanos", "primera"].includes(p.tipo) ? color(p.partido ?? "") : ["hora", "tramo", "inicio"].includes(p.tipo) ? C.ink : p.tipo === "cera" ? "#4a6a8a" : C.grey;
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

  return (
    <Layout>
      <Helmet><link rel="canonical" href="https://repindex.ai/especiales/elecciones/noche-29n" /></Helmet>
      <div className="elec-page" style={{ background: C.paper, color: C.ink, minHeight: "100vh" }}>
        <style>{`
          .elec-page .elec-section { scroll-margin-top: 160px; transition: background-color 1.5s, box-shadow 1.5s; }
          .elec-page [data-lit="true"] { background-color: ${C.ochre}18; box-shadow: inset 3px 0 ${C.ochre}; }
          .elec-page .elec-ticker { scrollbar-width: thin; scrollbar-color: ${C.grey} ${C.ink}; }
          .elec-page .elec-pill { border-radius: 999px; flex-shrink: 0; scroll-snap-align: start; }
          .elec-page .elec-new { animation: elec-enter .4s ease-out, elec-ring 1s ease-in-out 3; }
          .elec-page .elec-live-dot { animation: elec-pulse 1.5s ease-in-out infinite; }
          .elec-page table th, .elec-page table td { padding-right: 16px; }
          @keyframes elec-enter { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: translateX(0); } }
          @keyframes elec-ring { 50% { box-shadow: 0 0 0 3px ${C.ochre}; } }
          @keyframes elec-pulse { 50% { opacity: .4; } }
          @media (prefers-reduced-motion: reduce) { .elec-page *, .elec-page .elec-new, .elec-page .elec-live-dot { animation: none; transition: none; scroll-behavior: auto; } }
        `}</style>
        <div ref={liveBar} className="sticky top-16 z-40 w-full" style={{ background: C.ink, color: C.paper }}>
          {st?.modo === "simulacro" && <div className="text-center text-xs sm:text-sm font-semibold px-3 py-2" style={{ background: C.red, color: C.paper }}>SIMULACRO con los votos reales del 23J y un orden de llegada simulado — no son datos del 29-N</div>}
          <div className="flex items-center gap-2 px-2 sm:px-4 min-h-14" onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }} onTouchStart={() => { paused.current = true; }} onTouchEnd={() => { paused.current = false; touchUntil.current = Date.now() + 10_000; }} onTouchCancel={() => { paused.current = false; touchUntil.current = Date.now() + 10_000; }} onFocusCapture={() => { paused.current = true; }} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) paused.current = false; }}>
            <div className="shrink-0 text-[10px] sm:text-xs leading-tight pr-1"><span className="flex items-center gap-1 font-bold"><span className="elec-live-dot inline-block h-2 w-2 rounded-full" style={{ background: C.red }} />EN DIRECTO</span><span style={{ color: C.grey }}>{panel?.vacio ? 0 : pastillas.length} titulares</span></div>
            <EditorialButton aria-label="Titulares más recientes" title="Titulares más recientes" className="shrink-0 h-10 w-6 text-3xl" style={{ color: C.paper }} onClick={() => { touchUntil.current = Date.now() + 10_000; advance(-1); }}>‹</EditorialButton>
            <div ref={carousel} className="elec-ticker flex min-w-0 flex-1 gap-3 overflow-x-auto snap-x snap-proximity py-2 px-1" style={{ touchAction: "pan-x pan-y" }}>
              {!panel?.vacio && pastillas.length > 0 ? pastillas.map(p => <EditorialButton key={keyOf(p)} title={p.texto} onClick={() => navigatePill(p)} className={`elec-pill flex items-center gap-2 px-3 py-2 max-w-[460px] ${newKeys.has(keyOf(p)) ? "elec-new" : ""}`} style={{ background: C.card, color: C.ink, fontSize: 13, fontWeight: p.prioridad === 3 ? 700 : 400 }}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: pillColor(p), border: ["hora", "tramo"].includes(p.tipo) ? `1px solid ${C.grey}` : undefined }} />
                <time className="shrink-0 text-[10px]" style={{ color: C.grey }}>{madrid(p.ts)}</time><span className="truncate text-left">{p.texto}</span>
              </EditorialButton>) : <p className="text-xs sm:text-sm py-1" style={{ color: C.grey }}>Los titulares aparecerán en cuanto el recuento oficial supere el 0,5 % escrutado</p>}
            </div>
            <EditorialButton aria-label="Titulares anteriores" title="Titulares anteriores" className="shrink-0 h-10 w-6 text-3xl" style={{ color: C.paper }} onClick={() => { touchUntil.current = Date.now() + 10_000; advance(1); }}>›</EditorialButton>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 pb-16">
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
              <section id="arriba" className="elec-section py-8 text-center">
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
                  {[["certezas", "Certezas", panel?.certezas], ["pendiente", "Voto pendiente", panel?.pendiente], ["porque", "Por qué cambia", panel?.porque], ["rangos", "Rangos", true], ["poder", "Poder", panel?.poder], ["noche", "La noche", true], ["alambre", "En juego", true], ["apuesta", "Apuesta", true], ["cera", "CERA", true], ["senado", "Senado", true], ["relato", "Relato", true], ["cotejos", "Cotejos", true], ["calidad", "Calidad", panel?.calidad], ["metodo", "Método", true]].filter(([, , visible]) => visible).map(([id, label]) => <EditorialButton key={String(id)} className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: C.rule }} onClick={() => go(String(id))}>{String(label)}</EditorialButton>)}
                </nav>}
              </section>
              {!panel?.vacio && <>
              {panel?.certezas && <Section id="certezas" title="Lo que ya sabemos y lo que no">
                <div className="grid md:grid-cols-3 gap-6">
                  <div><h3 className="font-semibold pb-2" style={{ color: C.olive }}>✓ Ya es seguro</h3>
                    {panel?.certezas?.seguro?.filter(i => !i.prov).map(i => certezaItem(i))}
                    {!!panel?.certezas?.seguro?.filter(i => i.prov).length && <><EditorialButton className="text-sm underline py-3" onClick={() => setShowDecided(!showDecided)} aria-expanded={showDecided}>+ {panel?.certezas?.seguro?.filter(i => i.prov).length} provincias decididas {showDecided ? "▾" : "▸"}</EditorialButton>{showDecided && panel?.certezas?.seguro?.filter(i => i.prov).map(i => certezaItem(i))}</>}
                  </div>
                  <div><h3 className="font-semibold pb-2" style={{ color: C.ochre }}>Aún en el aire</h3>{[...(panel?.certezas?.abierto ?? [])].sort((a, b) => b.prob - a.prob).map(i => certezaItem(i, true))}</div>
                  <div><h3 className="font-semibold pb-2">Lo sabremos hacia…</h3>{panel?.certezas?.conHora?.map(i => <EditorialButton key={i.id} className="block w-full py-3 text-left" onClick={() => go(i.prov ? "alambre" : i.ancla, i.prov)}><span className="block text-3xl" style={{ fontFamily: SERIF }}>{i.hora ?? "—"}</span><span className="block text-sm mt-1">{i.texto}</span></EditorialButton>)}<p className="text-xs italic" style={{ color: C.muted }}>estimación al ritmo actual de recuento</p></div>
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

              {panel?.poder && <Section id="poder" title="Quién tiene la llave">
                <div className="space-y-5">{panel?.poder?.partidos?.map((p, i) => <EditorialButton key={p.k} className="block w-full text-left" onClick={() => { setFocusParty(p.k); go("rangos"); }}>
                  <span className={`flex flex-wrap justify-between gap-2 mb-2 ${i === 0 ? "font-bold text-lg" : "text-sm"}`}><span>{p.nombre}</span><span>{num(p.poder)} % del poder · {num(p.escanos)} escaños</span></span>
                  <span className="relative block h-5" style={{ background: C.rule }}><span className="absolute inset-y-0 left-0" style={{ width: `${p.poder}%`, background: color(p.k), opacity: i === 0 ? 1 : .6 }} /><span className="absolute top-1/2 h-px" style={{ left: `${p.p10}%`, width: `${p.p90 - p.p10}%`, background: C.ink }} /><span className="absolute top-1 bottom-1 w-px" style={{ left: `${p.p10}%`, background: C.ink }} /><span className="absolute top-1 bottom-1 w-px" style={{ left: `${p.p90}%`, background: C.ink }} /></span><span className="block mt-1 text-xs" style={{ color: C.muted }}>Horquilla: {num(p.p10)}–{num(p.p90)} %</span>
                </EditorialButton>)}</div>
                <div className="grid sm:grid-cols-2 gap-4 mt-8">{sumas.map((s, i) => <EditorialButton key={i} className="block p-4 text-left" style={{ background: C.card, border: `1px solid ${C.rule}` }} onClick={() => go("noche")}><span className="block text-4xl" style={{ fontFamily: SERIF }}>{pct(s.prob176)}</span><b className="block mt-2">{s.nombre}</b><span className="block text-sm">Probabilidad de llegar a 176 · horquilla {s.p10}–{s.p90} · central {s.p50}</span><span className="block text-xs mt-1" style={{ color: C.muted }}>{s.partidos?.map(name).join(" + ")}</span></EditorialButton>)}</div>
                {panel?.poder?.nota && <p className="italic text-sm mt-4" style={{ color: C.muted }}>{panel?.poder?.nota}</p>}
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
