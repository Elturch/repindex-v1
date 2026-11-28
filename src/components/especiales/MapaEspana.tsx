import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

/* Mapa de provincias del especial Noche 29-N. Solo pinta datos del panel; no calcula resultados. */
type Any = any;
type Geo = { viewBox: string; provincias: Record<string, { n: string; d: string; cx: number; cy: number; pequena?: boolean }>; comunidades?: string; marcoCanarias?: string; faros?: Record<string, { n: string; x: number; y: number }>; fuente?: string };
export type CapaMapa = "gana" | "contado" | "ultimo" | "exterior" | "cambio";

const URL_MAPA = "/especiales/elecciones/mapa-provincias.json";
let cache: Promise<Geo | null> | null = null;
const loadGeo = () => (cache ??= fetch(URL_MAPA).then(r => (r.ok ? r.json() : null)).catch(() => null));

const SANS = "'Libre Franklin', Arial, sans-serif";
const HEAD = "'Libre Caslon Text', Georgia, serif";
const CAPAS: [CapaMapa, string][] = [["gana", "Quién gana"], ["contado", "Cuánto se ha contado"], ["ultimo", "Último escaño"], ["exterior", "Voto exterior"]];
const CAMBIO_PARTIDOS: [string, string][] = [["PP", "PP"], ["PSOE", "PSOE"], ["VOX", "Vox"], ["SUMAR", "Sumar"]];
const fmt = (x?: number | null, d = 0) => (x == null || Number.isNaN(x) ? "—" : x.toLocaleString("es-ES", { maximumFractionDigits: d, useGrouping: "always" } as unknown as Intl.NumberFormatOptions));
const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${Math.round(Math.max(0, Math.min(100, pct)))}%, transparent)`;

/* proy/bruto pueden venir como {PP: 3} o como [{k, escanos}] */
function seats(x: Any): [string, number][] {
  if (!x) return [];
  const arr: [string, number][] = Array.isArray(x) ? x.map((e: Any) => [e.k, e.escanos ?? e.n ?? e.v ?? 0]) : Object.entries(x).map(([k, v]) => [k, Number(v) || 0]);
  return arr.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
}

type Props = {
  panel: Any;
  name: (k: string) => string;
  color: (k: string) => string;
  capas?: CapaMapa[];
  inicial?: CapaMapa;
  conFaros?: boolean;
  onVerTabla?: (p: string) => void;
};

export function MapaEspana({ panel, name, color, capas = CAPAS.map(c => c[0]), inicial = "gana", conFaros = false, onVerTabla }: Props) {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [capa, setCapa] = useState<CapaMapa>(inicial);
  const [partido, setPartido] = useState("PP");
  const [hover, setHover] = useState<{ p?: string; faro?: string; x: number; y: number } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { let a = true; loadGeo().then(g => a && setGeo(g)); return () => { a = false; }; }, []);

  const byP = useMemo(() => Object.fromEntries(((panel?.provincias ?? []) as Any[]).map(p => [String(p.p), p])), [panel]);
  const farosDatos = useMemo(() => Object.fromEntries(((panel?.faros?.lista ?? []) as Any[]).map(f => [String(f.id), f])), [panel]);
  const tamProv: Any = panel?.tamano?.provincias ?? {};

  if (!geo?.provincias) return null;
  const [vx, vy, vw, vh] = geo.viewBox.split(/\s+/).map(Number);

  const ganador = (p: string): string | null => {
    const v = panel?.votosProv?.[p];
    if (!v) return null;
    const ent: [string, number][] = Array.isArray(v) ? v.map((e: Any) => [e.k, e.votos ?? e.v ?? 0]) : Object.entries(v).map(([k, n]) => [k, Number(n) || 0]);
    const top = ent.filter(([k]) => k !== "BL" && k !== "OTROS").sort((a, b) => b[1] - a[1])[0];
    return top && top[1] > 0 ? top[0] : null;
  };
  const cambioDe = (p: string): number | null => {
    const t = tamProv?.[p];
    if (!t) return null;
    const term = t.terminados ?? t.municipios;
    if (term != null && term < 5) return null;
    const c = t.cambios?.[partido];
    const v = typeof c === "object" && c ? c.cambio : c;
    return typeof v === "number" ? v : null;
  };

  const estilo = (p: string): { fill: string; opacity?: number; stroke?: string; sw?: number } => {
    const d = byP[p];
    const esc = d?.escrutado ?? 0;
    if (capa === "gana") { const g = ganador(p); return g ? { fill: color(g), opacity: 0.25 + 0.75 * Math.min(100, esc) / 100 } : { fill: "var(--card)" }; }
    if (capa === "contado") return { fill: `color-mix(in srgb, var(--ink) ${Math.round(Math.min(100, esc))}%, var(--hair))` };
    if (capa === "ultimo") { const n = d?.ultimo?.votesNeeded; if (n == null) return { fill: "var(--card)" }; return { fill: n < 500 ? "var(--bad)" : n < 2000 ? mix("var(--bad)", 55) : n < 10000 ? mix("var(--warn)", 35) : "var(--card)" }; }
    if (capa === "exterior") return d?.exterior?.enRiesgo ? { fill: mix("var(--bad)", 20), stroke: "var(--bad)", sw: 2.5 } : { fill: "var(--card)" };
    const c = cambioDe(p);
    if (c == null) return { fill: "url(#mapa-rayado)" };
    return { fill: mix(c >= 0 ? "var(--ok)" : "var(--bad)", 15 + 85 * Math.min(10, Math.abs(c)) / 10) };
  };

  const datoCorto = (p: string) => {
    const d = byP[p];
    if (capa === "cambio") { const c = cambioDe(p); return c == null ? "sin datos aún" : `${name(partido)} ${c > 0 ? "+" : ""}${fmt(c, 1)} puntos`; }
    if (capa === "ultimo" && d?.ultimo) return `último escaño a ${fmt(d.ultimo.votesNeeded)} votos`;
    if (capa === "exterior") return d?.exterior?.enRiesgo ? "escaño en riesgo por el voto exterior" : "sin riesgo por el voto exterior";
    if (capa === "gana") { const g = ganador(p); return `${g ? `gana ${name(g)}, ` : ""}${fmt(d?.escrutado, 1)} % escrutado`; }
    return `${fmt(d?.escrutado, 1)} % escrutado`;
  };

  const chips = (x: Any) => <span className="inline-flex flex-wrap gap-1">{seats(x).map(([k, n]) => <span key={k} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-bold" style={{ background: color(k), color: "#fff", fontFamily: SANS }}>{name(k)} {n}</span>)}</span>;
  const key = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };
  const pick = (p: string) => setSel(s => (s === p ? null : p));

  const presentes = [...new Set(Object.keys(geo.provincias).map(ganador).filter(Boolean) as string[])];
  const d = sel ? byP[sel] : null;
  const hp = hover?.p ? byP[hover.p] : null;

  return (
    <div className="mapa-esp" style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}>
      <style>{`.mapa-esp .mp{cursor:pointer;transition:stroke-width .1s}.mapa-esp .mp:hover,.mapa-esp .mp:focus-visible{stroke:var(--ink)!important;stroke-width:1.5px!important;outline:none}.mapa-esp .mtab{font:700 11.5px ${SANS};text-transform:uppercase;letter-spacing:.08em;color:var(--ink2);padding:6px 8px;border-bottom:3px solid transparent;white-space:nowrap}.mapa-esp .mtab.on{border-bottom-color:var(--ink);color:var(--ink)}`}</style>
      <div className="flex gap-1 overflow-x-auto mb-3" role="tablist" aria-label="Capas del mapa" style={{ borderBottom: "1px solid var(--line)" }}>
        {capas.includes("cambio") && <button role="tab" aria-selected={capa === "cambio"} className={`mtab ${capa === "cambio" ? "on" : ""}`} onClick={() => setCapa("cambio")}>Cambio de voto</button>}
        {CAPAS.filter(([c]) => capas.includes(c)).map(([c, l]) => <button key={c} role="tab" aria-selected={capa === c} className={`mtab ${capa === c ? "on" : ""}`} onClick={() => setCapa(c)}>{l}</button>)}
      </div>
      {capa === "cambio" && <div className="flex gap-1 mb-3" role="group" aria-label="Partido">{CAMBIO_PARTIDOS.map(([k, l]) => <button key={k} className={`mtab ${partido === k ? "on" : ""}`} style={partido === k ? { borderBottomColor: color(k) } : undefined} onClick={() => setPartido(k)}>{l}</button>)}</div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative" onMouseLeave={() => setHover(null)}>
          <svg viewBox={geo.viewBox} width="100%" style={{ display: "block", height: "auto" }} role="group" aria-label="Mapa de España por provincias">
            <defs><pattern id="mapa-rayado" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--card)" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--line)" strokeWidth="1.5" /></pattern></defs>
            {Object.entries(geo.provincias).map(([p, g]) => {
              const s = estilo(p);
              const isSel = sel === p;
              const common = {
                className: "mp", role: "button", tabIndex: 0, "aria-label": `${g.n}: ${datoCorto(p)}`, "aria-pressed": isSel,
                fill: s.fill, fillOpacity: s.opacity, stroke: isSel ? "var(--ink)" : s.stroke ?? "var(--paper)", strokeWidth: isSel ? 2 : s.sw ?? 0.8,
                onClick: () => pick(p), onKeyDown: key(() => pick(p)),
                onMouseMove: (e: React.MouseEvent) => { const r = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect(); setHover({ p, x: e.clientX - r.left, y: e.clientY - r.top }); },
                onFocus: () => setHover({ p, x: ((g.cx - vx) / vw) * 100, y: -1 }), onBlur: () => setHover(null),
              };
              return g.pequena
                ? <g key={p}><path d={g.d} fill={s.fill} fillOpacity={s.opacity} stroke="var(--paper)" strokeWidth={0.8} pointerEvents="none" /><circle {...common} cx={g.cx} cy={g.cy} r={7} /></g>
                : <path key={p} {...common} d={g.d} />;
            })}
            {geo.comunidades && <path d={geo.comunidades} fill="none" stroke="var(--ink)" strokeWidth={0.6} pointerEvents="none" />}
            {geo.marcoCanarias && <path d={geo.marcoCanarias} fill="none" stroke="var(--muted)" strokeWidth={0.8} pointerEvents="none" />}
            {conFaros && geo.faros && Object.entries(geo.faros).map(([id, f]) => { const fd = farosDatos[id]; const t = !!fd?.terminado; return (
              <circle key={id} cx={f.x} cy={f.y} r={3.6} fill={t ? "var(--ink)" : "var(--paper)"} stroke="var(--ink)" strokeWidth={1.2} tabIndex={0} role="img"
                aria-label={`Pueblo faro ${fd?.n ?? f.n}: ${t ? `terminado, PP ${fmt(fd?.PP, 1)} %, PSOE ${fmt(fd?.PSOE, 1)} %` : "contando"}`}
                onMouseMove={e => { const r = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect(); setHover({ faro: id, x: e.clientX - r.left, y: e.clientY - r.top }); }} />); })}
          </svg>
          {hover && (hover.p || hover.faro) && hover.y >= 0 && (
            <div className="pointer-events-none absolute z-10 p-2 text-sm shadow-sm" style={{ left: Math.min(hover.x + 12, 9999), top: hover.y + 12, maxWidth: 260, background: "var(--card)", border: "1px solid var(--ink)", transform: hover.x > 220 ? "translateX(calc(-100% - 24px))" : undefined }}>
              {hover.faro ? (() => { const fd = farosDatos[hover.faro!]; const f = geo.faros![hover.faro!]; return <><b>{fd?.n ?? f.n}</b><div className="text-xs">{fd?.terminado ? `PP ${fmt(fd.PP, 1)} % · PSOE ${fmt(fd.PSOE, 1)} %` : "contando"}</div></>; })() : <>
                <b style={{ fontFamily: HEAD }}>{geo.provincias[hover.p!].n}</b>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{fmt(hp?.escrutado, 1)} % escrutado{hp?.escanos != null ? ` · ${fmt(hp.escanos)} escaños` : ""}</div>
                {hp?.proy && <div className="mt-1">{chips(hp.proy)}</div>}
                {capa === "ultimo" && hp?.ultimo && <div className="text-xs mt-1">Último escaño: {name(hp.ultimo.winner)} frente a {name(hp.ultimo.runnerUp)}, a {fmt(hp.ultimo.votesNeeded)} votos</div>}
                {capa === "exterior" && hp?.exterior?.enRiesgo && <div className="text-xs mt-1" style={{ color: "var(--bad)" }}>Escaño en riesgo por el voto exterior</div>}
                {capa === "cambio" && <div className="text-xs mt-1">{datoCorto(hover.p!)}</div>}
              </>}
            </div>
          )}
        </div>

        <aside aria-live="polite" className="text-sm" style={{ borderTop: "2px solid var(--ink)", paddingTop: 10 }}>
          {!sel ? <p style={{ color: "var(--muted)" }}>Pulsa una provincia para ver su detalle.</p> : <>
            <h3 className="text-2xl font-bold" style={{ fontFamily: HEAD }}>{geo.provincias[sel].n}</h3>
            <p style={{ color: "var(--muted)" }}>{d?.escanos != null ? `${fmt(d.escanos)} escaños · ` : ""}{fmt(d?.escrutado, 1)} % escrutado</p>
            {d?.proy && <div className="mt-3"><div className="text-[11px] font-bold uppercase tracking-wider" style={{ fontFamily: SANS }}>Proyección</div>{chips(d.proy)}</div>}
            {d?.bruto && <div className="mt-2"><div className="text-[11px] font-bold uppercase tracking-wider" style={{ fontFamily: SANS }}>Recuento oficial</div>{chips(d.bruto)}</div>}
            {d?.ultimo && <p className="mt-3">Último escaño: <b>{name(d.ultimo.winner)}</b> frente a <b>{name(d.ultimo.runnerUp)}</b>, a {fmt(d.ultimo.votesNeeded)} votos</p>}
            {d?.exterior?.enRiesgo && <p className="mt-2 p-2" style={{ background: mix("var(--bad)", 12), color: "var(--bad)" }}>El voto desde el extranjero puede cambiar un escaño en esta provincia.</p>}
            {capa === "cambio" && <p className="mt-2">{datoCorto(sel)}</p>}
            {onVerTabla && <button className="mt-4 px-3 py-2 text-xs font-bold uppercase tracking-wider" style={{ fontFamily: SANS, border: "1px solid var(--ink)" }} onClick={() => onVerTabla(sel)}>Ver en la tabla de provincias</button>}
          </>}
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs" style={{ fontFamily: SANS }}>
        {capa === "gana" && <>{presentes.map(k => <span key={k} className="inline-flex items-center gap-1"><i style={{ width: 10, height: 10, background: color(k), display: "inline-block" }} />{name(k)}</span>)}<span style={{ color: "var(--muted)" }}>más claro = menos escrutado</span></>}
        {capa === "contado" && <span className="inline-flex items-center gap-2">0 %<i style={{ width: 120, height: 10, display: "inline-block", background: "linear-gradient(90deg,var(--hair),var(--ink))" }} />100 %<span style={{ color: "var(--muted)" }}>(50 % en el centro)</span></span>}
        {capa === "ultimo" && <>{[["var(--bad)", "menos de 500 votos"], [mix("var(--bad)", 55), "menos de 2.000"], [mix("var(--warn)", 35), "menos de 10.000"], ["var(--card)", "más"]].map(([c, l]) => <span key={l} className="inline-flex items-center gap-1"><i style={{ width: 10, height: 10, background: c, border: "1px solid var(--line)", display: "inline-block" }} />{l}</span>)}</>}
        {capa === "exterior" && <span className="inline-flex items-center gap-1"><i style={{ width: 10, height: 10, background: mix("var(--bad)", 20), border: "2px solid var(--bad)", display: "inline-block" }} />escaño en riesgo por el voto exterior</span>}
        {capa === "cambio" && <><span className="inline-flex items-center gap-1"><i style={{ width: 10, height: 10, background: "var(--ok)", display: "inline-block" }} />sube</span><span className="inline-flex items-center gap-1"><i style={{ width: 10, height: 10, background: "var(--bad)", display: "inline-block" }} />baja</span><span style={{ color: "var(--muted)" }}>intensidad hasta ±10 puntos · rayado = sin datos aún</span></>}
        {conFaros && geo.faros && <span className="inline-flex items-center gap-1">● pueblo faro terminado · ○ contando</span>}
      </div>
      {geo.fuente && <p className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>{geo.fuente}</p>}
    </div>
  );
}
