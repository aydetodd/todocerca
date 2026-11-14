import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { coinOutcome, moveCoin, randomCoinTarget, phaseDuration, COIN_SPEED } from './coinChallenge';

test('capturar en fase rápida bloquea el intento', () => {
  assert.equal(coinOutcome('fast', { x: 50, y: 50 }, { x: 50, y: 50 }), 'blocked');
});
test('capturar en fase lenta desbloquea el formulario', () => {
  assert.equal(coinOutcome('slow', { x: 50, y: 50 }, { x: 60, y: 50 }), 'passed');
});
test('tocar fuera de la moneda no bloquea ni desbloquea en ninguna fase', () => {
  for (const phase of ['fast', 'slow'] as const) assert.equal(coinOutcome(phase, { x: 50, y: 50 }, { x: 75, y: 50 }), 'miss');
});
test('velocidad rápida superior a lenta y movimiento limitado por tiempo', () => {
  assert.equal(COIN_SPEED.fast, 2400);
  assert.equal(COIN_SPEED.slow, 65);
  assert.equal(moveCoin({ x: 0, y: 0 }, { x: 500, y: 0 }, 'fast', 50).x, 120);
  assert.equal(moveCoin({ x: 0, y: 0 }, { x: 500, y: 0 }, 'slow', 50).x, 3.25);
});
test('la moneda no sobrepasa su destino ni sale del área en móvil', () => {
  assert.deepEqual(moveCoin({ x: 50, y: 50 }, { x: 51, y: 50 }, 'fast', 50), { x: 51, y: 50 });
  for (const value of [0, 0.5, 0.999]) {
    const point = randomCoinTarget(280, 200, () => value);
    assert.ok(point.x >= 32 && point.x <= 248 && point.y >= 32 && point.y <= 168);
  }
});
test('cada ciclo ofrece primero fase rápida breve y luego lenta prolongada', () => {
  assert.equal(phaseDuration('fast', () => 0), 1500);
  assert.equal(phaseDuration('slow', () => 0), 6000);
  assert.equal(phaseDuration('fast', () => 0.5), 2000);
  assert.equal(phaseDuration('slow', () => 0.5), 7500);
});