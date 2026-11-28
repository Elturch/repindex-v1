/* Primeros resultados oficiales: domingo 29-11-2026 21:00 en Madrid (CET, UTC+1) = 20:00 UTC,
   al cerrar los colegios en Canarias. En la Península cierran a las 20:00 (19:00 UTC). */
export const CIERRE_UTC = Date.UTC(2026, 10, 29, 20, 0, 0);
export const CIERRE_PENINSULA_UTC = Date.UTC(2026, 10, 29, 19, 0, 0);
const dos = (n: number) => String(n).padStart(2, "0");
/** Texto de la cuenta atrás hasta los primeros resultados, o null si ya han llegado las 21:00. */
export function cuentaAtras(ahora: number, cierre = CIERRE_UTC) {
  const ms = cierre - ahora;
  if (ms <= 0) return null;
  const t = Math.floor(ms / 1000);
  return `Faltan ${Math.floor(t / 86400)} d ${dos(Math.floor(t % 86400 / 3600))} h ${dos(Math.floor(t % 3600 / 60))} min ${dos(t % 60)} s`;
}
/** Entre las 20:00 y las 21:00 de Madrid: colegios peninsulares ya cerrados, sin resultados aún. */
export const peninsulaCerrada = (ahora: number) => ahora >= CIERRE_PENINSULA_UTC && ahora < CIERRE_UTC;
