import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cuotasFamilias, ETIQUETAS, familia2023, formatoHistorico, proyeccionHistorica } from './historicoElectoral';

describe('Comparación electoral histórica', () => {
  it('incluye las seis elecciones oficiales, 52 provincias y 350 escaños por Congreso', () => {
    const h = JSON.parse(readFileSync('public/especiales/elecciones/historico.json', 'utf8'));
    expect(h.elecciones.map((e: any) => e.id)).toEqual(['2011', '2015', '2016', '2019a', '2019n', '2023']);
    for (const e of h.elecciones) {
      expect(Object.keys(e.provincias)).toHaveLength(52);
      expect(e.nacional.partidos.reduce((s: number, p: any) => s + p.escanos, 0)).toBe(350);
    }
  });
  it('compara FA con SUMAR en 2023 sin cambiar otras familias', () => {
    expect(familia2023('FA')).toBe('SUMAR');
    expect(familia2023('SUMAR')).toBe('SUMAR');
    expect(familia2023('PP')).toBe('PP');
  });
  it('une solo UP y SUMAR en la línea Podemos / Sumar', () => {
    expect(cuotasFamilias({ partidos: [{ k: 'UP', nombre: 'Unidas Podemos', pct: 12 }, { k: 'SUMAR', nombre: 'Sumar', pct: 8 }, { k: 'IU', nombre: 'IU', pct: 6 }] }).UP_SUMAR).toBe(20);
  });
  it('no añade el 29-N cuando el panel está vacío', () => {
    expect(proyeccionHistorica({ vacio: true, partidos: [{ k: 'PP', p50: 130 }] })).toBeNull();
    expect(proyeccionHistorica(null)).toBeNull();
  });
  it('muestra el p50 y la cuota recibidos sin inferir participación', () => {
    const r = proyeccionHistorica({ partidos: [{ k: 'FA', nombre: 'Frente Amplio', p50: 31, cuota: 12 }] });
    expect(r?.partidos).toEqual([{ k: 'SUMAR', nombre: 'Frente Amplio', escanos: 31, pct: 12 }]);
    expect(r?.participacion).toBeUndefined();
  });
  it('preserva el reparto provincial y no deduce porcentajes del voto', () => {
    const r = proyeccionHistorica({ provincias: [{ p: '28', nombre: 'Madrid', escanos: 37, proy: { PP: 16, FA: 6 }, escrutado: 60 }], partidos: [{ k: 'FA', nombre: 'Frente Amplio' }] }, '28');
    expect(r?.partidos.map(p => [p.k, p.escanos, p.pct])).toEqual([['PP', 16, undefined], ['SUMAR', 6, undefined]]);
    expect(r?.escrutado).toBe(60);
    expect(r?.participacion).toBeUndefined();
  });
  it('distingue abril y noviembre de 2019', () => {
    expect(ETIQUETAS['2019a']).toBe('Abr. 2019');
    expect(ETIQUETAS['2019n']).toBe('Nov. 2019');
  });
  it('separa miles también en cifras de cuatro dígitos', () => {
    expect(formatoHistorico(1317, 0)).toBe('1.317');
  });
});