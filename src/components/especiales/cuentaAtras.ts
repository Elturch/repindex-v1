/* Cierre de colegios: domingo 29-11-2026 20:00 en Madrid (CET, UTC+1) = 19:00 UTC. */
export const CIERRE_UTC = Date.UTC(2026, 10, 29, 19, 0, 0);
const dos = (n: number) => String(n).padStart(2, "0");
/** Texto de la cuenta atrás, o null si ya ha pasado el cierre. */
export function cuentaAtras(ahora: number, cierre = CIERRE_UTC) {
  const ms = cierre - ahora;
  if (ms <= 0) return null;
  const t = Math.floor(ms / 1000);
  return `Faltan ${Math.floor(t / 86400)} d ${dos(Math.floor(t % 86400 / 3600))} h ${dos(Math.floor(t % 3600 / 60))} min ${dos(t % 60)} s`;
}
