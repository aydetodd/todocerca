import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { tipoPorTerminacion, bonosDelGiro, transferenciaPermitida, siguienteFamiliar, bonoPorIndice, qaRdEmpleadoValida, normalizarQaRdEmpleado } from './qardBonos';

test('00 eje, 01 empresarial, 02-06 bonos, 07-10 reservadas, 11+ familiares', () => {
  assert.equal(tipoPorTerminacion(0), 'eje');
  assert.equal(tipoPorTerminacion(1), 'empresarial');
  assert.deepEqual([2, 3, 4, 5, 6].map(n => bonoPorIndice(n)?.cat), ['alimentos', 'despensa', 'gasolina', 'farmacia', 'papeleria']);
  assert.equal(tipoPorTerminacion(7), 'reservada');
  assert.equal(tipoPorTerminacion(10), 'reservada');
  assert.equal(tipoPorTerminacion(11), 'familiar');
});
test('la primera familiar es 11 aunque 02 esté libre', () => {
  assert.equal(siguienteFamiliar([0, 1, 3]), 11);
  assert.equal(siguienteFamiliar([0, 11, 12]), 13);
});
test('entrega identifica al empleado con QaRd Personal 00 de 16 dígitos, también espaciada', () => {
  assert.equal(qaRdEmpleadoValida('5226030000000100'), true);
  assert.equal(qaRdEmpleadoValida('5226 0300 0000 0100'), true);
  assert.equal(normalizarQaRdEmpleado('5226 0300 0000 0100'), '5226030000000100');
  for (const value of ['6621234567', '5226030000000101', '5226030000000102', '5226030000000111', '522603000000100', '5226x030000000100']) assert.equal(qaRdEmpleadoValida(value), false);
});
test('el giro define qué sellos puede prender', () => {
  assert.deepEqual(bonosDelGiro('comida'), ['alimentos', 'despensa']);
  assert.deepEqual(bonosDelGiro('gasolinera'), ['gasolina']);
  assert.deepEqual(bonosDelGiro('otro'), []);
});
test('transferencia homóloga: un bono solo va al mismo bono', () => {
  assert.equal(transferenciaPermitida(2, 2), true);
  assert.equal(transferenciaPermitida(2, 4), false);
  assert.equal(transferenciaPermitida(2, 0), false);
  assert.equal(transferenciaPermitida(0, 2), false);
  assert.equal(transferenciaPermitida(0, 11), true);
});
