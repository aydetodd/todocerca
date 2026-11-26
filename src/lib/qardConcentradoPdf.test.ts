import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { renderConcentratedPdf } from '../../supabase/functions/_shared/qardConcentradoPdf';
import type { DocumentSource } from '../../supabase/functions/_shared/qardConcentrado';

test('un periodo grande se rechaza sin truncar ni emitir un documento incompleto', async () => {
  const source: DocumentSource = { qard: '5226030000000100', index: 0, name: 'ANA MARÍA LÓPEZ', balance: 37, principal_id: 'p', card_id: 'p', start: '2026-10-01T07:00:00Z', end: '2026-11-23T20:00:00Z', address: null,
    movements: Array.from({ length: 37 }, (_, i) => ({ id: String(i), tipo: 'recarga', monto_mxn: 1, descripcion: null, sub_qr_id: null, created_at: new Date(Date.UTC(2026, 9, i + 1, 17)).toISOString() })) };
  const qr = await QRCode.toDataURL('https://todocerca.mx/verificar/' + 'a'.repeat(64));
  assert.throws(() => renderConcentratedPdf(new jsPDF({ format: 'a4' }), source, 'a'.repeat(192), qr), /supera una página/);
});