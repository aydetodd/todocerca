import { test } from "node:test";
import { strict as assert } from "node:assert";
import { tipoContraparteFlete } from "./fletes";

test("un transportista solo busca cargas de remitentes", () => {
  assert.equal(tipoContraparteFlete("transportista"), "remitente");
});

test("un remitente solo busca transportistas", () => {
  assert.equal(tipoContraparteFlete("remitente"), "transportista");
});

test("sin tipo registrado no se muestra ningún tipo de anuncio", () => {
  assert.equal(tipoContraparteFlete(null), null);
});