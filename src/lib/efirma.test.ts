import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import forge from 'node-forge';
import { checkEfirma, matchFiscalRfc, validateEfirmaFile } from './efirma';

const rfc = 'AAA010101AAA';
const text = `CONSTANCIA DE SITUACIÓN FISCAL RFC: ${rfc}`;
const pair = forge.pki.rsa.generateKeyPair(1024);
function fixtures(otherKey = pair.privateKey, expired = false) {
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = pair.publicKey;
  certificate.serialNumber = '01';
  certificate.validity.notBefore = new Date('2020-01-01');
  certificate.validity.notAfter = new Date(expired ? '2021-01-01' : '2040-01-01');
  certificate.setSubject([{name:'commonName',value:'Synthetic certificate test only'},{type:'2.5.4.45',value:rfc}]);
  certificate.setIssuer(certificate.subject.attributes);
  certificate.sign(pair.privateKey, forge.md.sha256.create());
  const key = forge.pki.encryptPrivateKeyInfo(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(otherKey)), 'fixture-password');
  const bytes = (value: string) => Uint8Array.from(value, c => c.charCodeAt(0));
  return {cer:bytes(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes()),key:bytes(forge.asn1.toDer(key).getBytes())};
}
test('RFC manual, certificado y constancia deben coincidir exactamente', () => {
  assert.equal(matchFiscalRfc(rfc,rfc,text),rfc);
  assert.throws(()=>matchFiscalRfc(rfc,'BBB010101BBB',text));
  assert.throws(()=>matchFiscalRfc(rfc,rfc,'CONSTANCIA DE SITUACIÓN FISCAL RFC: BBB010101BBB'));
});
test('contraseña incorrecta no abre la llave', () => {const f=fixtures();assert.throws(()=>checkEfirma(f.cer,f.key,'incorrect',rfc,text),/contraseña/);});
test('otra llave es rechazada aunque su contraseña sea correcta', () => {const f=fixtures(forge.pki.rsa.generateKeyPair(1024).privateKey);assert.throws(()=>checkEfirma(f.cer,f.key,'fixture-password',rfc,text),/no corresponde/);});
test('certificado vencido es rechazado',()=>{const f=fixtures(pair.privateKey,true);assert.throws(()=>checkEfirma(f.cer,f.key,'fixture-password',rfc,text),/vencido/);});
test('cotejo local exitoso conserva SAT pendiente incluso con certificado autofirmado',()=>{const f=fixtures();const result=checkEfirma(f.cer,f.key,'fixture-password',rfc,text);assert.equal(result.satStatus,'pending');assert.equal(result.rfc,rfc);assert.equal('password' in result,false);assert.equal('key' in result,false);});
test('selección de archivos rechaza extensión falsa y límites',()=>{assert.throws(()=>validateEfirmaFile({name:'firma.key.pdf',size:10},'key'));assert.throws(()=>validateEfirmaFile({name:'firma.key',size:65537},'key'));assert.throws(()=>validateEfirmaFile({name:'constancia.pdf',size:5242881},'pdf'));});