import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { visibleVerificationData, confirmationAllowed } from '../../supabase/functions/_shared/verificationData';
test('conserva los datos reales de CURP INE y RFC, incluso campos adicionales', () => {
  const data = { curp: 'CURP', ine: { domicilio: 'Domicilio', sexo: 'H' }, rfc: { status: true, regimen: 'Fiscal' } };
  assert.deepEqual(visibleVerificationData(data), data);
});
test('no devuelve credenciales ni imágenes del proveedor', () => {
  assert.deepEqual(visibleVerificationData({ nombre: 'Persona', token: 'private', imagen: 'binary', nested: { api_key: 'private', edad: 40 } }), { nombre: 'Persona', nested: { edad: 40 } });
});
test('seguir o reportar no confirma datos', () => { assert.equal(confirmationAllowed('pending','leer'),false); assert.equal(confirmationAllowed('pending','reportar'),false); assert.equal(confirmationAllowed('rejected','confirmar'),false); assert.equal(confirmationAllowed('pending','confirmar'),true); });