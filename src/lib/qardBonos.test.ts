import { describe, it, expect } from "vitest";
import { tipoPorTerminacion, bonosDelGiro, transferenciaPermitida, siguienteFamiliar, bonoPorIndice } from "./qardBonos";

describe("terminaciones QaRd", () => {
  it("00 eje, 01 empresarial, 02-06 bonos, 07-10 reservadas, 11+ familiares", () => {
    expect(tipoPorTerminacion(0)).toBe("eje");
    expect(tipoPorTerminacion(1)).toBe("empresarial");
    expect(bonoPorIndice(2)?.cat).toBe("alimentos");
    expect(bonoPorIndice(3)?.cat).toBe("despensa");
    expect(bonoPorIndice(4)?.cat).toBe("gasolina");
    expect(bonoPorIndice(5)?.cat).toBe("farmacia");
    expect(bonoPorIndice(6)?.cat).toBe("papeleria");
    expect(tipoPorTerminacion(7)).toBe("reservada");
    expect(tipoPorTerminacion(10)).toBe("reservada");
    expect(tipoPorTerminacion(11)).toBe("familiar");
  });
  it("la primera familiar es 11 aunque 02 esté libre", () => {
    expect(siguienteFamiliar([0, 1, 3])).toBe(11);
    expect(siguienteFamiliar([0, 11, 12])).toBe(13);
  });
  it("giro define qué sellos puede prender", () => {
    expect(bonosDelGiro("comida")).toEqual(["alimentos", "despensa"]);
    expect(bonosDelGiro("gasolinera")).toEqual(["gasolina"]);
    expect(bonosDelGiro("otro")).toEqual([]);
  });
  it("transferencia homóloga: bono solo a mismo bono", () => {
    expect(transferenciaPermitida(2, 2)).toBe(true);
    expect(transferenciaPermitida(2, 4)).toBe(false);
    expect(transferenciaPermitida(2, 0)).toBe(false);
    expect(transferenciaPermitida(0, 2)).toBe(false);
    expect(transferenciaPermitida(0, 11)).toBe(true);
  });
});
