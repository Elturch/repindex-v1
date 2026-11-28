import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { BarraEspeciales29N } from "@/components/especiales/BarraEspeciales29N";
import { supabase } from "@/integrations/supabase/client";
import { isDevOrPreview } from "@/lib/env";

/* La Apuesta RepIndex · 29-N. Sobre sellado (huella SHA-256) hasta el domingo 21:00. */
const REFRESH_MS = 30_000;
const C = { paper: "#f6f1e4", ink: "#1d1a14", muted: "#6b6455", rule: "#d8cfb8", olive: "#5b6b2e", ochre: "#b8862b", red: "#9e2b25", grey: "#8a8475", card: "#fbf8ef" };
const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const NOCHE = "/especiales/elecciones/noche-29n";

const PARTY_COLORS: Record<string, string> = {
  "PP": "#1d5fa8", "PSOE": "#d4202c", "Vox": "#5ba33b", "Frente Amplio": "#c2185b", "Front Valencià": "#e86a1a",
  "Podemos": "#6b2c91", "Se Acabó La Fiesta": "#444", "ERC": "#f2a900", "Junts": "#20b2aa", "EH Bildu": "#7fb135",
  "PNV": "#1b7f4a", "BNG": "#6db9e8", "Coalición Canaria": "#e6c200", "Adelante Andalucía": "#2e8b57",
};
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIASES: Record<string, string> = { salf: "Se Acabó La Fiesta", cc: "Coalición Canaria", bildu: "EH Bildu", ehbildu: "EH Bildu", fa: "Frente Amplio", frenteamplio: "Frente Amplio", frontvalencia: "Front Valencià", compromis: "Front Valencià", pp: "PP", psoe: "PSOE", vox: "Vox", junts: "Junts", erc: "ERC", pnv: "PNV", eajpnv: "PNV", bng: "BNG", podemos: "Podemos", adelanteandalucia: "Adelante Andalucía", coalicioncanaria: "Coalición Canaria", seacabolafiesta: "Se Acabó La Fiesta" };
const canon = (k: string) => ALIASES[norm(k)] ?? k;
const colorOf = (k: string) => PARTY_COLORS[canon(k)] ?? C.grey;
const RIGHT = new Set(["PP", "Vox", "Se Acabó La Fiesta"]);
const LEFT = new Set(["PSOE", "Frente Amplio", "Front Valencià", "Podemos", "ERC", "EH Bildu", "BNG", "Adelante Andalucía"]);
const groupOf = (k: string) => (RIGHT.has(canon(k)) ? 1 : LEFT.has(canon(k)) ? -1 : 0);
const BLOQUE_DER = ["PP", "Vox"];
const BLOQUE_IZQ = ["PSOE", "Frente Amplio", "Front Valencià", "Podemos", "ERC", "Junts", "EH Bildu", "PNV", "BNG", "Coalición Canaria"];

type Any = any;
const fmtMadrid = (iso?: string | null) => iso ? new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "full", timeStyle: "short" }) : "—";
const probTxt = (v: number) => `${Math.round(v <= 1 ? v * 100 : v)} %`;
const fmt1 = (v: number) => v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function Section({ id, title, kicker, children }: { id: string; title: string; kicker?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="py-8 scroll-mt-24" style={{ borderTop: `1px solid ${C.rule}` }}>
      {kicker && <div className="text-xs uppercase tracking-widest mb-1" style={{ color: C.ochre }}>{kicker}</div>}
      <h2 className="text-2xl md:text-3xl mb-4" style={{ fontFamily: SERIF }}>{title}</h2>
      {children}
    </section>
  );
}
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
const Btn = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className={`px-4 py-2 text-sm font-semibold hover:opacity-80 ${p.className ?? ""}`} style={{ background: C.ink, color: C.paper, ...(p.style ?? {}) }} />
);

/* ---------- D'Hondt ---------- */
function dhondt(votes: Record<string, number>, seats: number, total: number, exclude: string[] = ["otros", "blanco"]) {
  const elig = Object.entries(votes).filter(([k, v]) => !exclude.includes(k) && v >= 0.03 * total && v > 0);
  const res: Record<string, number> = {};
  elig.forEach(([k]) => (res[k] = 0));
  for (let i = 0; i < seats; i++) {
    let best = "", bq = -1;
    for (const [k, v] of elig) { const q = v / (res[k] + 1); if (q > bq) { bq = q; best = k; } }
    if (best) res[best]++;
  }
  Object.keys(res).forEach((k) => res[k] === 0 && delete res[k]);
  return res;
}
function simulate(provs: Any[], T: number, T0: number, M: number) {
  const d = (T - T0) / T0;
  const totals: Record<string, number> = {};
  const byProv: Record<string, Record<string, number>> = {};
  for (const p of provs) {
    const s: Record<string, number> = {};
    let sum = 0;
    for (const [k, v] of Object.entries(p.voto ?? {})) { const x = Number(v) / 100; if (norm(k) === "otros" || norm(k) === "blanco") continue; s[k] = x; sum += x; }
    s.blanco = 0.009; s.otros = Math.max(0, 1 - sum - 0.009);
    const w: Record<string, number> = {}; let ws = 0;
    for (const [k, x] of Object.entries(s)) { const g = k === "otros" || k === "blanco" ? 0 : groupOf(k); w[k] = x * Math.exp((d >= 0 ? M : -M) * g); ws += w[k]; }
    const v: Record<string, number> = {}; let tot = 0;
    for (const k of Object.keys(s)) { v[k] = Math.max(0, s[k] + d * (ws ? w[k] / ws : 0)); tot += v[k]; }
    const r = dhondt(v, p.escanos, tot);
    byProv[p.codigo] = r;
    for (const [k, n] of Object.entries(r)) totals[k] = (totals[k] ?? 0) + n;
  }
  return { totals, byProv };
}
const sameReparto = (a: Record<string, number> = {}, b: Record<string, number> = {}) => {
  const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of ks) if ((a[k] ?? 0) !== (b[k] ?? 0)) return false;
  return true;
};
const sumBloque = (t: Record<string, number>, names: string[]) => Object.entries(t).reduce((acc, [k, n]) => acc + (names.includes(canon(k)) ? n : 0), 0);

/* ---------- Bloques estáticos ---------- */
const SENALES_DEFAULT = [
  { t: "Encuestas publicadas del 9 al 25 de noviembre", d: "26 casas, la última de cada una, ponderada por tamaño; media recortada en los grandes partidos y mediana en los pequeños.", p: "70 % del voto nacional de PP, PSOE y Vox; 100 % del resto." },
  { t: "El error de las encuestas en las cinco últimas generales", d: "2015, 2016, abril y noviembre de 2019 y 2023. Las encuestas no son la verdad: medimos cuánto fallaron.", p: "Corrección y margen." },
  { t: "Mercado de predicción con dinero real (Polymarket)", d: "La apuesta de miles de personas con su dinero, partido a partido y provincia a provincia.", p: "30 % del voto nacional de PP, PSOE y Vox; contraste del ganador de cada provincia." },
  { t: "Voto real reciente: las europeas de 2024 por provincia", d: "Cómo se ha movido cada provincia frente al conjunto de España desde 2023 y dónde votan los partidos nuevos.", p: "Reparto territorial." },
  { t: "Resultados oficiales de 2023 del Ministerio del Interior", d: "Provincia a provincia y con el voto exterior.", p: "Base del mapa." },
  { t: "Campaña: debates analizados por RepIndex, actos y movilización", d: "Se documentan pero no mueven la cifra, porque hoy no hay manera de medir cuánto acierta esta señal.", p: "0 (contexto)." },
];
const METODO_DEFAULT = "Voto nacional por partido → mapa provincial → ley D'Hondt con la barrera del 3 % en cada una de las 52 circunscripciones (Madrid elige 38 y Cádiz 8) → 400 simulaciones con el error histórico para dar horquillas y probabilidades.";
const ERRORES: { anio: string; v: (number | null)[] }[] = [
  { anio: "2015", v: [1.2, 1.1, null, 3.3] },
  { anio: "2016", v: [3.6, 1.4, null, -3.5] },
  { anio: "Abril 2019", v: [-3.7, -0.4, -0.7, 1.4] },
  { anio: "Noviembre 2019", v: [-0.6, 0.8, 2.6, -1.1] },
  { anio: "2023", v: [-1.0, 3.4, -0.8, -0.7] },
];
const signed = (x: number | null) => (x == null ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${fmt1(Math.abs(x))}`);

function senalItems(senales: Any) {
  if (Array.isArray(senales) && senales.length) {
    return senales.map((s: Any) => typeof s === "string" ? { t: s, d: "", p: "" } : { t: s.senal ?? s.nombre ?? s.titulo ?? s.t ?? "", d: s.detalle ?? s.descripcion ?? s.d ?? "", p: s.peso != null ? String(s.peso) : s.p ?? "" });
  }
  return SENALES_DEFAULT;
}

function MetodoYFiabilidad({ senales, metodo }: { senales?: Any; metodo?: Any }) {
  const items = senalItems(senales);
  const metodoTxt = typeof metodo === "string" ? metodo : Array.isArray(metodo) ? metodo.join(" → ") : metodo?.texto ?? METODO_DEFAULT;
  return (
    <>
      <Section id="como" title="Cómo la hemos hecho" kicker="Señales y su peso">
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((s, i) => (
            <div key={i} className="p-4" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
              <div className="text-xs mb-1" style={{ color: C.ochre }}>{i + 1}</div>
              <div className="text-lg mb-1" style={{ fontFamily: SERIF }}>{s.t}</div>
              {s.d && <p className="text-sm" style={{ color: C.muted }}>{s.d}</p>}
              {s.p && <div className="text-sm mt-2"><b style={{ color: C.olive }}>Peso:</b> {s.p}</div>}
            </div>
          ))}
        </div>
        <p className="mt-4 text-base" style={{ fontFamily: SERIF }}><b>El procedimiento:</b> {metodoTxt}</p>
      </Section>
      <Section id="fiable" title="¿Hasta qué punto es fiable?" kicker="El error real de las encuestas">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `2px solid ${C.ink}` }}>
              {["Elección", "PP", "PSOE", "Vox", "Izq. alternativa"].map((h) => <th key={h} className="text-left py-2 pr-3">{h}</th>)}
            </tr></thead>
            <tbody>{ERRORES.map((r) => (
              <tr key={r.anio} style={{ borderBottom: `1px solid ${C.rule}` }}>
                <td className="py-2 pr-3">{r.anio}</td>
                {r.v.map((x, i) => <td key={i} className="py-2 pr-3 tabular-nums" style={{ color: x == null ? C.grey : x > 0 ? C.olive : C.red }}>{signed(x)}</td>)}
              </tr>))}</tbody>
          </table>
        </div>
        <p className="text-xs mt-2" style={{ color: C.muted }}>Media de encuestas de las dos últimas semanas frente al resultado, en puntos. Positivo = el partido sacó más de lo que decían las encuestas.</p>
        <p className="mt-4" style={{ fontFamily: SERIF }}>El único sesgo que se repite es el del PSOE, infravalorado en 4 de 5 elecciones (de media, 1,3 puntos): lo corregimos a medias. En el resto el error cambia de dirección de una vez a otra, así que no lo corregimos: lo usamos para fijar el margen. Por eso la apuesta da cada resultado con una horquilla y una probabilidad, no solo una cifra. Y lo que más puede fallar es quién va a votar: por eso, al abrir el sobre, publicaremos también una calculadora para mover la participación.</p>
      </Section>
      <Section id="no-incluye" title="Lo que no incluye">
        <ul className="list-disc pl-5" style={{ fontFamily: SERIF }}>
          <li>El Senado.</li>
          <li>El voto exterior, que se cuenta el viernes 4 de diciembre.</li>
        </ul>
      </Section>
    </>
  );
}

/* ---------- Estado 1 ---------- */
function useCountdown(target?: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!target) return null;
  const ms = Math.max(0, new Date(target).getTime() - now);
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60, done: ms === 0 };
}
function Huella({ sha }: { sha: string }) {
  const [ok, setOk] = useState(false);
  const groups = sha.match(/.{1,8}/g) ?? [];
  return (
    <div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-lg md:text-2xl break-all" style={{ fontFamily: MONO }}>
        {groups.map((g, i) => <span key={i}>{g}</span>)}
      </div>
      <div className="mt-3"><Btn onClick={() => { navigator.clipboard.writeText(sha); setOk(true); setTimeout(() => setOk(false), 2000); }}>{ok ? "Copiada ✓" : "Copiar huella"}</Btn></div>
    </div>
  );
}
function SobreCerrado({ d }: { d: Any }) {
  const cd = useCountdown(d.revelar_desde);
  return (
    <>
      <section className="py-10 text-center">
        <h2 className="text-3xl md:text-5xl leading-tight max-w-4xl mx-auto" style={{ fontFamily: SERIF }}>Nuestra apuesta ya está cerrada. Se abre el domingo a las 21:00</h2>
        {cd && (
          <div className="flex justify-center gap-3 md:gap-6 mt-8">
            {([["d", "días"], ["h", "horas"], ["m", "min"], ["s", "seg"]] as const).map(([k, l]) => (
              <div key={k} className="min-w-[64px] md:min-w-[96px] p-3" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
                <div className="text-4xl md:text-6xl font-bold tabular-nums" style={{ fontFamily: SERIF }}>{String(cd[k]).padStart(2, "0")}</div>
                <div className="text-xs uppercase tracking-widest" style={{ color: C.muted }}>{l}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-10 text-xs uppercase tracking-widest mb-2" style={{ color: C.ochre }}>Huella digital (SHA-256)</div>
        {d.sha256 ? <Huella sha={d.sha256} /> : <p style={{ color: C.muted }}>—</p>}
        <p className="mt-3 text-sm" style={{ color: C.muted }}>Sellada el {fmtMadrid(d.sellado_at)}</p>
      </section>
      <Section id="huella" title="Qué es la huella">
        <p style={{ fontFamily: SERIF }} className="text-lg">Es un código único calculado a partir del texto exacto de la apuesta. Si se cambiara una sola cifra, el código sería otro. Publicarla hoy demuestra que el pronóstico existía antes de votar, sin enseñar ningún número. El domingo a las 21:00 publicaremos el texto completo y cualquiera podrá comprobar, aquí mismo, que su huella coincide.</p>
      </Section>
      <Section id="no-sondeo" title="No es un sondeo">
        <p style={{ fontFamily: SERIF }} className="text-lg">No hemos preguntado a nadie. Es una deducción a partir de señales públicas y de resultados oficiales, cerrada antes del periodo en que la ley prohíbe publicar sondeos, y que no se publica hasta que cierran los colegios.</p>
      </Section>
      <MetodoYFiabilidad />
      <section className="py-8 text-center" style={{ borderTop: `1px solid ${C.rule}` }}>
        <Link to={NOCHE} className="text-xl underline" style={{ fontFamily: SERIF, color: C.olive }}>El domingo, la noche electoral en directo →</Link>
      </section>
    </>
  );
}

/* ---------- Estado 2 ---------- */
function SeatBars({ totals, base, horq }: { totals: Record<string, number>; base?: Record<string, number>; horq?: Record<string, number[]> }) {
  const rows = Object.entries(totals).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(200, ...rows.map(([k, n]) => Math.max(n, horq?.[k]?.[1] ?? 0)));
  const x = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="space-y-2">
      {rows.map(([k, n]) => {
        const delta = base ? n - (base[k] ?? 0) : 0;
        const h = horq?.[k];
        return (
          <div key={k} className="grid grid-cols-[110px_1fr_72px] md:grid-cols-[170px_1fr_90px] items-center gap-2">
            <div className="text-sm truncate">{canon(k)}</div>
            <div className="relative h-6" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
              {h && <div className="absolute top-0 bottom-0" style={{ left: x(h[0]), width: `calc(${x(h[1])} - ${x(h[0])})`, background: colorOf(k), opacity: 0.25 }} />}
              <div className="absolute top-1 bottom-1 left-0" style={{ width: x(n), background: colorOf(k) }} />
              <div className="absolute top-[-4px] bottom-[-4px]" style={{ left: x(176), width: 1, background: C.red }} />
            </div>
            <div className="text-sm tabular-nums font-semibold text-right">
              {n}{base && delta !== 0 && <span style={{ color: delta > 0 ? C.olive : C.red }}> {delta > 0 ? "▲" : "▼"}{Math.abs(delta)}</span>}
              {h && !base && <div className="text-[11px] font-normal" style={{ color: C.muted }}>{h[0]}–{h[1]}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
function Chips({ r }: { r: Record<string, number> }) {
  return <div className="flex flex-wrap gap-1">{Object.entries(r).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
    <span key={k} className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: colorOf(k), color: "#fff" }}>{canon(k)} {n}</span>))}</div>;
}
function BloqueSum({ label, n }: { label: string; n: number }) {
  const w = Math.min(100, (n / 350) * 100);
  return (
    <div className="p-4" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
      <div className="flex justify-between items-baseline"><span className="text-sm">{label}</span><span className="text-3xl font-bold" style={{ fontFamily: SERIF, color: n >= 176 ? C.olive : C.ink }}>{n}</span></div>
      <div className="relative h-3 mt-2" style={{ background: C.paper, border: `1px solid ${C.rule}` }}>
        <div className="absolute inset-y-0 left-0" style={{ width: `${w}%`, background: n >= 176 ? C.olive : C.ochre }} />
        <div className="absolute top-[-4px] bottom-[-4px]" style={{ left: `${(176 / 350) * 100}%`, width: 2, background: C.red }} title="Mayoría absoluta: 176" />
      </div>
    </div>
  );
}

function SobreAbierto({ d, demo }: { d: Any; demo: boolean }) {
  const J: Any = useMemo(() => { try { return JSON.parse(d.contenido_texto); } catch { return null; } }, [d.contenido_texto]);
  const [match, setMatch] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const T0 = Number(J?.participacion_apostada ?? 66);
  const [T, setT] = useState(T0);
  const [M, setM] = useState(0);
  const [openP, setOpenP] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "escanos", dir: -1 });

  useEffect(() => { sha256Hex(d.contenido_texto).then((h) => setMatch(h.toLowerCase() === String(d.sha256 ?? "").toLowerCase())).catch(() => setMatch(false)); }, [d.contenido_texto, d.sha256]);
  useEffect(() => setT(T0), [T0]);

  const provs: Any[] = J?.provincias ?? [];
  const sim = useMemo(() => simulate(provs, T, T0, M), [provs, T, T0, M]);
  const simBase = useMemo(() => simulate(provs, T0, T0, 0), [provs, T0]);
  if (!J) return <p className="py-20 text-center" style={{ color: C.red }}>No se ha podido leer el texto sellado.</p>;

  const escanos: Record<string, number> = J.escanos ?? {};
  const horq: Record<string, number[]> = J.horquillas_80 ?? {};
  const probs: [string, number][] = Object.entries(J.probabilidades ?? {}).map(([k, v]) => [k, Number(v)]);
  const isBase = T === T0 && M === 0;
  const totalsShow = isBase ? escanos : sim.totals;
  const cambian = isBase ? [] : provs.filter((p) => !sameReparto(sim.byProv[p.codigo], simBase.byProv[p.codigo]));

  const filtered = provs
    .filter((p) => norm(p.provincia).includes(norm(q)))
    .sort((a, b) => {
      const va = a[sort.k], vb = b[sort.k];
      return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "es")) * sort.dir;
    });
  const th = (k: string, l: string) => (
    <th className="text-left py-2 pr-3 cursor-pointer select-none" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>{l}{sort.k === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>
  );

  return (
    <>
      <section className="py-8">
        <h2 className="text-3xl md:text-5xl text-center mb-6" style={{ fontFamily: SERIF }}>Así creemos que acabarán las elecciones</h2>
        <SeatBars totals={escanos} horq={horq} />
        <p className="text-xs mt-2" style={{ color: C.muted }}>Barra: escaños apostados. Sombra: horquilla del 80 %. Línea roja: mayoría absoluta (176).</p>
        {probs.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 mt-6">
            {probs.map(([k, v]) => (
              <button key={k} onClick={() => go("calculadora")} className="p-4 text-left hover:opacity-80" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
                <div className="text-5xl font-bold" style={{ fontFamily: SERIF }}>{probTxt(v)}</div>
                <div className="text-sm mt-1">{k.replace(/_/g, " ")}</div>
              </button>
            ))}
          </div>
        )}
        <p className="mt-4 text-center" style={{ fontFamily: SERIF }}>Participación apostada: <b>{fmt1(T0)} %</b>{J.nota_participacion ? ` · ${J.nota_participacion}` : ""}</p>
      </section>

      <Section id="comprobacion" title="Comprobación de la huella">
        <div className="text-2xl font-semibold" style={{ color: match == null ? C.muted : match ? C.olive : C.red }}>
          {match == null ? "Calculando…" : match ? "✓ La huella coincide" : "✗ No coincide"}
        </div>
        <p className="text-xs mt-1 break-all" style={{ fontFamily: MONO, color: C.muted }}>{d.sha256}</p>
        <p className="text-sm mt-2" style={{ color: C.muted }}>Tu navegador acaba de calcular la huella del texto publicado y la ha comparado con la que sellamos el {fmtMadrid(d.sellado_at)}.</p>
        <Btn className="mt-3" onClick={() => { navigator.clipboard.writeText(d.contenido_texto); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? "Copiado ✓" : "Copiar el texto sellado completo"}</Btn>
      </Section>

      <Section id="calculadora" title="Calculadora de pronóstico" kicker="Mueve la participación">
        <div className="space-y-8">
          <div>
            <div className="flex justify-between items-baseline"><label className="text-lg" style={{ fontFamily: SERIF }}>Participación</label><span className="text-3xl font-bold tabular-nums" style={{ fontFamily: SERIF }}>{fmt1(T)} %</span></div>
            <div className="relative">
              <input type="range" min={55} max={80} step={0.5} value={T} onChange={(e) => setT(Number(e.target.value))} className="w-full h-10" style={{ accentColor: C.olive }} aria-label="Participación" />
              <div className="absolute -bottom-4 text-[11px] whitespace-nowrap" style={{ left: `${((T0 - 55) / 25) * 100}%`, transform: "translateX(-50%)", color: C.ochre }}>▲ Apuesta RepIndex</div>
            </div>
          </div>
          <div>
            <div className="flex justify-between items-baseline"><label className="text-lg" style={{ fontFamily: SERIF }}>¿Quién se moviliza más?</label><span className="text-xl font-semibold">{M === 0 ? "igual" : M < 0 ? `izquierda (${fmt1(Math.abs(M))})` : `derecha (${fmt1(M)})`}</span></div>
            <input type="range" min={-1} max={1} step={0.05} value={M} onChange={(e) => setM(Number(e.target.value))} className="w-full h-10" style={{ accentColor: C.ochre }} aria-label="Quién se moviliza más" />
            <div className="flex justify-between text-xs" style={{ color: C.muted }}><span>Izquierda</span><span>Igual</span><span>Derecha</span></div>
          </div>
        </div>
        <div className="mt-6"><SeatBars totals={totalsShow} base={isBase ? undefined : simBase.totals} horq={isBase ? horq : undefined} /></div>
        {isBase && <p className="text-xs mt-2" style={{ color: C.muted }}>Sin mover los controles, se muestran las cifras selladas tal cual, sin recalcular.</p>}
        <div className="grid gap-3 md:grid-cols-2 mt-6">
          <BloqueSum label="PP + Vox" n={sumBloque(totalsShow, BLOQUE_DER)} />
          <BloqueSum label="PSOE + Frente Amplio + Front Valencià + Podemos + ERC + Junts + EH Bildu + PNV + BNG + CC" n={sumBloque(totalsShow, BLOQUE_IZQ)} />
        </div>
        <p className="text-xs mt-2" style={{ color: C.muted }}>Son sumas de escaños, no probabilidades: aquí no hay simulaciones.</p>
        {!isBase && (
        <div className="mt-6">
          <h3 className="text-lg mb-2" style={{ fontFamily: SERIF }}>Provincias que cambian de reparto ({cambian.length})</h3>
          {cambian.length === 0 ? <p className="text-sm" style={{ color: C.muted }}>Ninguna frente a la apuesta.</p> : (
            <div className="space-y-1">{cambian.map((p) => (
              <div key={p.codigo} style={{ border: `1px solid ${C.rule}`, background: C.card }}>
                <button className="w-full text-left px-3 py-2 flex justify-between" onClick={() => setOpenP(openP === p.codigo ? null : p.codigo)}>
                  <span>{p.provincia} <span style={{ color: C.muted }}>({p.escanos})</span></span><span>{openP === p.codigo ? "−" : "+"}</span>
                </button>
                {openP === p.codigo && (
                  <div className="px-3 pb-3 text-sm space-y-2">
                    <div><div className="text-xs" style={{ color: C.muted }}>Apuesta sellada</div><Chips r={p.reparto ?? {}} /></div>
                    <div><div className="text-xs" style={{ color: C.muted }}>Base de la calculadora</div><Chips r={simBase.byProv[p.codigo] ?? {}} /></div>
                    <div><div className="text-xs" style={{ color: C.muted }}>Con tus valores</div><Chips r={sim.byProv[p.codigo] ?? {}} /></div>
                  </div>
                )}
              </div>))}</div>
          )}
        </div>
        )}
        {!isBase && <Btn className="mt-4" onClick={() => { setT(T0); setM(0); }}>Volver a la apuesta</Btn>}
        <p className="mt-6 italic text-lg" style={{ fontFamily: SERIF }}>La participación por sí sola mueve poco; lo que cambia el resultado es quién va y quién se queda en casa.</p>
        <p className="text-xs mt-2" style={{ color: C.muted }}>Al mover los controles se recalcula con los porcentajes redondeados a una décima, por lo que puede haber un escaño de diferencia con la apuesta sellada.</p>
      </Section>

      <Section id="provincias" title="Las 52 circunscripciones">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar provincia…" className="w-full md:w-80 px-3 py-2 mb-3 text-sm" style={{ background: C.card, border: `1px solid ${C.rule}`, color: C.ink }} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `2px solid ${C.ink}` }}>{th("provincia", "Provincia")}{th("escanos", "Escaños")}{th("mas_votado", "Más votado")}<th className="text-left py-2 pr-3">Reparto</th>{th("seguridad_reparto", "Seguridad")}</tr></thead>
            <tbody>{filtered.map((p) => (
              <tr key={p.codigo} style={{ borderBottom: `1px solid ${C.rule}` }}>
                <td className="py-2 pr-3">{p.provincia}</td>
                <td className="py-2 pr-3 tabular-nums">{p.escanos}</td>
                <td className="py-2 pr-3"><span style={{ color: colorOf(p.mas_votado), fontWeight: 600 }}>{canon(p.mas_votado ?? "")}</span></td>
                <td className="py-2 pr-3 min-w-[180px]"><Chips r={p.reparto ?? {}} /></td>
                <td className="py-2 pr-3 tabular-nums">{p.seguridad_reparto != null ? probTxt(Number(p.seguridad_reparto)) : "—"}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <p className="text-xs mt-2" style={{ color: C.muted }}>Seguridad: porcentaje de simulaciones en que sale exactamente ese reparto.</p>
      </Section>

      <MetodoYFiabilidad senales={J.senales} metodo={J.metodo} />

      <section className="py-10 text-center" style={{ borderTop: `1px solid ${C.rule}` }}>
        <Link to={NOCHE} className="inline-block px-6 py-4 text-xl" style={{ fontFamily: SERIF, background: C.olive, color: C.paper }}>Compara la apuesta con el escrutinio real →</Link>
        {demo && <p className="mt-3 text-xs" style={{ color: C.red }}>DATOS DE EJEMPLO</p>}
      </section>
    </>
  );
}

/* ---------- Demo (solo desarrollo/preview) ---------- */
function demoPayload() {
  const mk = (codigo: string, provincia: string, escanos: number, voto: Record<string, number>, reparto: Record<string, number>, seg: number) =>
    ({ codigo, provincia, escanos, voto, reparto, mas_votado: Object.entries(voto).sort((a, b) => b[1] - a[1])[0][0], seguridad_reparto: seg });
  const provincias = [
    mk("28", "Madrid", 38, { PP: 40, PSOE: 25, Vox: 15, "Frente Amplio": 10, Podemos: 4 }, { PP: 16, PSOE: 10, Vox: 6, "Frente Amplio": 4, Podemos: 2 }, 0.31),
    mk("08", "Barcelona", 32, { PSOE: 30, Junts: 15, ERC: 13, PP: 14, Vox: 8, "Frente Amplio": 10 }, { PSOE: 11, Junts: 5, ERC: 5, PP: 5, Vox: 3, "Frente Amplio": 3 }, 0.22),
    mk("41", "Sevilla", 12, { PSOE: 33, PP: 33, Vox: 15, "Frente Amplio": 8, "Adelante Andalucía": 4 }, { PSOE: 5, PP: 5, Vox: 2 }, 0.48),
    mk("11", "Cádiz", 8, { PP: 34, PSOE: 28, Vox: 18, "Frente Amplio": 7, "Adelante Andalucía": 5 }, { PP: 3, PSOE: 3, Vox: 2 }, 0.55),
    mk("46", "Valencia", 16, { PP: 34, PSOE: 26, Vox: 16, "Front Valencià": 12 }, { PP: 6, PSOE: 5, Vox: 3, "Front Valencià": 2 }, 0.4),
    mk("48", "Bizkaia", 8, { PNV: 30, "EH Bildu": 25, PSOE: 22, PP: 10 }, { PNV: 3, "EH Bildu": 2, PSOE: 2, PP: 1 }, 0.6),
  ];
  const json = {
    _aviso: "DATOS DE EJEMPLO inventados para probar la página",
    escanos: { PP: 140, PSOE: 110, Vox: 45, "Frente Amplio": 20, Junts: 7, ERC: 7, "EH Bildu": 6, PNV: 5, Podemos: 4, BNG: 2, "Coalición Canaria": 1, "Front Valencià": 2, "Se Acabó La Fiesta": 1 },
    horquillas_80: { PP: [128, 152], PSOE: [98, 122], Vox: [36, 54], "Frente Amplio": [14, 26], Junts: [5, 9], ERC: [5, 9] },
    voto_nacional: { PP: 34, PSOE: 27, Vox: 13 },
    probabilidades: { "PP primera fuerza": 0.92, "PP + Vox ≥ 176": 0.61, "Bloque de investidura ≥ 176": 0.12 },
    participacion_apostada: 67.5, nota_participacion: "ejemplo",
    provincias, senales: SENALES_DEFAULT.map((s) => ({ senal: s.t, detalle: s.d, peso: s.p })), metodo: METODO_DEFAULT,
    limites: [], naturaleza: "ejemplo", sellado: "ejemplo",
  };
  return { sha256: "0".repeat(64), sellado_at: new Date().toISOString(), revelar_desde: new Date().toISOString(), abierta: true, contenido_texto: JSON.stringify(json) };
}

export default function EspecialApuesta29N() {
  const demo = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1" && isDevOrPreview();
  const [d, setD] = useState<Any>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    document.title = "La Apuesta RepIndex · 29-N · Especiales RepIndex";
    if (demo) { setD(demoPayload()); return; }
    let alive = true;
    const load = async () => {
      const { data, error } = await (supabase as Any).rpc("elec29n_apuesta_publica");
      if (!alive) return;
      if (error) { setErr(true); return; }
      setD(Array.isArray(data) ? data[0] : data); setErr(false);
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [demo]);

  const abierta = d?.abierta === true && typeof d?.contenido_texto === "string" && d.contenido_texto.length > 0;

  return (
    <Layout>
      <Helmet>
        <title>La Apuesta RepIndex · 29-N</title>
        <meta name="description" content="Nuestro pronóstico para las elecciones del 29-N, sellado con una huella digital y abierto al cierre de los colegios." />
      </Helmet>
      <div style={{ background: C.paper, color: C.ink, minHeight: "100vh" }}>
        <BarraEspeciales29N actual="apuesta" />
        {demo && <div className="sticky top-16 z-30 text-center text-sm font-semibold px-3 py-2" style={{ background: C.red, color: C.paper }}>DATOS DE EJEMPLO · modo demostración, no es la apuesta real</div>}
        <div className="max-w-5xl mx-auto px-4">
          <header className="pt-8 pb-4 text-center" style={{ borderBottom: `3px double ${C.ink}` }}>
            <div className="text-xs uppercase tracking-[0.3em]" style={{ color: C.muted }}>Especiales RepIndex · Elecciones 29-N</div>
            <h1 className="text-4xl md:text-6xl my-2" style={{ fontFamily: SERIF }}>La Apuesta RepIndex · 29-N</h1>
            <div className="italic" style={{ fontFamily: SERIF, color: C.muted }}>Un análisis del equipo de RepIndex.ai</div>
            {err && <div className="text-xs mt-2" style={{ color: C.red }}>Sin conexión, reintentando</div>}
          </header>
          {!d ? <p className="text-center py-24 text-xl" style={{ fontFamily: SERIF, color: C.muted }}>Cargando el sobre…</p>
            : abierta ? <SobreAbierto d={d} demo={demo} /> : <SobreCerrado d={d} />}
        </div>
      </div>
    </Layout>
  );
}
