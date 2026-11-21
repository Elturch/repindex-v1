import { ComponentType, Fragment, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout/Layout";
import { JUNTA_MAPFRE_2026 as D } from "@/data/especiales/juntaMapfre2026";
import "@/components/especiales/junta/junta.css";

// ============================================================================
// Especial · Junta General de MAPFRE 2026, por secciones.
// Portada: /especiales/juntas/mapfre-2026
// Secciones: /especiales/juntas/mapfre-2026/:seccion
// Fuente de verdad: grabación íntegra del directo (enlaces ▶ al segundo exacto).
// ============================================================================

const BASE = "/especiales/juntas/mapfre-2026";

type Sec = { slug: string; nav: string; title: string; golpe: string };
const SECCIONES: Sec[] = [
  { slug: "quien-hablo", nav: "Quién habló", title: "Los accionistas hablaron unos 3 minutos. El presidente, 77.", golpe: "La junta entera, minuto a minuto, coloreada según quién tenía la palabra." },
  { slug: "acta", nav: "El acta", title: "El acta: todo lo que se dijo, en orden", golpe: "138 momentos con su minuto. Filtra por orador o tipo, busca y oye cada frase en el vídeo." },
  { slug: "cambio-de-vara", nav: "El cambio de vara", title: "El objetivo de crecimiento: misma cifra, otra vara", golpe: "El 6% pasó de medirse en ingresos a medirse a tipo de cambio constante. Solo así se cumple." },
  { slug: "verificacion", nav: "Verificación", title: "Verificación: 32 frases con cifra, una por sello", golpe: "Fiabilidad 91/100. Cada cifra dicha, cotejada a doble ciego con documentos oficiales." },
  { slug: "preguntas", nav: "Preguntas", title: "Siete preguntas, tres respuestas a medias", golpe: "Esquive del 43%. La pregunta sobre empleo tardó 59 minutos en tener respuesta." },
  { slug: "promesometro", nav: "Promesómetro", title: "Promesómetro: lo que se prometió en la junta de 2025", golpe: "5 de 6 promesas cumplidas. Y las de 2026, comparadas en directo con los últimos resultados." },
  { slug: "omisiones", nav: "Lo que no se dijo", title: "Lo que no se dijo: poco, pero significativo", golpe: "La cifra de crecimiento en euros y la oposición a la reelección del presidente." },
  { slug: "votaciones", nav: "Votaciones", title: "El voto en contra se concentró en el presidente", golpe: "Un 4,90% en contra: cerca de 1 de cada 4 votos ajenos a Fundación MAPFRE." },
  { slug: "senales-debiles", nav: "Señales débiles", title: "Señales débiles", golpe: "Seis detalles que conviene vigilar: objetivos ya alcanzados, colchones y promesas solo en voz alta." },
  { slug: "junta-e-ias", nav: "La junta y las IAs", title: "La junta no movió a las IAs: la caída llegó antes, con la guerra", golpe: "Solo 3 de 6 IAs mencionaron la junta. La promesa sobre empleo, en 0 de 12 respuestas." },
  { slug: "metodo", nav: "Método", title: "Método y control de sesgo", golpe: "Fuente de verdad, prueba de integridad, fórmulas, privacidad, agentes y documentos usados." },
];

// ---------- utilidades ----------
const sec = (s: string) => {
  const p = s.replace("≈", "").split(":").map(Number);
  return p[0] * 3600 + p[1] * 60 + (p[2] || 0);
};
const hm = (s: string) => {
  const p = s.replace("≈", "").split(":");
  return `${+p[0]}:${p[1]}:${p[2]}`;
};
const mm = (m: number) => `${Math.floor(m / 60)}:${String(Math.floor(m % 60)).padStart(2, "0")}`;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function Play({ t, y25, label }: { t: string; y25?: boolean; label?: string }) {
  const href = `${y25 ? D.VID25 : D.VID}&t=${sec(t)}s`;
  const txt = label ?? (y25 ? `${hm(t)} (2025)` : `${t.startsWith("≈") ? "≈" : ""}${hm(t)}`);
  return (
    <a className="play" href={href} target="_blank" rel="noopener noreferrer">
      {txt}
    </a>
  );
}

// Texto con marcado: **negrita**, [[HH:MM:SS]], [[25|HH:MM:SS]], {{pequeño}}
function Rich({ s }: { s: string }) {
  const parts = s.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\]|\{\{[^}]+\}\})/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
        if (p.startsWith("{{")) return <span key={i} className="small">{p.slice(2, -2)}</span>;
        if (p.startsWith("[[")) {
          const v = p.slice(2, -2);
          return v.startsWith("25|") ? <Play key={i} t={v.slice(3)} y25 /> : <Play key={i} t={v} />;
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

function Bar({ l, v, max, txt, col, goal }: { l: ReactNode; v: number; max: number; txt: ReactNode; col?: string; goal?: number }) {
  return (
    <div className="row">
      <span>{l}</span>
      <div className="track">
        <div className="fill" style={{ width: `${Math.max(0, (100 * v) / max).toFixed(1)}%`, ...(col ? { background: col } : {}) }} />
        {goal != null && <i className="goal" style={{ left: `${((100 * goal) / max).toFixed(1)}%` }} />}
      </div>
      <span className="v">{txt}</span>
    </div>
  );
}

const St = ({ k, children }: { k: string; children: ReactNode }) => <span className={`st ${k}`}>{children}</span>;

// ---------- cifras ----------
const C: any[] = D.C;
const nC = (k: string) => C.filter((c) => c[0] === k).length;
const OK = nC("ok"), MT = nC("mat"), SV = nC("sv");
const FIA = Math.round((100 * (OK + MT / 2)) / (OK + MT));
const Q: any[] = D.Q;
const ESQ = Math.round((100 * Q.filter((q) => q[0] !== "ok").length) / Q.length);
const P: any[] = D.P;
const PC = (k: string) => P.filter((p) => p[0] === k).length;

// ============================================================================
// Secciones
// ============================================================================
function QuienHablo() {
  const T: any[] = D.T;
  const R: Record<string, [string, string]> = D.R;
  const [sel, setSel] = useState(8);
  const [only, setOnly] = useState<string | null>(null);
  const tot: Record<string, number> = {};
  T.forEach((s) => (tot[s[2]] = (tot[s[2]] || 0) + s[1] - s[0]));
  const s = T[sel];
  const st = `${String(Math.floor(s[0] / 60)).padStart(2, "0")}:${String(Math.floor(s[0] % 60)).padStart(2, "0")}:${String(Math.round((s[0] % 1) * 60)).padStart(2, "0")}`;
  return (
    <>
      <p className="small">La junta entera, de principio a fin, coloreada según quién tenía la palabra. Pulsa un tramo para ver qué ocurrió o un orador para aislar sus intervenciones.</p>
      <div className="tl" role="group" aria-label="Cinta de la junta">
        {T.map((x, i) => (
          <button
            key={i}
            className={`seg${i === sel ? " sel" : ""}${only && x[2] !== only ? " dim" : ""}`}
            style={{ flexGrow: +(x[1] - x[0]).toFixed(2), background: R[x[2]][1] }}
            aria-label={`${R[x[2]][0]}, de ${mm(x[0])} a ${mm(x[1])}`}
            onClick={() => setSel(i)}
          />
        ))}
      </div>
      <div className="axis"><span>0:00</span><span>0:30</span><span>1:00</span><span>1:30</span><span>2:00</span><span>2:21</span></div>
      <div className="who">
        {Object.keys(R).map((k) => (
          <button key={k} aria-pressed={only === k} onClick={() => setOnly(only === k ? null : k)}>
            <span className="m">{Math.round(tot[k])} min</span>
            <span className="l"><span className="sw" style={{ background: R[k][1] }} /> {R[k][0]}</span>
          </button>
        ))}
      </div>
      <div className="note">
        <div className="m">
          {R[s[2]][0]} · {mm(s[0])}–{mm(s[1])} · {(s[1] - s[0]).toFixed(1).replace(".", ",")} min · <Play t={st} label="oír este tramo" />
        </div>
        <div className="q">{s[3]}</div>
      </div>
      <p className="small">Los tramos se atribuyen a partir de las fórmulas de la mesa («tiene la palabra…», «doy la palabra…»), con un margen de unos 30 segundos.</p>
    </>
  );
}

function Acta() {
  const A: any[] = D.A;
  const WHO: Record<string, string> = D.WHO;
  const TY: Record<string, string> = D.TY;
  const [fk, setFk] = useState("all");
  const [fq, setFq] = useState("");
  const rows = useMemo(() => {
    const q = norm(fq.trim());
    return A.filter(
      (x) =>
        (fk === "all" || (fk.startsWith("w:") ? x[1].startsWith(fk.slice(2)) : x[2] === fk.slice(2))) &&
        (!q || norm(x[3] + " " + WHO[x[1]]).includes(q)),
    );
  }, [fk, fq]);
  const PL: Record<string, string> = { d: "Datos", p: "Promesas", c: "Promesas cumplidas", a: "Anuncios", q: "Turnos de pregunta", r: "Respuestas" };
  const chips: [string, string][] = [
    ["all", `Todo (${A.length})`],
    ...([["H", "Presidente"], ["J", "Director financiero"], ["I", "Vicepresidente"], ["S", "Secretario"], ["A", "Accionistas"]] as [string, string][]).map(
      ([k, l]) => [`w:${k}`, l] as [string, string],
    ),
    ...["d", "p", "c", "a", "q", "r"].map((t) => [`t:${t}`, `${PL[t]} (${A.filter((x) => x[2] === t).length})`] as [string, string]),
  ];
  return (
    <>
      <p>Recogemos cada intervención, cada dato, cada promesa, cada pregunta y cada respuesta, con el minuto de la grabación. Lo dicho se recoge en estilo indirecto y fiel, con citas literales breves solo donde la palabra exacta importa. Para oír la frase completa, pulsa ▶: el vídeo oficial se abre en ese segundo.</p>
      <div className="legend">
        {chips.map(([k, l]) => (
          <button key={k} className="chip" aria-pressed={fk === k} onClick={() => setFk(k)}>{l}</button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: "8px 0 14px" }}>
        <label className="small" htmlFor="jwsj-q">Buscar en el acta</label>
        <input id="jwsj-q" className="search" type="search" placeholder="dividendo, plantilla, Brasil…" value={fq} onChange={(e) => setFq(e.target.value)} />
        <span className="count">{rows.length} de {A.length} momentos</span>
      </div>
      <div className="scroll">
        <table className="acta stack">
          <thead><tr><th>Minuto</th><th>Quién</th><th>Qué se dijo</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((x, i) => (
              <tr key={i}>
                <td className="t" data-l="Minuto"><Play t={x[0]} /></td>
                <td className="w" data-l="Quién">{WHO[x[1]]}</td>
                <td data-l="Qué se dijo"><span className="ty">{TY[x[2]]}</span>{x[3]}</td>
              </tr>
            )) : <tr><td colSpan={3}>Nada coincide con la búsqueda.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="small">Los accionistas que intervienen aparecen sin nombre: lo que se analiza es lo que preguntan, no quién pregunta. Los minutos marcados con ≈ son aproximados en ±1 minuto.</p>
    </>
  );
}

function Vara() {
  return (
    <div className="grid2">
      <div>
        <ul className="list">
          {(D.VARA as string[][]).map((x, i) => (
            <li key={i}><b>{x[0]}.</b> <Rich s={x[1]} /></li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Crecimiento medio de las primas, 2024–2025</h3>
        <div className="bars">
          <Bar l="En euros, lo que se ingresa" v={3.1} max={10} txt="+3,1%" col="var(--al)" goal={6} />
          <Bar l="A tipo de cambio constante" v={7.0} max={10} txt="≈+7,0%" col="var(--ok)" goal={6} />
        </div>
        <p className="small">Línea roja: el objetivo, «más de un 6%». Fuente: Investment Story de MAPFRE (junio de 2026).</p>
        <div className="box al" style={{ marginTop: 18 }}>
          <h3>Dicho en voz alta, ausente del texto</h3>
          <p>Huertas calificó la medición a tipo de cambio constante como <b>«situación no prevista en el origen del plan»</b> <Play t="02:11:14" />. El texto de su discurso publicado por MAPFRE no incluye esa frase; solo dice que se «añade la aclaración».</p>
        </div>
      </div>
    </div>
  );
}

function Verificacion() {
  const CT: string[] = D.CT;
  const L: Record<string, string> = { ok: "Verificada", mat: "Correcta con matiz", sv: "Sin verificar" };
  const [i, setI] = useState(0);
  const [f, setF] = useState("all");
  const c = C[i];
  return (
    <>
      <p className="small">Cada sello es una afirmación verificable de la junta. Pulsa uno para ver qué se dijo, en qué minuto, qué dice el documento oficial y de dónde sale.</p>
      <div className="legend">
        {[["all", "Todas", ""], ["ok", `Verificada (${OK})`, "var(--ok)"], ["mat", `Correcta con matiz (${MT})`, "var(--mat)"], ["sv", `Sin verificar (${SV})`, "var(--sv)"]].map(([k, l, col]) => (
          <button key={k} className="chip" aria-pressed={f === k} onClick={() => setF(k)}>
            {col && <span className="sw" style={{ background: col }} />}{l}
          </button>
        ))}
      </div>
      <div className="ledger">
        {C.map((x, j) => (
          <button key={j} className={`cell ${x[0]}${j === i ? " sel" : ""}${f !== "all" && x[0] !== f ? " dim" : ""}`} aria-label={`${L[x[0]]}: ${x[2]}`} onClick={() => setI(j)}>
            {j + 1}
          </button>
        ))}
      </div>
      <div className="note">
        <div className="m"><St k={c[0]}>{L[c[0]]}</St>{c[1]} · sello {i + 1} · <Play t={CT[i]} /></div>
        <div className="q">{c[2]}</div>
        <div><b>Documento oficial:</b> {c[3]}</div>
        <div className="m">Fuente: {c[4]}</div>
      </div>
      <div className="box ok" style={{ marginTop: 18 }}>
        <h3>Doble puntuación a ciegas: ninguna contradicción</h3>
        <p>Un segundo verificador revisó las mismas 32 frases sin ver los veredictos del primero. <b>Coincidieron en 22. En ningún caso uno dio una frase por buena y el otro por falsa.</b> Las 10 diferencias fueron de alcance: el segundo encontró documentos oficiales que el primero no había abierto.</p>
        <p className="small">Cómo se resolvieron: vale como prueba lo que confirma un documento oficial independiente, como las cuentas auditadas, el informe de gobierno corporativo o el registro de participaciones. Las diapositivas de la propia junta no cuentan como prueba. Una cifra que solo se obtiene sumando o multiplicando datos queda «con matiz».</p>
        <p className="small"><b>Fiabilidad = (verificadas + ½ × con matiz) ÷ cotejadas × 100</b> = ({OK} + ½ × {MT}) ÷ {OK + MT} × 100 = <b>{FIA}</b>. Las {SV} sin verificar no puntúan.</p>
      </div>
    </>
  );
}

function Preguntas() {
  const QL: Record<string, string> = { ok: "Respondida", mat: "A medias", al: "Sin respuesta" };
  return (
    <div className="grid2">
      <div>
        <p>Pidieron la palabra tres accionistas en la sala y ninguno por vía telemática <Play t="01:03:14" />. Uno solo felicitó a la compañía. Los otros dos hicieron 7 preguntas, que el presidente respondió en bloque durante 20 minutos.</p>
        <div className="scroll">
          <table className="stack">
            <thead><tr><th>Estado</th><th>Pregunta</th><th>Qué se respondió</th></tr></thead>
            <tbody>
              {Q.map((q, i) => (
                <tr key={i}>
                  <td data-l="Estado"><St k={q[0]}>{QL[q[0]]}</St></td>
                  <td data-l="Pregunta"><b>{q[1]}</b> <Play t={q[2]} /><br />{q[3]}</td>
                  <td data-l="Qué se respondió">{q[5]} <Play t={q[4]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small"><b>Esquive = preguntas sin respuesta completa ÷ preguntas formuladas</b> = {Q.filter((q) => q[0] !== "ok").length} ÷ {Q.length} = {ESQ}%. Felicitar a la compañía no cuenta como pregunta.</p>
      </div>
      <div className="box al">
        <div className="big al">59 min</div>
        <p>tardó la respuesta a la pregunta sobre empleo. «¿Puede la empresa ajustar plantilla por culpa de la inteligencia artificial?» <Play t="01:08:05" /> quedó fuera del turno de respuestas. La respuesta llegó en el discurso de cierre, sin referirse a la pregunta: <b>«no queremos menos empleados, queremos empleados mejores»</b> <Play t="02:07:31" />.</p>
        <p className="small">La frase no aparece en el texto publicado del discurso. Es una promesa hecha solo en voz alta, y la vigilaremos en el promesómetro de 2027.</p>
      </div>
    </div>
  );
}

function Promesometro() {
  const PL: Record<string, string> = { ok: "Cumplida", mat: "Parcial", al: "Incumplida" };
  return (
    <div className="grid2">
      <div>
        <p>Hemos sacado cada promesa con cifra de la <b>grabación íntegra de la junta de 2025</b> y la hemos comparado con los resultados oficiales.</p>
        <ul className="list">
          {P.map((p, i) => (
            <li key={i}><St k={p[0]}>{PL[p[0]]}</St>{p[1]} <Play t={p[2]} y25 /><div className="small">Resultado oficial: {p[3]}</div></li>
          ))}
        </ul>
        <h3 style={{ marginTop: 22 }}>Aún en curso</h3>
        <ul className="list">
          {(D.CURSO as string[][]).map((p, i) => (
            <li key={i}><St k="cur">En curso</St><Rich s={p[0]} /><div className="small"><Rich s={p[1]} /></div></li>
          ))}
        </ul>
      </div>
      <div>
        <div className="big">{PC("ok")} de {P.length}</div>
        <p className="small">promesas cumplidas. Es un recuento, no una nota: no se pondera nada.</p>
        <div className="bars">
          <Bar l="Cumplidas" v={PC("ok")} max={P.length} txt={PC("ok")} col="var(--ok)" />
          <Bar l="Parciales" v={PC("mat")} max={P.length} txt={PC("mat")} col="var(--mat)" />
          <Bar l="Incumplidas" v={PC("al")} max={P.length} txt={PC("al")} col="var(--al)" />
        </div>
        <h3 style={{ marginTop: 24 }}>Las promesas de esta junta, en directo</h3>
        <p className="small">Los objetivos de 2026 fijados el 13 de marzo, comparados con los últimos resultados publicados.</p>
        <ul className="list">
          {(D.VIVO as string[][]).map((v, i) => (
            <li key={i}><St k={v[0]}>{v[1]}</St>{v[2]} <Play t={v[3]} /><div className="small">{v[4]}</div></li>
          ))}
        </ul>
        <h3 style={{ marginTop: 20 }}>Credibilidad por directivo</h3>
        <p className="small"><b>Antonio Huertas:</b> 5 de 6 promesas de 2025 cumplidas. La parcial es el crecimiento, cuya forma de medirse cambió en 2026. <b>José Luis Jiménez</b> (director financiero) y <b>José Manuel Inchausti</b> (vicepresidente primero) no hicieron en 2025 promesas con cifra propias; se calificarán en 2027.</p>
      </div>
    </div>
  );
}

function Omisiones() {
  return (
    <>
      <p>El detector de omisiones cruza las 2 h 21 min de grabación con lo que la propia empresa publica en sus documentos oficiales.</p>
      <div className="scroll">
        <table className="stack">
          <thead><tr><th>Gravedad</th><th>Qué no se menciona</th><th>Por qué importa</th></tr></thead>
          <tbody>
            {(D.OMI as string[][]).map((o, i) => (
              <tr key={i}>
                <td data-l="Gravedad"><St k={o[0]}>{o[1]}</St></td>
                <td data-l="Qué no se menciona"><b>{o[2]}</b></td>
                <td data-l="Por qué importa"><Rich s={o[3]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small">A su favor: se anunció en directo que el dividendo de participación no se pagaba porque el quórum se quedó en el 84,953%, a un paso del 85% exigido <Play t="01:33:08" />. También se explicaron uno a uno los 4 puntos del Código de Buen Gobierno que no cumple <Play t="00:59:12" />.</p>
    </>
  );
}

function Votaciones() {
  return (
    <div className="grid2">
      <div>
        <p>Se aprobó todo, con un quórum del 84,95% del capital. Los tres puntos con más votos en contra fueron estos:</p>
        <div className="bars">
          {(D.VT as any[]).map((v, i) => (
            <Bar key={i} l={v[0]} v={v[1]} max={6} txt={`${v[1].toFixed(2).replace(".", ",")}%`} col="var(--al)" />
          ))}
        </div>
        <p className="small">Escala de 0% a 6% en contra. Votos en contra sobre las acciones presentes y representadas. Fuente: datos oficiales de asistencia y votación de la junta 2026.</p>
      </div>
      <div className="box">
        <div className="big">≈1 de 4</div>
        <p>votos ajenos a Fundación MAPFRE fue contra la reelección de Antonio Huertas, según nuestra estimación.</p>
        <p className="small">Cálculo propio de RepIndex. La Fundación tiene el 69,7% del capital, según el registro oficial de participaciones significativas. Restándola de las acciones presentes, los 127,5 millones de votos en contra equivalen a cerca del 27% del resto. El cálculo supone que la Fundación votó a favor.</p>
      </div>
    </div>
  );
}

function Senales() {
  return (
    <ul className="list">
      {(D.SIG as string[][]).map((s, i) => (
        <li key={i}><St k={s[0]}>{s[1]}</St><Rich s={s[2]} /></li>
      ))}
    </ul>
  );
}

function RixChart() {
  const W: any[] = D.W;
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 320 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const { w: Wd, h: H } = size;
  const m = { l: 34, r: 12, t: 26, b: 40 };
  const iw = Wd - m.l - m.r, ih = H - m.t - m.b, y0 = 40, y1 = 85;
  const x = (i: number) => m.l + (iw * i) / (W.length - 1);
  const y = (v: number) => m.t + ih * (1 - (v - y0) / (y1 - y0));
  const narrow = Wd < 520;
  const band = "M" + W.map((w, i) => `${x(i)},${y(w[3])}`).join("L") + "L" + W.slice().reverse().map((w, j) => `${x(W.length - 1 - j)},${y(w[2])}`).join("L") + "Z";
  const wx = (x(2) + x(3)) / 2, jx = x(4);
  return (
    <div className="fig" ref={ref}>
      <svg role="img" aria-label="Nota RIX semanal de MAPFRE, de febrero a abril de 2026" viewBox={`0 0 ${Wd} ${H}`}>
        {[40, 50, 60, 70, 80].map((t) => (
          <g key={t}>
            <line x1={m.l} x2={Wd - m.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            {(!narrow || t % 20 === 0) && <text x={m.l - 6} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--soft)">{t}</text>}
          </g>
        ))}
        <path d={band} fill="var(--sv)" opacity=".45" />
        <line x1={wx} x2={wx} y1={m.t} y2={H - m.b} stroke="var(--soft)" strokeWidth="1.5" strokeDasharray="2 4" />
        <text x={wx - 6} y={m.t + 4} textAnchor="end" fontSize="12" fill="var(--soft)">Guerra · 28 feb</text>
        <line x1={jx} x2={jx} y1={m.t - 8} y2={H - m.b} stroke="var(--al)" strokeWidth="2" strokeDasharray="4 4" />
        <text x={jx + 6} y={m.t + 4} fontSize="12.5" fontWeight="700" fill="var(--al)">Junta · 13 mar</text>
        <polyline fill="none" stroke="var(--ink)" strokeWidth="3" points={W.map((w, i) => `${x(i)},${y(w[1])}`).join(" ")} />
        {W.map((w, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(w[1])} r="4.5" fill="var(--bg)" stroke="var(--ink)" strokeWidth="2.5" />
            {(!narrow || i % 2 === 0) && <text x={x(i)} y={H - m.b + 20} textAnchor="middle" fontSize="12" fill="var(--soft)">{w[0]}</text>}
            {!narrow && <text x={x(i)} y={y(w[1]) - 10} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--ink)">{w[1].toFixed(1).replace(".", ",")}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}

function JuntaIAs() {
  const W: any[] = D.W;
  return (
    <>
      <p>Así ven a MAPFRE las seis IAs que RepIndex mide cada semana (ChatGPT, Perplexity, Gemini, Grok, DeepSeek y Qwen). La línea es la nota RIX media. La franja va de la IA más dura a la más benévola.</p>
      <RixChart />
      <div className="grid2" style={{ marginTop: 20 }}>
        <div>
          <h3>Solo la mitad de las IAs se enteró de la junta</h3>
          <p>La semana de la junta, la mencionaron ChatGPT, Grok y Perplexity; Gemini, DeepSeek y Qwen no. Dos semanas después, ya no la mencionaba ninguna.</p>
          <div className="bars">
            {W.map((w, i) => <Bar key={i} l={`Semana del ${w[0]}`} v={w[4]} max={6} txt={`${w[4]} de 6`} col="var(--ink)" />)}
          </div>
        </div>
        <div>
          <h3>La promesa sobre empleo no llegó a ninguna IA</h3>
          <p>El compromiso de no usar la IA para reducir plantilla se dijo dos veces en la junta. Aparece en <b>0 de 12</b> respuestas de las IAs esa semana y la siguiente.</p>
          <p className="small">La media de cuatro semanas pasa de 65,7 antes de la junta a 62,8 después. Pero la caída empieza la semana del 1 de marzo, tras el inicio del conflicto en Oriente Medio el 28 de febrero, que el propio Huertas citó. No atribuimos el descenso a la junta. Las menciones se han contado buscando términos en las respuestas originales de cada IA.</p>
        </div>
      </div>
    </>
  );
}

function Metodo() {
  return (
    <div className="grid2">
      <div>
        <ul className="list">
          <li><b>Fuente de verdad: la grabación íntegra del directo</b> en el canal oficial de MAPFRE. Una junta solo entra en los especiales si pasa la prueba de integridad: es el directo guardado, dura lo mismo que la emisión y contiene el turno de preguntas. Si una empresa solo publica los discursos, no se analiza, y lo contamos.</li>
          <li><b>Transcripción automática y minutos.</b> La transcripción comete errores con nombres y cifras. Si un número puede ser un error de la máquina, no se atribuye a quien habla. Cada momento enlaza al segundo exacto de la grabación oficial.</li>
          <li><b>Frases.</b> El acta recoge cada intervención en estilo indirecto fiel. Las citas literales se limitan a lo imprescindible y siempre llevan el enlace para oírlas completas.</li>
          <li><b>Verificación solo con documentos oficiales</b> de MAPFRE y de la CNMV, a doble ciego. La prensa no verifica nada.</li>
          <li><b>Fiabilidad = (verificadas + ½ × con matiz) ÷ cotejadas × 100.</b> Lo «sin verificar» no puntúa. Una nota nunca se presenta como recuento, ni al revés.</li>
          <li><b>Esquive = preguntas sin respuesta completa ÷ preguntas formuladas.</b> Felicitar a la compañía no cuenta como pregunta.</li>
          <li><b>Privacidad.</b> Los accionistas que intervienen no se nombran ni se investigan.</li>
        </ul>
        <h3 style={{ marginTop: 22 }}>La batería de agentes</h3>
        <ul className="list small">
          {(D.AGENTS as string[][]).map((a, i) => <li key={i}><St k={a[0]}>{a[1]}</St>{a[2]}</li>)}
        </ul>
      </div>
      <div>
        <h3>Documentos utilizados</h3>
        <ul className="list small">
          {(D.SRC as string[][]).map((r, i) => (
            <li key={i}><a href={r[1]} target="_blank" rel="noopener noreferrer">{r[0]}</a></li>
          ))}
          <li><Link to={`${BASE}/junta-e-ias`}>RepIndex · barrido semanal de las 6 IAs (base propia)</Link></li>
        </ul>
      </div>
    </div>
  );
}

const CONTENT: Record<string, ComponentType> = {
  "quien-hablo": QuienHablo,
  acta: Acta,
  "cambio-de-vara": Vara,
  verificacion: Verificacion,
  preguntas: Preguntas,
  promesometro: Promesometro,
  omisiones: Omisiones,
  votaciones: Votaciones,
  "senales-debiles": Senales,
  "junta-e-ias": JuntaIAs,
  metodo: Metodo,
};

// ============================================================================
// Piezas comunes
// ============================================================================
function Mast() {
  return (
    <div className="mast">
      <span>Viernes, 13 de marzo de 2026 · Palacio Municipal de Congresos, Madrid</span>
      <span>Un análisis del equipo de RepIndex.ai · <Link to="/especiales" style={{ color: "var(--ok)" }}>Especiales</Link> · Juntas de accionistas 2026</span>
    </div>
  );
}

function SecNav({ active }: { active?: string }) {
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = navRef.current?.querySelector("a.on") as HTMLElement | null;
    const nav = navRef.current;
    if (el && nav) nav.scrollLeft = el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2;
  }, [active]);
  return (
    <nav className="nav" aria-label="Secciones del especial" ref={navRef}>
      <Link to={BASE} className={!active ? "on" : ""}>Portada</Link>
      {SECCIONES.map((s, i) => (
        <Link key={s.slug} to={`${BASE}/${s.slug}`} className={active === s.slug ? "on" : ""} aria-current={active === s.slug ? "page" : undefined}>
          {i + 1}. {s.nav}
        </Link>
      ))}
    </nav>
  );
}

const AVISO = (
  <p className="aviso">
    Producto elaborado con inteligencia artificial y supervisión editorial. Cada afirmación lleva el minuto exacto de la grabación oficial: pulsa ▶ para oírla en su contexto. <Link to={`${BASE}/metodo`}>Cómo se ha hecho y cómo se evita el sesgo</Link>.
  </p>
);

function Footer() {
  return (
    <footer className="band small">
      <div className="wrap">
        RepIndex.ai · Especiales · Juntas de accionistas 2026. Producto elaborado con inteligencia artificial y supervisión editorial. Fuente de verdad: grabación íntegra del directo de la junta en el canal oficial de MAPFRE. Datos a 21 de noviembre de 2026.
      </div>
    </footer>
  );
}

function Fonts() {
  return (
    <Helmet>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=swap"
      />
    </Helmet>
  );
}

// ============================================================================
// Portada
// ============================================================================
function Portada() {
  const fig = (slug: string, k: string, n: ReactNode, cls: string, tag: string, t: string) => (
    <Link className="fig4" to={`${BASE}/${slug}`}>
      <span className="k">{k}</span>
      <span className={`n ${cls}`}>{n}</span>
      <span className="tag">{tag}</span>
      <span className="t">{t}</span>
    </Link>
  );
  return (
    <>
      <Helmet>
        <title>La Junta de MAPFRE, examinada minuto a minuto · Especiales · RepIndex.ai</title>
        <meta name="description" content="La Junta General de MAPFRE 2026, analizada desde la grabación íntegra: acta completa de 138 momentos, 32 cifras verificadas con documentos oficiales, promesómetro, preguntas y votaciones." />
      </Helmet>
      <Mast />
      <header className="band" style={{ borderTop: 0 }}>
        <div className="wrap">
          <div className="kicker">MAPFRE · Junta General Ordinaria de Accionistas</div>
          <h1>La Junta de MAPFRE, examinada minuto a minuto</h1>
          <p className="deck">MAPFRE cumplió lo que prometió, salvo el crecimiento. En la junta cambió la forma de medirlo, y el presidente admitió en voz alta que esa forma de medir no estaba prevista al lanzar el plan. Las cifras que se dijeron cuadran con las cuentas oficiales. En el turno de preguntas, 3 de 7 respuestas se quedaron a medias.</p>
          <div className="truth">
            <span>Grabación íntegra del directo: 2 h 21 min</span>
            <span>Duración idéntica a la del directo</span>
            <span>Turno de preguntas incluido</span>
            <span>Verificado solo con documentos oficiales y a doble ciego</span>
          </div>
          <div className="figs">
            {fig("verificacion", "Fiabilidad del relato", <>{FIA}<small> /100</small></>, "ok", "Nota de 0 a 100", `${OK + MT} afirmaciones cotejadas; ${SV} no se pudieron verificar y no puntúan`)}
            {fig("promesometro", "Promesas de 2025 cumplidas", <>{PC("ok")}<small> de {P.length}</small></>, "", "Recuento", "La parcial es el crecimiento: solo se cumple a tipo de cambio constante")}
            {fig("cambio-de-vara", "Brecha entre relato y cifras", "Media", "mat", "Veredicto", "Cifras exactas, pero el objetivo de crecimiento cambió de vara de medir")}
            {fig("preguntas", "Esquive en las preguntas", <>{ESQ}<small>%</small></>, "al", "Recuento", "3 de 7 respondidas a medias; ninguna sin respuesta")}
          </div>
          {AVISO}
        </div>
      </header>
      <SecNav />
      <section className="band">
        <div className="wrap">
          <h2>El especial, sección a sección</h2>
          <p className="small">Once secciones. Cada una se abre por separado y todas llevan al minuto exacto de la grabación.</p>
          <ol className="toc">
            {SECCIONES.map((s, i) => (
              <li key={s.slug}>
                <Link to={`${BASE}/${s.slug}`}>
                  <span className="no">{String(i + 1).padStart(2, "0")} · {s.nav.toUpperCase()}</span>
                  <h3>{s.title}</h3>
                  <p>{s.golpe}</p>
                  <span className="go">Abrir sección →</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <Footer />
    </>
  );
}

// ============================================================================
// Página de sección
// ============================================================================
function Seccion({ slug }: { slug: string }) {
  const i = SECCIONES.findIndex((s) => s.slug === slug);
  const s = SECCIONES[i];
  const Body = CONTENT[slug];
  const prev = SECCIONES[i - 1];
  const next = SECCIONES[i + 1];
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug]);
  return (
    <>
      <Helmet>
        <title>{`${s.nav} · La Junta de MAPFRE 2026 · Especiales · RepIndex.ai`}</title>
        <meta name="description" content={s.golpe} />
      </Helmet>
      <Mast />
      <div className="band" style={{ borderTop: 0, paddingBottom: 18 }}>
        <div className="wrap">
          <div className="crumb"><Link to="/especiales">Especiales</Link> · <Link to={BASE}>La Junta de MAPFRE, examinada minuto a minuto</Link></div>
          <div className="kicker" style={{ marginTop: 10 }}>Sección {i + 1} de {SECCIONES.length} · {s.nav}</div>
        </div>
      </div>
      <SecNav active={slug} />
      <section className="band" style={{ borderTop: 0 }}>
        <div className="wrap">
          <h2 style={{ fontSize: "clamp(28px,4vw,44px)" }}>{s.title}</h2>
          <Body />
        </div>
      </section>
      <section className="band" style={{ paddingTop: 0, borderTop: 0 }}>
        <div className="wrap">
          {AVISO}
          <div className="pager">
            {prev ? <Link to={`${BASE}/${prev.slug}`}><span className="k">← Anterior</span>{prev.nav}</Link> : <Link to={BASE}><span className="k">← Volver</span>Portada</Link>}
            {next ? <Link to={`${BASE}/${next.slug}`} style={{ textAlign: "right" }}><span className="k">Siguiente →</span>{next.nav}</Link> : <Link to={BASE} style={{ textAlign: "right" }}><span className="k">Fin →</span>Portada</Link>}
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}

export default function EspecialJuntaMapfre2026() {
  const { seccion } = useParams();
  if (seccion && !CONTENT[seccion]) return <Navigate to={BASE} replace />;
  return (
    <Layout>
      <Fonts />
      <div className="jwsj">{seccion ? <Seccion slug={seccion} /> : <Portada />}</div>
    </Layout>
  );
}
