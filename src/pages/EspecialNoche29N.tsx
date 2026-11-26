import { Fragment, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout/Layout";
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
const pct = (x?: number | null) => (x == null ? "—" : `${Math.round(x * 100)} %`);
const num = (x?: number | null) => (x == null ? "—" : x.toLocaleString("es-ES"));

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

export default function EspecialNoche29N() {
  const [st, setSt] = useState<Any>(null);
  const [err, setErr] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [openProv, setOpenProv] = useState<string | null>(null);
  const [allProv, setAllProv] = useState(false);
  const [focusParty, setFocusParty] = useState<string | null>(null);

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
  const name = (k: string) => byK[k]?.nombre ?? (k === "OTROS" ? "Otros" : k);
  const color = (k: string) => byK[k]?.color ?? C.grey;

  const sortedP = [...partidos].sort((a, b) => (b.p50 ?? 0) - (a.p50 ?? 0));
  const top4 = sortedP.slice(0, 4).map((p) => p.k);
  const maxScale = Math.max(200, ...partidos.map((p) => p.p90 ?? 0), ...partidos.map((p) => p.bruto ?? 0));

  const provs: Any[] = [...(panel?.provincias ?? [])].sort(
    (a, b) => (a.ultimo?.votesNeeded ?? Infinity) - (b.ultimo?.votesNeeded ?? Infinity),
  );
  const provShown = allProv ? provs : provs.slice(0, 15);

  const chartData = historia.map((h) => {
    const row: Any = { hora: h.hora ?? new Date(h.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) };
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
      <div style={{ background: C.paper, color: C.ink, minHeight: "100vh" }}>
        {st?.modo === "simulacro" && (
          <div className="sticky top-16 z-30 text-center text-sm md:text-base font-semibold px-3 py-2" style={{ background: C.red, color: C.paper }}>
            SIMULACRO con los votos reales del 23J y un orden de llegada simulado — no son datos del 29-N
          </div>
        )}
        <div className="max-w-5xl mx-auto px-4 pb-16">
          <header className="pt-8 pb-4 text-center" style={{ borderBottom: `3px double ${C.ink}` }}>
            <div className="text-xs uppercase tracking-[0.3em]" style={{ color: C.muted }}>Especiales RepIndex · En directo</div>
            <h1 className="text-4xl md:text-6xl my-2" style={{ fontFamily: SERIF }}>Noche electoral 29-N</h1>
            <div className="italic" style={{ fontFamily: SERIF, color: C.muted }}>Un análisis del equipo de RepIndex.ai</div>
            <div className="text-xs mt-2" style={{ color: C.muted }}>
              Última actualización: {updated ? updated.toLocaleTimeString("es-ES") : "—"}
              {panel?.ts && <> · dato del panel {new Date(panel.ts).toLocaleTimeString("es-ES")}</>}
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
              <section className="py-8 text-center">
                <button onClick={() => go("rangos")} className="block mx-auto">
                  <div className="text-7xl md:text-9xl font-bold leading-none" style={{ fontFamily: SERIF }}>
                    {(panel.escrutado ?? 0).toLocaleString("es-ES", { maximumFractionDigits: 1 })}<span className="text-4xl md:text-6xl"> %</span>
                  </div>
                  <div className="text-sm uppercase tracking-widest mt-1" style={{ color: C.muted }}>escrutado{hora ? ` · ${hora}` : ""}</div>
                </button>
                <p className="text-2xl md:text-3xl mt-6 max-w-3xl mx-auto" style={{ fontFamily: SERIF }}>{panel.frase}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
                  {primera && (
                    <button onClick={() => { setFocusParty(primera.k); go("rangos"); }} className="p-4 text-left hover:opacity-80" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
                      <div className="text-5xl font-bold" style={{ fontFamily: SERIF, color: color(primera.k) }}>{pct(primera.prob)}</div>
                      <div className="text-sm mt-1">probabilidad de que <b>{name(primera.k)}</b> sea primera fuerza</div>
                    </button>
                  )}
                  {sumas.slice(0, 2).map((s, i) => (
                    <button key={i} onClick={() => go("noche")} className="p-4 text-left hover:opacity-80" style={{ background: C.card, border: `1px solid ${C.rule}` }}>
                      <div className="text-5xl font-bold" style={{ fontFamily: SERIF }}>{pct(s.prob176)}</div>
                      <div className="text-sm mt-1">probabilidad de que <b>{s.nombre}</b> llegue a 176</div>
                      <div className="text-xs mt-1" style={{ color: C.muted }}>horquilla {s.p10}–{s.p90} · central {s.p50}</div>
                    </button>
                  ))}
                </div>
              </section>

              {/* B. RANGOS */}
              <Section id="rangos" kicker="Congreso" title="Escaños: recuento oficial frente a proyección">
                <div className="flex flex-wrap gap-4 text-xs mb-3" style={{ color: C.muted }}>
                  <span className="flex items-center gap-1"><span style={{ display: "inline-block", width: 10, height: 10, border: `2px solid ${C.ink}`, transform: "rotate(45deg)" }} /> Recuento oficial</span>
                  <span className="flex items-center gap-1"><span style={{ display: "inline-block", width: 4, height: 14, background: C.ink }} /> Proyección RepIndex (central)</span>
                  <span className="flex items-center gap-1"><span style={{ display: "inline-block", width: 20, height: 10, background: C.rule }} /> Horquilla p10–p90</span>
                  {focusParty && <button className="underline" onClick={() => setFocusParty(null)}>Quitar filtro ({name(focusParty)})</button>}
                </div>
                <div className="space-y-2">
                  {sortedP.filter((p) => !focusParty || p.k === focusParty).map((p) => {
                    const x = (v: number) => `${Math.min(100, (v / maxScale) * 100)}%`;
                    return (
                      <div key={p.k} className="grid grid-cols-[88px_1fr_56px] md:grid-cols-[140px_1fr_80px] items-center gap-2">
                        <button className="text-left text-sm font-semibold truncate" onClick={() => setFocusParty(focusParty === p.k ? null : p.k)}>{p.nombre}</button>
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

              {/* D. ALAMBRE */}
              <Section id="alambre" kicker="Provincias" title="Escaños en el alambre">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left" style={{ borderBottom: `2px solid ${C.ink}` }}>
                      <th className="py-2">Provincia</th><th>Escrutado</th><th>Último escaño</th><th className="hidden sm:table-cell">Lo persigue</th><th className="text-right">Votos que faltan</th>
                    </tr></thead>
                    <tbody>
                      {provShown.map((p) => (
                        <Fragment key={p.p}>
                          <tr className="cursor-pointer hover:opacity-70" style={{ borderBottom: `1px solid ${C.rule}` }} onClick={() => setOpenProv(openProv === p.p ? null : p.p)}>
                            <td className="py-2 font-semibold">{openProv === p.p ? "▾" : "▸"} {p.nombre}</td>
                            <td>{num(p.escrutado)} %</td>
                            <td style={{ color: p.ultimo ? color(p.ultimo.winner) : undefined }}>{p.ultimo ? name(p.ultimo.winner) : "—"}</td>
                            <td className="hidden sm:table-cell">{p.ultimo ? name(p.ultimo.runnerUp) : "—"}</td>
                            <td className="text-right">{num(p.ultimo?.votesNeeded)}</td>
                          </tr>
                          {openProv === p.p && (
                            <tr><td colSpan={5} className="p-3" style={{ background: C.card }}>
                              <div className="text-xs mb-2" style={{ color: C.muted }}>{p.escanos} escaños{p.ultimo && <> · persigue: {name(p.ultimo.runnerUp)}</>}</div>
                              <table className="text-sm"><thead><tr><th className="text-left pr-6">Partido</th><th className="pr-6">Oficial</th><th>Proyección</th></tr></thead><tbody>
                                {Array.from(new Set([...Object.keys(p.proy ?? {}), ...Object.keys(p.bruto ?? {})])).map((k) => (
                                  <tr key={k}><td className="pr-6" style={{ color: color(k) }}>{name(k)}</td><td className="text-center pr-6">{p.bruto?.[k] ?? 0}</td><td className="text-center">{p.proy?.[k] ?? 0}</td></tr>
                                ))}
                              </tbody></table>
                            </td></tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                {provs.length > 15 && (
                  <button className="mt-3 underline text-sm" onClick={() => setAllProv(!allProv)}>{allProv ? "Ver solo las 15 más ajustadas" : `Ver las ${provs.length}`}</button>
                )}
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
                          <button className="font-semibold underline-offset-2 hover:underline" onClick={() => { setAllProv(true); setOpenProv(c.p); go("alambre"); }}>{c.nombre}</button>
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
                          <div className="text-xs" style={{ color: C.muted }}>{r.quien}{r.minuto_video ? ` · min. ${r.minuto_video}` : ""}{r.ts ? ` · ${new Date(r.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
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
            </>
          )}

          {/* I. MÉTODO */}
          <section id="metodo" className="py-8" style={{ borderTop: `1px solid ${C.rule}` }}>
            <details>
              <summary className="cursor-pointer text-xl" style={{ fontFamily: SERIF }}>Método</summary>
              <div className="mt-3 space-y-2 text-sm leading-relaxed">
                <p><b>Fuente:</b> Ministerio del Interior (resultados provisionales oficiales).</p>
                <p>Cada municipio contado se compara consigo mismo en elecciones anteriores; lo que falta por contar se estima con municipios parecidos (misma provincia y tamaño).</p>
                <p>El sistema aprende durante la noche cuánto cambia un municipio desde que empieza a contar hasta que termina.</p>
                <p>Reparto con la ley D'Hondt y barrera del 3 % por provincia. 600 simulaciones por minuto dan las horquillas (p10–p90).</p>
                <p>Regla de publicación: solo se declara primera fuerza con un 90 % o más; si no, «empate técnico».</p>
                <p>Cada proyección queda guardada con su hora y se publicará al final el acierto a cada hora.</p>
                {panel?.margenOrden != null && <p><b>Margen por orden de llegada:</b> {panel.margenOrden.toLocaleString("es-ES")}</p>}
              </div>
            </details>
          </section>
        </div>
      </div>
    </Layout>
  );
}
