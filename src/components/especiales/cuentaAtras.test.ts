import { describe, expect, it } from "vitest";
import { cuentaAtras } from "./cuentaAtras";

describe("cuentaAtras", () => {
  it("cuenta hasta las 20:00 de Madrid del domingo 29", () => {
    // Sábado 28, 19:05:50 en Madrid = 18:05:50 UTC
    expect(cuentaAtras(Date.UTC(2026, 10, 28, 18, 5, 50))).toBe("Faltan 1 d 00 h 54 min 10 s");
  });
  it("deja de contar a las 20:00 en punto", () => {
    expect(cuentaAtras(Date.UTC(2026, 10, 29, 19, 0, 0))).toBeNull();
  });
});
