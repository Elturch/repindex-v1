import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MapaEspana } from './MapaEspana';
import { cuotasFamilias, ETIQUETAS, FARO_ANOS, familiasLinea, formatoHistorico as fmt, FUENTE_HISTORICA, nombreGanador, proyeccionHistorica, type Historico, type PartidoHistorico, type ResultadoHistorico } from './historicoElectoral';

type Fila = { id: string; label: string; resultado: ResultadoHistorico; directo?: boolean; vacio?: boolean };
const fuente = <p className="text-xs mt-8" style={{ color: 'var(--muted)' }}>{FUENTE_HISTORICA}</p>;

export function ChipsHistoricos({ resultado, historico }: { resultado?: ResultadoHistorico; historico: Historico | null }) {
  if (!resultado || !historico) return null;
  return <span className="inline-flex flex-wrap gap-1">{resultado.partidos.filter(p => (p.escanos ?? 0) > 0).map(p => <span key={p.k} className="inline-block px-1.5 py-0.5 text-xs whitespace-nowrap" style={{ borderLeft: `4px solid ${historico.colores[p.k] ?? 'var(--muted)'}`, background: 'var(--card)' }}>{p.nombre} {p.escanos}</span>)}</span>;
}

export function FaroHistorial({ id, historico }: { id: string; historico: Historico | null }) {
  const f = historico?.faros.find(f => f.id === id);
  if (!f || !historico) return null;
  return <div className="overflow-x-auto mt-3"><table className="w-full text-left" aria-label={`Histórico de ${f.n}`} style={{ fontSize: 10 }}><thead><tr><th>Año</th><th>PP</th><th>PSOE</th></tr></thead><tbody>{historico.elecciones.map(e => { const h = f.hist[FARO_ANOS[e.id]]; if (!h) return null; return <tr key={e.id} style={{ borderTop: '1px solid var(--hair)' }}><td style={{ paddingRight: 4 }}>{ETIQUETAS[e.id]}</td>{(['PP', 'PSOE'] as const).map(k => <td key={k} style={{ paddingRight: 4 }}>{h[k] != null && <span className="block">{fmt(h[k])} %</span>}<span className="block" style={{ color: 'var(--muted)' }}>{e.nacional.partidos.find(p => p.k === k)?.pct != null && <>España {fmt(e.nacional.partidos.find(p => p.k === k)?.pct)} %</>}</span></td>)}</tr>; })}</tbody></table></div>;
}

function BarrasCongreso({ filas, historico, nacional, onPartido }: { filas: Fila[]; historico: Historico; nacional?: boolean; onPartido: (k: string) => void }) {
  const max = nacional ? 350 : Math.max(1, ...filas.map(f => f.resultado.escanos ?? f.resultado.partidos.reduce((s, p) => s + (p.escanos ?? 0), 0)));
  return <div className="space-y-4 mt-5" aria-label={nacional ? 'Congreso por elección' : 'Escaños de la provincia por elección'}>
    {nacional && <div className="grid grid-cols-[105px_minmax(0,1fr)] gap-3"><span /><div className="relative h-5"><span className="absolute text-[10px] whitespace-nowrap" style={{ left: `${176 / 350 * 100}%`, transform: 'translateX(-50%)', color: 'var(--muted)' }}>176 · mayoría absoluta</span></div></div>}
    {filas.map(f => <div key={f.id} className={`grid grid-cols-[105px_minmax(0,1fr)] gap-3 items-center ${f.directo ? 'py-3' : ''}`} style={f.directo ? { borderTop: '2px solid var(--ink)', borderBottom: '1px solid var(--line)' } : undefined}>
      <div className="text-sm font-semibold">{f.label}{f.resultado.escrutado != null && <span className="block text-xs font-normal" style={{ color: 'var(--muted)' }}>{fmt(f.resultado.escrutado)} % escrutado</span>}</div>
      <div className="relative flex h-10" style={f.vacio ? { background: 'transparent', border: '1px solid var(--ink)' } : { background: 'var(--hair)' }}>
        {f.resultado.partidos.filter(p => (p.escanos ?? 0) > 0).map(p => <Button key={p.k} variant="ghost" className="h-full rounded-none p-0 min-w-0 overflow-hidden hover:opacity-80" style={{ width: `${(p.escanos ?? 0) / max * 100}%`, background: historico.colores[p.k] ?? 'var(--muted)', color: 'var(--paper)', fontFamily: 'var(--sans)', textShadow: '0 1px 2px var(--ink)' }} title={`${p.nombre}: ${p.escanos} escaños${p.pct != null ? ` · ${fmt(p.pct)} %` : ''}`} aria-label={`${f.label}, ${p.nombre}: ${p.escanos} escaños`} onClick={() => onPartido(p.k)}>{(p.escanos ?? 0) / max >= .085 ? p.escanos : ''}</Button>)}
        {nacional && <span className="absolute inset-y-[-4px] pointer-events-none" style={{ left: `${176 / 350 * 100}%`, borderLeft: '2px solid var(--ink)' }} />}
      </div>
    </div>)}
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">{Array.from(new Set(filas.flatMap(f => f.resultado.partidos.filter(p => (p.escanos ?? 0) > 0).map(p => p.k)))).map(k => { const p = [...filas].reverse().flatMap(f => f.resultado.partidos).find(p => p.k === k); return <Button key={k} variant="ghost" className="h-auto rounded-none p-0 text-xs gap-1" onClick={() => onPartido(k)}><i className="inline-block w-2.5 h-2.5" style={{ background: historico.colores[k] ?? 'var(--muted)' }} />{p?.nombre}</Button>; })}</div>
  </div>;
}

function Graficos({ filas, historico }: { filas: Fila[]; historico: Historico }) {
  const datos = filas.map(f => ({ label: f.directo ? '29-N' : f.label, ...cuotasFamilias(f.resultado), participacion: f.resultado.participacion }));
  const names = Object.fromEntries(familiasLinea.map(k => [k, k === 'UP_SUMAR' ? 'Podemos / Sumar' : [...filas].reverse().flatMap(f => f.resultado.partidos).find(p => p.k === k)?.nombre ?? k]));
  return <>
    <div className="pt-9"><h3>El voto, elección a elección</h3></div>
    <div className="h-[360px] w-full min-w-0" aria-label="Porcentaje de voto por familia"><ResponsiveContainer><LineChart data={datos} margin={{ top: 12, left: -20, right: 12, bottom: 12 }}><CartesianGrid stroke="var(--hair)" strokeDasharray="2 4" /><XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} /><YAxis unit=" %" tick={{ fontSize: 11 }} /><Tooltip contentStyle={{ background: 'var(--card)', borderColor: 'var(--line)' }} formatter={(v: number, n: string) => [`${fmt(v)} %`, n]} /><Legend wrapperStyle={{ fontSize: 12 }} />{familiasLinea.map(k => <Line key={k} dataKey={k} name={names[k]} stroke={historico.colores[k === 'UP_SUMAR' ? 'UP' : k] ?? 'var(--muted)'} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />)}</LineChart></ResponsiveContainer></div>
    <div className="pt-8"><h3>Participación</h3></div>
    <div className="h-56 w-full min-w-0" aria-label="Participación por elección"><ResponsiveContainer><LineChart data={datos} margin={{ top: 12, left: -20, right: 12, bottom: 12 }}><CartesianGrid stroke="var(--hair)" strokeDasharray="2 4" /><XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} /><YAxis unit=" %" domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip contentStyle={{ background: 'var(--card)', borderColor: 'var(--line)' }} formatter={(v: number) => [`${fmt(v)} %`, 'Participación']} /><Line dataKey="participacion" name="Participación" stroke="var(--ink)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
  </>;
}

function Detalle({ filas, historico, partido, onCerrar, modo = 'tabla' }: { filas: Fila[]; historico: Historico; partido: string | null; onCerrar: () => void; modo?: 'ficha' | 'tabla' }) {
  const keys = Array.from(new Set(filas.flatMap(f => f.resultado.partidos.map(p => p.k))));
  return <>
    {modo === 'ficha' && partido && <aside className="mt-7 py-4" style={{ borderTop: `3px solid ${historico.colores[partido] ?? 'var(--ink)'}`, background: 'var(--card)' }} aria-live="polite"><div className="flex justify-between gap-3"><h3>{[...filas].reverse().flatMap(f => f.resultado.partidos).find(p => p.k === partido)?.nombre}</h3><Button variant="ghost" aria-label="Cerrar ficha del partido" onClick={onCerrar}>×</Button></div><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Elección</th><th>Nombre</th><th>Escaños</th><th>Voto</th></tr></thead><tbody>{filas.map(f => { const p = f.resultado.partidos.find(p => p.k === partido); return <tr key={f.id} style={{ borderTop: '1px solid var(--hair)' }}><td className="py-2">{f.label}</td><td>{p?.nombre ?? '—'}</td><td>{fmt(p?.escanos, 0)}</td><td>{p?.pct != null ? `${fmt(p.pct)} %` : '—'}</td></tr>; })}</tbody></table></div></aside>}
    {modo === 'tabla' && <><h3 className="mt-8">Resultados en detalle</h3><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="py-2">Elección</th>{keys.map(k => <th key={k} className="min-w-[105px]" style={{ borderTop: `3px solid ${historico.colores[k] ?? 'var(--muted)'}` }}>{[...filas].reverse().flatMap(f => f.resultado.partidos).find(p => p.k === k)?.nombre}</th>)}</tr></thead><tbody>{filas.map(f => <tr key={f.id} style={{ borderTop: '1px solid var(--line)' }}><th className="py-3 whitespace-nowrap">{f.label}</th>{keys.map(k => { const p = f.resultado.partidos.find(p => p.k === k); return <td key={k} className="py-2">{p ? <><span className="block text-xs" style={{ color: 'var(--muted)' }}>{p.nombre}</span>{p.escanos != null && <b>{p.escanos} esc.</b>}{p.pct != null && <span className="block">{fmt(p.pct)} %</span>}</> : '—'}</td>; })}</tr>)}</tbody></table></div></>}
  </>;
}

export function HistoricoElectoral({ historico, panel, vista, provincia, onProvincia }: { historico: Historico | null; panel: any; vista: string; provincia: string; onProvincia: (p: string) => void }) {
  const [eleccion, setEleccion] = useState('2023');
  const [busqueda, setBusqueda] = useState('');
  const [partido, setPartido] = useState<string | null>(null);
  const directo = !!panel && !panel.vacio && (panel.partidos?.length ?? 0) > 0;
  const etiqueta = '29-N · proyección';
  const provs = useMemo(() => Object.entries(historico?.elecciones.find(e => e.id === '2023')?.provincias ?? {}).sort((a, b) => (a[1].nombre ?? '').localeCompare(b[1].nombre ?? '', 'es')), [historico]);
  if (!historico) return <p className="py-8" style={{ color: 'var(--muted)' }}>Cargando los resultados oficiales…</p>;
  const provincial = vista === 'provincia-historia';
  const filas: Fila[] = historico.elecciones.flatMap(e => { const r = provincial ? e.provincias[provincia] : e.nacional; return r ? [{ id: e.id, label: ETIQUETAS[e.id], resultado: r }] : []; });
  const live = directo ? proyeccionHistorica(panel, provincial ? provincia : undefined) : null;
  const todas: Fila[] = live ? [...filas, { id: '29n', label: etiqueta, resultado: live, directo: true }] : filas;
  const seleccionada = historico.elecciones.find(e => e.id === eleccion) ?? historico.elecciones[historico.elecciones.length - 1];
  const liveProvs: Record<string, ResultadoHistorico> = directo ? Object.fromEntries((panel.provincias ?? []).flatMap((p: any) => { const r = proyeccionHistorica(panel, String(p.p)); return r ? [[String(p.p), r]] : []; })) : {};
  const mapaEleccion = eleccion === '29n' && directo ? { provincias: liveProvs } : seleccionada;
  const ultimo = historico.elecciones.find(e => e.id === '2023')?.provincias[provincia];
  const primero = historico.elecciones.find(e => e.id === '2011')?.provincias[provincia];
  return <section className="elec-section py-5" id={vista}>
    <div className="elec-kicker">Histórico · resultados oficiales</div>
    <h2 className="mt-2">{vista === 'historia' ? 'Seis elecciones' : vista === 'mapa-historico' ? 'Mapa histórico' : 'Provincia a provincia'}</h2>
    {vista === 'mapa-historico' ? <>
      <label className="block mt-5 mb-5 text-sm">Elección<select aria-label="Elección del mapa histórico" value={eleccion === '29n' && !directo ? '2023' : eleccion} onChange={e => setEleccion(e.target.value)} className="block mt-1 p-2 max-w-full" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>{historico.elecciones.map(e => <option key={e.id} value={e.id}>{ETIQUETAS[e.id]}</option>)}{directo && <option value="29n">29-N</option>}</select></label>
      <MapaEspana panel={null} historico={historico} eleccionHistorica={mapaEleccion} name={k => mapaEleccion ? Object.values(mapaEleccion.provincias).flatMap(p => p.partidos).find(p => p.k === k)?.nombre ?? k : k} color={k => historico.colores[k] ?? 'var(--muted)'} capas={['gana', 'participacion']} onVerHistoria={onProvincia} />
    </> : <>
      {provincial ? <>
        <div className="grid gap-3 sm:grid-cols-2 mt-5 mb-6"><label className="text-sm">Buscar provincia<Input aria-label="Buscar provincia" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre de la provincia" className="rounded-none mt-1" style={{ background: 'var(--card)', borderColor: 'var(--line)' }} /></label><label className="text-sm">Provincia<select aria-label="Provincia del histórico" value={provincia} onChange={e => { setPartido(null); onProvincia(e.target.value); }} className="block w-full p-2 mt-1" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>{provs.filter(([p, r]) => p === provincia || r.nombre?.toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es'))).map(([p, r]) => <option key={p} value={p}>{r.nombre}</option>)}</select></label></div>
        {ultimo && <p className="text-2xl mb-6" style={{ fontFamily: 'var(--head)' }}>{ultimo.nombre} reparte {ultimo.escanos} escaños.{nombreGanador(ultimo) && <> En 2023 ganó {nombreGanador(ultimo)};</>}{nombreGanador(primero) && <> en 2011, {nombreGanador(primero)}.</>}</p>}
      </> : <p className="lede mt-3">Seis Congresos de 350 escaños: el reparto, el voto y la participación.</p>}
      <BarrasCongreso filas={live ? [todas[todas.length - 1], ...filas] : [{ id: '29n', label: '29-N · sin datos aún', resultado: { partidos: [] } as unknown as ResultadoHistorico, directo: true, vacio: true }, ...filas]} historico={historico} nacional={!provincial} onPartido={setPartido} />
      <Detalle filas={todas} historico={historico} partido={partido} onCerrar={() => setPartido(null)} modo="ficha" />
      <Graficos filas={todas} historico={historico} />
      <Detalle filas={todas} historico={historico} partido={partido} onCerrar={() => setPartido(null)} />
    </>}
    {fuente}
  </section>;
}