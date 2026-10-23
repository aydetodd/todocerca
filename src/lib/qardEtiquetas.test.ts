import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { construirLibro, type MovBase } from './qardEtiquetas';

const base: MovBase = { id: '1', tipo: 'recarga', monto_mxn: 35, descripcion: null, created_at: '2026-10-22T12:00:00Z', sub_qr_id: null };
test('recarga inicial de 200 deja 35 en el libro eje y cero en cobros', () => {
  const rows = construirLibro([{ ...base, metadata: { monto_transferido: 200, apertura: 150, comision_recarga: 15 } }], null);
  assert.equal(rows.filter(r => r.ambito === 'eje').reduce((n,r) => n+r.monto,0),35);
  assert.equal(rows.filter(r => r.ambito === 'cobros').length,0);
});
test('recarga posterior de 200 deja 185 en el libro eje', () => {
  const rows = construirLibro([{ ...base, monto_mxn: 185, metadata: { monto_transferido: 200, apertura: 0, comision_recarga: 15 } }], null);
  assert.equal(rows.reduce((n,r) => n+r.monto,0),185);
});
test('comercio entrega 200 y recibe 5 solo en cuenta eje', () => {
  const rows = construirLibro([
    { ...base, tipo: 'transferencia_p2p_out', monto_mxn: 200, metadata: { terminal: 'reload' } },
    { ...base, id: '2', tipo: 'transferencia_p2p_in', monto_mxn: 5, metadata: { terminal: 'reload', comision_comercio: 5 } },
  ], null);
  assert.equal(rows.reduce((n,r) => n+r.monto,0),-195);
  assert.equal(rows.every(r => r.ambito === 'eje'),true);
});