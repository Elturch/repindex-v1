export type PartidoHistorico = { k: string; nombre: string; sig?: string; votos?: number; pct?: number; escanos?: number };
export type ResultadoHistorico = { nombre?: string; censo?: number; votantes?: number; participacion?: number; escanos?: number; partidos: PartidoHistorico[]; ganador?: string; escrutado?: number };
export type EleccionHistorica = { id: string; fecha?: string; nacional: ResultadoHistorico; provincias: Record<string, ResultadoHistorico> };
export type FaroHistorico = { id: string; n: string; censo: number; hist: Record<string, { PP?: number; PSOE?: number }> };
export type Historico = { elecciones: EleccionHistorica[]; colores: Record<string, string>; faros: FaroHistorico[]; fuente?: string };
export const ETIQUETAS: Record<string, string> = { '2011': '2011', '2015': '2015', '2016': '2016', '2019a': 'Abr. 2019', '2019n': 'Nov. 2019', '2023': '2023' };
export const FARO_ANOS: Record<string, string> = { '2011': '11', '2015': '15', '2016': '16', '2019a': '19a', '2019n': '19n', '2023': '23' };
export const FUENTE_HISTORICA = 'Fuente: Ministerio del Interior, resultados oficiales. Votos y escaños incluyen el voto desde el extranjero.';
export const familia2023 = (k: string) => k === 'FA' ? 'SUMAR' : k;
export const formatoHistorico = (n?: number | null, dec = 1) => n == null ? '—' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: dec, useGrouping: true }).format(n).replace(/\b(\d)(\d{3})\b/g, '$1.$2');
let cache: Promise<Historico | null> | null = null;
export const loadHistorico = () => cache ??= fetch('/especiales/elecciones/historico.json').then(r => r.ok ? r.json() : null).catch(() => null);
export const resultado2023 = (h?: Historico | null, p?: string) => { const e = h?.elecciones.find(e => e.id === '2023'); return p ? e?.provincias[p] : e?.nacional; };
export const nombreGanador = (r?: ResultadoHistorico) => r?.partidos.find(p => p.k === r.ganador)?.nombre;
export function proyeccionHistorica(panel: any, p?: string): ResultadoHistorico | null {
  if (!panel || panel.vacio) return null;
  if (!p) return { escanos: 350, escrutado: panel.escrutado, participacion: panel.participacion, partidos: (panel.partidos ?? []).map((v: any) => ({ k: familia2023(v.k), nombre: v.nombre, escanos: v.p50, pct: v.cuota })) };
  const d = panel.provincias?.find((v: any) => String(v.p) === p);
  if (!d?.proy) return null;
  const votos = panel.votosProv?.[p];
  const entradas: [string, number][] = votos ? (Array.isArray(votos) ? votos.map((v: any) => [v.k, v.votos ?? v.v]) : Object.entries(votos)) : [];
  const ganador = entradas.filter(([k, n]) => k !== 'BL' && k !== 'OTROS' && n > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
  const proy: [string, number][] = Array.isArray(d.proy) ? d.proy.map((v: any) => [v.k, v.escanos ?? v.n ?? v.v]) : Object.entries(d.proy);
  return { nombre: d.nombre, escanos: d.escanos, participacion: d.participacion, escrutado: d.escrutado, ganador: ganador ? familia2023(ganador) : undefined, partidos: proy.map(([k, n]) => { const partido = panel.partidos?.find((v: any) => v.k === k); return { k: familia2023(k), nombre: partido?.nombre ?? k, escanos: n }; }) };
}
export const familiasLinea = ['PP', 'PSOE', 'VOX', 'CS', 'UP_SUMAR', 'ERC', 'JUNTS', 'PNV', 'BILDU'];
export function cuotasFamilias(r: ResultadoHistorico) {
  return Object.fromEntries(familiasLinea.map(k => { const ps = r.partidos.filter(p => k === 'UP_SUMAR' ? ['UP', 'SUMAR'].includes(p.k) : p.k === k); return [k, ps.some(p => p.pct != null) ? ps.reduce((s, p) => s + (p.pct ?? 0), 0) : undefined]; }));
}