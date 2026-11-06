import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import forge from 'node-forge';
import { checkEfirma, extractRazonSocial, matchFiscalRfc, validateEfirmaFile, EFIRMA_GRACE_DAYS } from './efirma';

const rfc = 'AAA010101AAA';
const text = `CONSTANCIA DE SITUACIÓN FISCAL RFC: ${rfc}`;
const pair = forge.pki.rsa.generateKeyPair(1024);
const DAY = 24 * 60 * 60 * 1000;
function fixtures(otherKey = pair.privateKey, notAfter = new Date('2040-01-01'), notBefore = new Date('2020-01-01')) {
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = pair.publicKey;
  certificate.serialNumber = '01';
  certificate.validity.notBefore = notBefore;
  certificate.validity.notAfter = notAfter;
  certificate.setSubject([{name:'commonName',value:'Synthetic certificate test only'},{type:'2.5.4.45',value:rfc}]);
  certificate.setIssuer(certificate.subject.attributes);
  certificate.sign(pair.privateKey, forge.md.sha256.create());
  const key = forge.pki.encryptPrivateKeyInfo(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(otherKey)), 'fixture-password');
  const bytes = (value: string) => Uint8Array.from(value, c => c.charCodeAt(0));
  return {cer:bytes(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes()),key:bytes(forge.asn1.toDer(key).getBytes())};
}
test('RFC manual, certificado y constancia deben coincidir exactamente', () => {
  assert.equal(matchFiscalRfc(rfc,rfc,text),rfc);
  assert.throws(()=>matchFiscalRfc(rfc,'BBB010101BBB',text),/no coincide/);
  assert.throws(()=>matchFiscalRfc(rfc,rfc,'CONSTANCIA DE SITUACIÓN FISCAL RFC: BBB010101BBB'));
});
test('la constancia es opcional: sin PDF solo se coteja RFC manual contra certificado', () => {
  assert.equal(matchFiscalRfc(rfc,rfc,null),rfc);
  assert.throws(()=>matchFiscalRfc(rfc,'BBB010101BBB',null),/no coincide/);
});
test('contraseña incorrecta no abre la llave', () => {const f=fixtures();assert.throws(()=>checkEfirma(f.cer,f.key,'incorrect',rfc,text),/contraseña no es correcta/);});
test('otra llave es rechazada aunque su contraseña sea correcta', () => {const f=fixtures(forge.pki.rsa.generateKeyPair(1024).privateKey);assert.throws(()=>checkEfirma(f.cer,f.key,'fixture-password',rfc,text),/no corresponde/);});
test('certificado vencido hace más de 60 días es rechazado',()=>{const f=fixtures(pair.privateKey,new Date('2021-01-01'));assert.throws(()=>checkEfirma(f.cer,f.key,'fixture-password',rfc,text),/venció el .*renovar tu e.firma ante el SAT/);});
test('certificado aún no vigente es rechazado',()=>{const f=fixtures(pair.privateKey,new Date('2040-01-01'),new Date('2030-01-01'));assert.throws(()=>checkEfirma(f.cer,f.key,'fixture-password',rfc,text),/aún no está vigente/);});
test('e.firma vencida dentro de los 60 días de gracia aprueba con aviso',()=>{
  const notAfter=new Date(Date.now()-30*DAY);
  const f=fixtures(pair.privateKey,notAfter);
  const result=checkEfirma(f.cer,f.key,'fixture-password',rfc,text);
  assert.equal(result.status,'grace');
  assert.equal(result.graceDaysLeft,EFIRMA_GRACE_DAYS-30);
});
test('cotejo exitoso aprueba y nunca expone llave ni contraseña',()=>{
  const f=fixtures();
  const result=checkEfirma(f.cer,f.key,'fixture-password',rfc,text);
  assert.equal(result.status,'valid');
  assert.equal(result.rfc,rfc);
  assert.equal(result.graceDaysLeft,null);
  assert.ok(result.daysLeft>90);
  assert.equal('password' in result,false);
  assert.equal('key' in result,false);
});
test('días restantes se calculan hasta el vencimiento',()=>{
  const notAfter=new Date(Date.now()+45*DAY);
  const f=fixtures(pair.privateKey,notAfter);
  const result=checkEfirma(f.cer,f.key,'fixture-password',rfc,null);
  assert.ok(result.daysLeft>=44&&result.daysLeft<=45);
});
test('selección de archivos rechaza extensión falsa y límites',()=>{assert.throws(()=>validateEfirmaFile({name:'firma.key.pdf',size:10},'key'));assert.throws(()=>validateEfirmaFile({name:'firma.key',size:65537},'key'));assert.throws(()=>validateEfirmaFile({name:'constancia.pdf',size:5242881},'pdf'));});

test('razón social se lee de la constancia', () => { assert.equal(extractRazonSocial('CONSTANCIA Denominación/Razón Social: CITY TRAFFIC SA DE CV Régimen Capital: SA'), 'CITY TRAFFIC SA DE CV'); });
test('persona moral exige RFC de 12 caracteres', () => { assert.throws(() => matchFiscalRfc('VIAM800101AB1', 'VIAM800101AB1', null, 'moral'), /12 caracteres/); });
