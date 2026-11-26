import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { concentratedStatement, referenceFor, presenceProgress, calendarDay, type DocumentSource, type PresenceEvent } from '../../supabase/functions/_shared/qardConcentrado';
import type { MovBase } from './qardEtiquetas';

const source: DocumentSource = { qard: '5226030000000100', index: 0, name: 'ANA MARÍA LÓPEZ', balance: 0, principal_id: 'personal', card_id: 'personal', start: '2026-11-01T07:00:00Z', end: '2026-11-23T20:00:00Z', address: null, movements: [] };
const movement = (patch: Partial<MovBase>): MovBase => ({ id: 'a', tipo: 'recarga', monto_mxn: 200, sub_qr_id: null, descripcion: null, created_at: '2026-11-07T20:00:00Z', ...patch });
test('referencia usa únicamente nueve dígitos de una QaRd completa', () => {
  assert.equal(referenceFor(movement({ metadata: { counterparty_qard: '5226030000000100' } })), '000000100');
  assert.equal(referenceFor(movement({ metadata: { origen: 'QRD-20261107-ABC123', destino_last4: '0100', referencia: '6624124381' } })), '');
});
test('saldo inicial cero, entradas 200, salidas incluyendo comisión 15 y saldo final 185', () => {
  const result = concentratedStatement({ ...source, balance: 185, movements: [movement({ metadata: { monto_transferido: 200, comision_recarga: 15 } })] });
  assert.deepEqual([result.initial, result.income, result.outgoing, result.final], [0, 200, 15, 185]);
  assert.equal(result.rows[0].concept, 'Saldo Inicial'); assert.equal(result.rows[0].balance, 0);
});
test('devolución recibida suma entrada real y pagada suma salida', () => {
  for (const received of [true, false]) {
    const result = concentratedStatement({ ...source, balance: received ? 100 : -100, movements: [movement({ tipo: 'devolucion', monto_mxn: -100, metadata: { refund_received: received } })] });
    assert.equal(result.income, received ? 100 : 0); assert.equal(result.outgoing, received ? 0 : 100);
  }
});
test('empresarial no mezcla fondos personales', () => {
  const result = concentratedStatement({ ...source, index: 1, balance: 50, card_id: 'emp', movements: [movement({}), movement({ id: 'b', tipo: 'cobro_recibido', monto_mxn: 50, ambito: 'cobros' })] });
  assert.equal(result.income, 50); assert.equal(result.initial, 0);
});
test('Ahorro 10 recibe depósito y devuelve exclusivamente a 00', () => {
  const result = concentratedStatement({ ...source, index: 10, balance: 75, movements: [movement({ monto_mxn: -100, metadata: { bolsillo_id: 'p' } }), movement({ id: 'b', tipo: 'transferencia_p2p_in', monto_mxn: 25, metadata: { bolsillo_id: 'p' } })] });
  assert.deepEqual([result.initial, result.income, result.outgoing, result.final], [0, 100, 25, 75]);
  assert.equal(result.rows[1].reference, '000000100');
});
test('bono 02 mantiene su saldo y excluye bono de otra tarjeta', () => {
  const result = concentratedStatement({ ...source, index: 2, card_id: 'bono2', balance: 50, movements: [movement({ tipo: 'bono_recibido', ambito: 'bonos', sub_qr_id: 'bono2', monto_mxn: 50 }), movement({ id: 'b', tipo: 'bono_recibido', ambito: 'bonos', sub_qr_id: 'bono4', monto_mxn: 300 })] });
  assert.equal(result.income, 50); assert.equal(result.final, 50);
});
test('concentración no pierde centavos ni movimientos de una misma referencia', () => {
  const movements = Array.from({ length: 1100 }, (_, i) => movement({ id: String(i), monto_mxn: .01, metadata: { counterparty_qard: source.qard } }));
  const result = concentratedStatement({ ...source, balance: 11, movements });
  assert.equal(result.rows.length, 2); assert.equal(result.income, 11); assert.equal(result.initial, 0); assert.equal(result.reconciled, true);
});

const event = (day: number, patch: Partial<PresenceEvent> = {}): PresenceEvent => ({ time: `2026-11-${String(day).padStart(2, '0')}T17:00:00Z`, trusted: true, distance: 100, accuracy: 12, lifeHash: `life-${day}`, receipt: `session-${day}`, ...patch });
const now = '2026-11-23T20:00:00Z';
test('tres días calendáricos distintos aprobados, no tres veces el mismo día', () => {
  assert.equal(presenceProgress([event(21), event(22), event(23)], now), 3);
  assert.equal(presenceProgress([event(23), event(23, { lifeHash: 'other', receipt: 'other' }), event(23, { lifeHash: 'third', receipt: 'third' })], now), 1);
});
test('ventana de siete días excluye evidencia vencida', () => {
  assert.equal(presenceProgress([event(15), event(22), event(23)], now), 2);
});
test('entre primera y tercera evidencia deben pasar al menos 24 horas', () => {
  const sameWindow = [event(22, { time: '2026-11-22T06:59:00Z' }), event(22, { time: '2026-11-22T07:00:00Z', receipt: 's2', lifeHash: 'l2' }), event(23, { time: '2026-11-23T07:00:00Z' })];
  assert.equal(presenceProgress(sameWindow, now), 3);
  assert.equal(presenceProgress(sameWindow.slice(0, 2), now), 2);
});
test('radio máximo 100 metros y precisión válida obligatorios', () => {
  assert.equal(presenceProgress([event(21), event(22), event(23, { distance: 100.01 })], now), 2);
  assert.equal(presenceProgress([event(21), event(22), event(23, { accuracy: 0 })], now), 2);
});
test('misma prueba de vida o recibo no cuentan dos veces', () => {
  assert.equal(presenceProgress([event(21), event(22, { lifeHash: 'life-21' }), event(23)], now), 2);
  assert.equal(presenceProgress([event(21), event(22, { receipt: 'session-21' }), event(23)], now), 2);
});
test('selfie/GPS sin proveedor confiable y evidencia futura no verifican domicilio', () => {
  assert.equal(presenceProgress([event(21, { trusted: false }), event(22, { trusted: false }), event(23, { trusted: false })], now), 0);
  assert.equal(presenceProgress([event(24)], now), 0);
});
test('días de presencia usan calendario de Hermosillo, no UTC', () => {
  assert.equal(calendarDay('2026-11-23T06:59:00Z'), '2026-11-22');
  assert.equal(calendarDay('2026-11-23T07:00:00Z'), '2026-11-23');
});