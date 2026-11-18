import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { cardIsInColor, validPocketPin, pocketDestinationAllowed, withdrawalFeeCents } from './qardCardState';
test('primer centavo recupera color, cero no', () => {
  assert.equal(cardIsInColor(0, true, true), false);
  assert.equal(cardIsInColor(0.01, true, true), true);
});
test('saldo positivo no evita bloqueos de verificación ni interruptor', () => {
  assert.equal(cardIsInColor(100, false, true), false);
  assert.equal(cardIsInColor(100, true, false), false);
});
test('PIN admite solo 4 o 6 dígitos', () => {
  assert.equal(validPocketPin('1234'), true); assert.equal(validPocketPin('123456'), true);
  for (const value of ['123', '12345', '1234567', 'abcd', '']) assert.equal(validPocketPin(value), false);
});
test('Bolsillo solo retorna a 00, nunca empresarial, bonos o familiares', () => {
  assert.equal(pocketDestinationAllowed(0), true);
  for (const index of [1,2,3,4,5,6,11,99]) assert.equal(pocketDestinationAllowed(index), false);
});
test('convertir $500 de bonos cobra cero', () => { assert.equal(withdrawalFeeCents(50000, 'conversion'), 0); });
test('retirar $500 SPEI descuenta $10; QaRd y OXXO no aplican 2%', () => {
  assert.equal(withdrawalFeeCents(50000, 'spei'), 1000);
  assert.equal(withdrawalFeeCents(50000, 'qard'), 0);
  assert.equal(withdrawalFeeCents(50000, 'oxxo'), 0);
});