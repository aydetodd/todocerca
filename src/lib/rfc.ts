// Validación de formato de RFC (persona moral 12 y persona física 13)
const RFC_REGEX =
  /^([A-ZÑ&]{3,4})(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{2})([A\d])$/;

export function validarRfc(input: string): boolean {
  const rfc = (input || "").toUpperCase().replace(/[\s-]/g, "");
  if (rfc.length !== 12 && rfc.length !== 13) return false;
  return RFC_REGEX.test(rfc);
}

export const MENSAJE_RFC_INVALIDO =
  "El RFC ingresado no tiene un formato válido.";
