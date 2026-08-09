// Validación oficial de CURP (18 caracteres + dígito verificador RENAPO)

const DICCIONARIO = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

const ESTADOS = [
  "AS","BC","BS","CC","CL","CM","CS","CH","DF","DG","GT","GR","HG","JC","MC",
  "MN","MS","NT","NL","OC","PL","QT","QR","SP","SL","SR","TC","TS","TL","VZ","YN","ZS","NE",
];

const CURP_REGEX =
  /^[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;

export function digitoVerificadorCurp(curp17: string): number {
  let suma = 0;
  for (let i = 0; i < 17; i++) {
    const valor = DICCIONARIO.indexOf(curp17[i]);
    if (valor < 0) return -1;
    suma += valor * (18 - i);
  }
  return (10 - (suma % 10)) % 10;
}

/** true si la CURP cumple formato oficial, entidad válida y dígito verificador. */
export function validarCurp(input: string): boolean {
  const curp = (input || "").toUpperCase().trim();
  if (curp.length !== 18) return false;
  if (!CURP_REGEX.test(curp)) return false;
  if (!ESTADOS.includes(curp.slice(11, 13))) return false;
  return digitoVerificadorCurp(curp.slice(0, 17)) === Number(curp[17]);
}

export const MENSAJE_CURP_INVALIDA =
  "La CURP ingresada no es válida según el formato oficial.";
