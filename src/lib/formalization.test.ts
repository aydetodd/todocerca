import { describe, expect, test } from 'bun:test';
import { canConfirmFiscalProfile, formalizationSummary, validateFiscalEvidence } from './formalization';

const complete = { rfc: 'XAXX010101000', legal_name: 'Persona de prueba', tax_regime: '626', postal_code: '83000', activity: 'Comercio' };
describe('Expediente fiscal privado', () => {
  test('no permite confirmar con datos incompletos', () => {
    expect(canConfirmFiscalProfile({ ...complete, legal_name: '' })).toBe(false);
    expect(canConfirmFiscalProfile(complete)).toBe(true);
  });
  test('no cuenta no aplicables como trámites completados', () => {
    expect(formalizationSummary([{ step_key: 'rfc', status: 'completed' }, { step_key: 'credentials', status: 'not_applicable' }])).toEqual({completed: 1, notApplicable: 1, total: 6});
  });
  test('rechaza llaves privadas y documentos de más de 5 MB', () => {
    expect(validateFiscalEvidence({name:'firma.key',type:'application/octet-stream',size:100})).not.toBeNull();
    expect(validateFiscalEvidence({name:'constancia.pdf',type:'application/pdf',size:5*1024*1024+1})).not.toBeNull();
    expect(validateFiscalEvidence({name:'constancia.pdf',type:'application/pdf',size:5*1024*1024})).toBeNull();
  });
});