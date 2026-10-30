import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { canConfirmFiscalProfile, formalizationSummary, validateFiscalEvidence } from './formalization';

const complete = { rfc: 'XAXX010101000', legal_name: 'Persona de prueba', tax_regime: '626', postal_code: '83000', activity: 'Comercio' };
describe('Expediente fiscal privado', () => {
  test('no permite confirmar con datos incompletos', () => {
    assert.equal(canConfirmFiscalProfile({ ...complete, legal_name: '' }), false);
    assert.equal(canConfirmFiscalProfile(complete), true);
  });
  test('no cuenta no aplicables como trámites completados', () => {
    assert.deepEqual(formalizationSummary([{ step_key: 'rfc', status: 'completed' }, { step_key: 'credentials', status: 'not_applicable' }]), {completed: 1, notApplicable: 1, total: 6});
  });
  test('rechaza llaves privadas y documentos de más de 5 MB', () => {
    assert.notEqual(validateFiscalEvidence({name:'firma.key',type:'application/octet-stream',size:100}), null);
    assert.notEqual(validateFiscalEvidence({name:'constancia.pdf',type:'application/pdf',size:5*1024*1024+1}), null);
    assert.equal(validateFiscalEvidence({name:'constancia.pdf',type:'application/pdf',size:5*1024*1024}), null);
  });
});