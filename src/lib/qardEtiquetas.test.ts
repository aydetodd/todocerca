import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { folioMovimiento, construirLibro, type MovBase } from './qardEtiquetas';

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
test('transferencia empresarial de 100 pertenece solo al libro de cobros', () => {
 const rows=construirLibro([{...base,tipo:'transferencia_p2p_in',monto_mxn:100,sub_qr_id:'emp',metadata:{bolsa:'comercio'}}], 'personal');
 assert.equal(rows.length,1); assert.equal(rows[0].ambito,'cobros'); assert.equal(rows[0].monto,100);
});
test('pago empresarial de 50 no entra en estado personal ni familiar', () => {
 const rows=construirLibro([{...base,tipo:'cobro_comercio',monto_mxn:50,sub_qr_id:'emp',metadata:{bolsa:'comercio'}}], 'personal');
 assert.equal(rows[0].ambito,'cobros'); assert.equal(rows[0].monto,-50);
});

test('recarga del negocio 200 menos comisión propia 5 solo va al libro empresarial', () => { const rows=construirLibro([{...base,tipo:'transferencia_p2p_out',monto_mxn:200,metadata:{terminal:'reload',bolsa:'comercio'}},{...base,id:'2',tipo:'transferencia_p2p_in',monto_mxn:5,metadata:{terminal:'reload',bolsa:'comercio',comision_comercio:5}}],null); assert.equal(rows.every(r=>r.ambito==='cobros'),true); assert.equal(rows.reduce((n,r)=>n+r.monto,0),-195); });

test('folio compartido por ambos lados de una operación', () => {
  const a={...base,id:'a',created_at:'2026-11-07T16:46:04Z',metadata:{operation_key:'5eaf31bb-faea'}};
  const b={...a,id:'b'};
  assert.equal(folioMovimiento(a), 'QRD-20261107-5EAF31');
  assert.equal(folioMovimiento(a), folioMovimiento(b));
});
