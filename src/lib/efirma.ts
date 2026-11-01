import forge from 'node-forge';

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
export function matchFiscalRfc(manual: string, certificate: string, pdfText: string) {
  const rfc = manual.trim().toUpperCase();
  if (!RFC.test(rfc)) throw new Error('Escribe un RFC válido de 12 o 13 caracteres.');
  if (rfc !== certificate) throw new Error('El RFC del certificado no coincide con el RFC escrito.');
  const text = pdfText.toUpperCase().replace(/\s+/g, ' ');
  if (!/CONSTANCIA DE SITUACI[ÓO]N FISCAL/.test(text)) throw new Error('El PDF no contiene una Constancia de Situación Fiscal legible.');
  const found = [...text.matchAll(/(?:^|[^A-ZÑ&0-9])([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})(?=$|[^A-Z0-9])/g)].map(m => m[1]);
  if (found.length === 0 || found.some(value => value !== rfc)) throw new Error('No se pudo cotejar un único RFC coincidente en la constancia.');
  return rfc;
}

export function validateEfirmaFile(file: {name: string; size: number}, extension: 'pdf'|'cer'|'key') {
  if (!file.name.toLowerCase().endsWith(`.${extension}`) || file.size <= 0 || file.size > (extension === 'pdf' ? 5 * 1024 * 1024 : 64 * 1024)) {
    throw new Error(`Elige un archivo .${extension} de máximo ${extension === 'pdf' ? '5 MB' : '64 KB'}.`);
  }
}

function binary(bytes: Uint8Array) { return Array.from(bytes, b => String.fromCharCode(b)).join(''); }
function parseCertificate(bytes: Uint8Array) {
  const input = binary(bytes);
  return input.includes('-----BEGIN CERTIFICATE-----') ? forge.pki.certificateFromPem(input) : forge.pki.certificateFromAsn1(forge.asn1.fromDer(input));
}

export function checkEfirma(cerBytes: Uint8Array, keyBytes: Uint8Array, password: string, manualRfc: string, pdfText: string, now = new Date()) {
  const certificate = parseCertificate(cerBytes);
  const attr = certificate.subject.attributes.find(a => a.type === '2.5.4.45');
  const certificateRfc = String(attr?.value ?? '').split('/')[0].trim().toUpperCase();
  const rfc = matchFiscalRfc(manualRfc, certificateRfc, pdfText);
  const name = String(certificate.subject.getField('CN')?.value ?? '').trim();
  if (!name) throw new Error('El certificado no contiene el nombre del titular.');
  if (now < certificate.validity.notBefore || now > certificate.validity.notAfter) throw new Error('El certificado está vencido o todavía no es vigente.');
  if (!password) throw new Error('Escribe la contraseña de tu e.firma.');
  let privateKey: forge.pki.rsa.PrivateKey;
  try {
    const decrypted = forge.pki.decryptPrivateKeyInfo(forge.asn1.fromDer(binary(keyBytes)), password);
    if (!decrypted) throw new Error('No se abrió la llave');
    privateKey = forge.pki.privateKeyFromAsn1(decrypted);
  } catch { throw new Error('La contraseña no abre la llave o el archivo .key no es compatible.'); }
  const publicKey = certificate.publicKey;
  if (!('n' in publicKey) || !('e' in publicKey) || privateKey.n.compareTo(publicKey.n) !== 0 || privateKey.e.compareTo(publicKey.e) !== 0) throw new Error('La llave privada no corresponde al certificado.');
  const challenge = forge.random.getBytesSync(32);
  const signed = privateKey.sign(forge.md.sha256.create().update(challenge));
  if (!publicKey.verify(forge.md.sha256.create().update(challenge).digest().bytes(), signed)) throw new Error('No se pudo comprobar la firma criptográfica.');
  // Local possession and dates are NOT a trusted SAT issuer/revocation check.
  return { rfc, name, expiresAt: certificate.validity.notAfter.toISOString(), serial: certificate.serialNumber, satStatus: 'pending' as const };
}