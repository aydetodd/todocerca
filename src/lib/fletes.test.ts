import { test } from "node:test";
import { strict as assert } from "node:assert";
import { tipoContraparteFlete, buscarFletesCompatibles, fletesCompatibles, fletesGestionables, type FleteAnuncio } from "./fletes";

test("un transportista solo busca cargas de remitentes", () => {
  assert.equal(tipoContraparteFlete("transportista"), "remitente");
});

test("un remitente solo busca transportistas", () => {
  assert.equal(tipoContraparteFlete("remitente"), "transportista");
});

test("sin tipo registrado no se muestra ningún tipo de anuncio", () => {
  assert.equal(tipoContraparteFlete(null), null);
});

const unidad = { id: "u", user_id: "transportista", tipo: "transportista", disponible: true, destinos_preferidos: ["Juárez, Chihuahua"], remolque: "Caja refrigerada (thermo)", dimensiones: "Caja 48 pies" } as FleteAnuncio;
const carga = { id: "c", user_id: "remitente", tipo: "remitente", disponible: true, destino_municipio: "Juárez", destino_estado: "Chihuahua", remolque: "Caja refrigerada (thermo)", tamano: "Caja 48 pies", temperatura: "Refrigerado (0 a 8 °C)" } as FleteAnuncio;

test("el transportista gestiona solo unidades aunque conserve cargas anteriores", () => {
  assert.deepEqual(fletesGestionables("transportista", [unidad, carga]), [unidad]);
});

test("el remitente gestiona solo cargas aunque conserve unidades anteriores", () => {
  assert.deepEqual(fletesGestionables("remitente", [unidad, carga]), [carga]);
});

test("sin registro no se permite gestionar unidades ni cargas", () => {
  assert.deepEqual(fletesGestionables(null, [unidad, carga]), []);
});

test("carga a Juárez Chihuahua refrigerada de 48 pies coincide con la unidad", () => {
  assert.equal(fletesCompatibles(unidad, carga), true);
  assert.deepEqual(buscarFletesCompatibles("transportista", [unidad], [carga]), [carga]);
  assert.deepEqual(buscarFletesCompatibles("remitente", [carga], [unidad]), [unidad]);
});
test("no mezcla destinos de diferentes estados", () => {
  assert.equal(fletesCompatibles(unidad, { ...carga, destino_estado: "Nuevo León" }), false);
});
test("no muestra carga de 48 pies a unidad de 53 pies", () => {
  assert.equal(fletesCompatibles({ ...unidad, dimensiones: "Caja 53 pies" }, carga), false);
});
test("no muestra carga refrigerada a caja seca", () => {
  assert.equal(fletesCompatibles({ ...unidad, remolque: "Caja seca" }, { ...carga, remolque: null }), false);
});
test("sin datos propios no inventa coincidencias", () => {
  assert.deepEqual(buscarFletesCompatibles("transportista", [], [carga]), []);
});
test("no muestra transportista no disponible ni anuncios propios", () => {
  assert.deepEqual(buscarFletesCompatibles("remitente", [carga], [{ ...unidad, disponible: false }]), []);
  assert.deepEqual(buscarFletesCompatibles("transportista", [unidad], [{ ...carga, user_id: unidad.user_id }]), []);
});