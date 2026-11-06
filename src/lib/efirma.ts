import forge from 'node-forge';

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const DAY = 24 * 60 * 60 * 1000;
export const EFIRMA_GRACE_DAYS = 60;

export function matchFiscalRfc(manual: string, certificate: string, pdfText: string | null) {
  const rfc = manual.trim().toUpperCase();
  if (!RFC.test(rfc)) throw new Error('Escribe un RFC válido de 12 o 13 caracteres.');
  if (rfc !== certificate) throw new Error('El RFC escrito no coincide con el del certificado.');
  if (pdfText !== null) {
    const text = pdfText.toUpperCase().replace(/\s+/g, ' ');
    if (!/CONSTANCIA DE SITUACI[ÓO]N FISCAL/.test(text)) throw new Error('El PDF no contiene una Constancia de Situación Fiscal legible.');
    const found = [...text.matchAll(/(?:^|[^A-ZÑ&0-9])([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})(?=$|[^A-Z0-9])/g)].map(m => m[1]);
    if (found.length === 0 || found.some(value => value !== rfc)) throw new Error('No se pudo cotejar un único RFC coincidente en la constancia.');
  }
  return rfc;
}

export function validateEfirmaFile(file: {name: string; size: number}, extension: 'pdf'|'cer'|'key') {
  if (!file.name.toLowerCase().endsWith(`.${extension}`) || file.size <= 0 || file.size > (extension === 'pdf' ? 5 * 1024 * 1024 : 64 * 1024)) {
    throw new Error(`Elige un archivo .${extension} de máximo ${extension === 'pdf' ? '5 MB' : '64 KB'}.`);
  }
}

export function formatFechaMx(iso: string) {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

function binary(bytes: Uint8Array) { return Array.from(bytes, b => String.fromCharCode(b)).join(''); }
function parseCertificate(bytes: Uint8Array) {
  const input = binary(bytes);
  return input.includes('-----BEGIN CERTIFICATE-----') ? forge.pki.certificateFromPem(input) : forge.pki.certificateFromAsn1(forge.asn1.fromDer(input));
}

export type EfirmaResult = {
  rfc: string;
  name: string;
  serial: string;
  expiresAt: string;
  daysLeft: number;
  graceDaysLeft: number | null;
  status: 'valid' | 'grace';
};

export function checkEfirma(cerBytes: Uint8Array, keyBytes: Uint8Array, password: string, manualRfc: string, pdfText: string | null, now = new Date()): EfirmaResult {
  console.log('[e.firma] Paso A: leyendo el certificado .cer');
  const certificate = parseCertificate(cerBytes);
  const attr = certificate.subject.attributes.find(a => a.type === '2.5.4.45');
  const certificateRfc = String(attr?.value ?? '').split('/')[0].trim().toUpperCase();
  const name = String(certificate.subject.getField('CN')?.value ?? '').trim();
  if (!name) throw new Error('El certificado no contiene el nombre del titular.');
  const { notBefore, notAfter } = certificate.validity;

  console.log('[e.firma] Paso B: validando vigencia por fechas');
  if (now < notBefore) throw new Error('Certificado aún no vigente.');
  const daysExpired = Math.floor((now.getTime() - notAfter.getTime()) / DAY);
  if (daysExpired > EFIRMA_GRACE_DAYS) throw new Error('Tu e.firma venció hace más de 60 días. Debes renovarla para mantener el Nivel 3.');
  const status: EfirmaResult['status'] = daysExpired > 0 ? 'grace' : 'valid';
  const daysLeft = Math.max(0, Math.ceil((notAfter.getTime() - now.getTime()) / DAY));

  console.log('[e.firma] Paso C: comprobando contraseña y par de llaves');
  if (!password) throw new Error('Escribe la contraseña de tu e.firma.');
  let privateKey: forge.pki.rsa.PrivateKey;
  try {
    const decrypted = forge.pki.decryptPrivateKeyInfo(forge.asn1.fromDer(binary(keyBytes)), password);
    if (!decrypted) throw new Error('No se abrió la llave');
    privateKey = forge.pki.privateKeyFromAsn1(decrypted);
  } catch { throw new Error('La contraseña no es correcta o el archivo .key no es compatible.'); }
  const publicKey = certificate.publicKey;
  if (!('n' in publicKey) || !('e' in publicKey) || privateKey.n.compareTo(publicKey.n) !== 0 || privateKey.e.compareTo(publicKey.e) !== 0) throw new Error('La llave privada no corresponde al certificado.');
  const challenge = forge.random.getBytesSync(32);
  const signed = privateKey.sign(forge.md.sha256.create().update(challenge));
  if (!publicKey.verify(forge.md.sha256.create().update(challenge).digest().bytes(), signed)) throw new Error('No se pudo comprobar la firma criptográfica.');

  console.log('[e.firma] Paso D: cotejando RFC del certificado con el escrito');
  const rfc = matchFiscalRfc(manualRfc, certificateRfc, pdfText);
  if (pdfText !== null) console.log('[e.firma] Paso E: constancia de situación fiscal cotejada');

  return {
    rfc,
    name,
    serial: certificate.serialNumber,
    expiresAt: notAfter.toISOString(),
    daysLeft,
    graceDaysLeft: status === 'grace' ? EFIRMA_GRACE_DAYS - daysExpired : null,
    status,
  };
}
