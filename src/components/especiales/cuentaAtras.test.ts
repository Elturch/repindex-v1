import { describe, expect, it } from "vitest";
import { cuentaAtras, peninsulaCerrada } from "./cuentaAtras";

describe("cuentaAtras", () => {
  it("cuenta hasta las 21:00 de Madrid del domingo 29", () => {
    // Sábado 28, 20:05:50 en Madrid = 19:05:50 UTC
    expect(cuentaAtras(Date.UTC(2026, 10, 28, 19, 5, 50))).toBe("Faltan 1 d 00 h 54 min 10 s");
  });
  it("sigue contando entre las 20:00 y las 21:00", () => {
    const t = Date.UTC(2026, 10, 29, 19, 30, 0);
    expect(cuentaAtras(t)).toBe("Faltan 0 d 00 h 30 min 00 s");
    expect(peninsulaCerrada(t)).toBe(true);
  });
  it("deja de contar a las 21:00 en punto", () => {
    const t = Date.UTC(2026, 10, 29, 20, 0, 0);
    expect(cuentaAtras(t)).toBeNull();
    expect(peninsulaCerrada(t)).toBe(false);
  });
  it("antes de las 20:00 los colegios peninsulares siguen abiertos", () => {
    expect(peninsulaCerrada(Date.UTC(2026, 10, 29, 18, 59, 59))).toBe(false);
  });
});
