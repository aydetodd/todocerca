import forge from 'node-forge';

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const DAY = 24 * 60 * 60 * 1000;
export const EFIRMA_GRACE_DAYS = 60;

export type TipoPersona = 'moral' | 'fisica';
export const EFIRMA_STEPS = ['Leyendo certificado', 'Validando vigencia', 'Comprobando llave y contraseña', 'Cotejando RFC', 'Cotejando constancia'] as const;

export function matchFiscalRfc(manual: string, certificate: string, pdfText: string | null, tipo?: TipoPersona) {
  const rfc = manual.trim().toUpperCase();
  if (!RFC.test(rfc)) throw new Error('Escribe un RFC válido de 12 o 13 caracteres.');
  if (tipo === 'moral' && rfc.length !== 12) throw new Error('El RFC de una empresa (persona moral) tiene 12 caracteres.');
  if (tipo === 'fisica' && rfc.length !== 13) throw new Error('El RFC de una persona física tiene 13 caracteres.');
  if (rfc !== certificate) throw new Error('❌ El RFC escrito no coincide con el del certificado.');
  if (pdfText !== null) {
    const text = pdfText.toUpperCase().replace(/\s+/g, ' ');
    if (!/CONSTANCIA DE SITUACI[ÓO]N FISCAL/.test(text)) throw new Error('El PDF no contiene una Constancia de Situación Fiscal legible.');
    const found = [...text.matchAll(/(?:^|[^A-ZÑ&0-9])([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})(?=$|[^A-Z0-9])/g)].map(m => m[1]);
    if (found.length === 0 || found.some(value => value !== rfc)) throw new Error('No se pudo cotejar un único RFC coincidente en la constancia.');
  }
  return rfc;
}

/** Razón social / nombre que aparece en la Constancia de Situación Fiscal. */
export function extractRazonSocial(pdfText: string | null) {
  if (!pdfText) return null;
  const text = pdfText.replace(/\s+/g, ' ');
  const m = text.match(/(?:Denominaci[óo]n\s*\/?\s*Raz[óo]n\s*Social|Raz[óo]n\s*Social)\s*:?\s*(.+?)(?=\s+(?:R[ée]gimen\s*Capital|Nombre\s*Comercial|Fecha|idCIF|$))/i);
  return m?.[1]?.trim().slice(0, 120) || null;
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
  representativeRfc: string | null;
  serial: string;
  expiresAt: string;
  daysLeft: number;
  graceDaysLeft: number | null;
  status: 'valid' | 'grace';
};

export function checkEfirma(cerBytes: Uint8Array, keyBytes: Uint8Array, password: string, manualRfc: string, pdfText: string | null, now = new Date(), tipo?: TipoPersona, onStep?: (index: number) => void): EfirmaResult {
  console.log('[e.firma] Paso A: leyendo el certificado .cer');
  onStep?.(0);
  let certificate: forge.pki.Certificate;
  try { certificate = parseCertificate(cerBytes); } catch { throw new Error('No se pudo leer el certificado .cer. Revisa que sea el archivo correcto.'); }
  const attr = certificate.subject.attributes.find(a => a.type === '2.5.4.45');
  const rfcParts = String(attr?.value ?? '').split('/').map(v => v.trim().toUpperCase());
  const certificateRfc = rfcParts[0] ?? '';
  const representativeRfc = rfcParts[1] || null;
  const name = String(certificate.subject.getField('CN')?.value ?? '').trim();
  if (!name) throw new Error('El certificado no contiene el nombre del titular.');
  const { notBefore, notAfter } = certificate.validity;

  console.log('[e.firma] Paso B: validando vigencia por fechas');
  onStep?.(1);
  if (now < notBefore) throw new Error(`⚠️ El certificado aún no está vigente. Inicia el ${formatFechaMx(notBefore.toISOString())}.`);
  const daysExpired = Math.floor((now.getTime() - notAfter.getTime()) / DAY);
  if (daysExpired > EFIRMA_GRACE_DAYS) throw new Error(`❌ El certificado venció el ${formatFechaMx(notAfter.toISOString())}. Debes renovar tu e.firma ante el SAT.`);
  const status: EfirmaResult['status'] = daysExpired > 0 ? 'grace' : 'valid';
  const daysLeft = Math.max(0, Math.ceil((notAfter.getTime() - now.getTime()) / DAY));

  console.log('[e.firma] Paso C: comprobando contraseña y par de llaves');
  onStep?.(2);
  if (!password) throw new Error('Escribe la contraseña de tu e.firma.');
  let privateKey: forge.pki.rsa.PrivateKey;
  try {
    const decrypted = forge.pki.decryptPrivateKeyInfo(forge.asn1.fromDer(binary(keyBytes)), password);
    if (!decrypted) throw new Error('No se abrió la llave');
    privateKey = forge.pki.privateKeyFromAsn1(decrypted);
  } catch { throw new Error('La contraseña no es correcta o el archivo .key no es compatible.'); }
  const publicKey = certificate.publicKey;
  if (!('n' in publicKey) || !('e' in publicKey) || privateKey.n.compareTo(publicKey.n) !== 0 || privateKey.e.compareTo(publicKey.e) !== 0) throw new Error('❌ La llave privada no corresponde al certificado proporcionado.');
  const challenge = forge.random.getBytesSync(32);
  const signed = privateKey.sign(forge.md.sha256.create().update(challenge));
  if (!publicKey.verify(forge.md.sha256.create().update(challenge).digest().bytes(), signed)) throw new Error('No se pudo comprobar la firma criptográfica.');

  console.log('[e.firma] Paso D: cotejando RFC del certificado con el escrito');
  onStep?.(3);
  const rfc = matchFiscalRfc(manualRfc, certificateRfc, null, tipo);
  if (pdfText !== null) { onStep?.(4); matchFiscalRfc(manualRfc, certificateRfc, pdfText, tipo); }
  if (pdfText !== null) console.log('[e.firma] Paso E: constancia de situación fiscal cotejada');

  return {
    rfc,
    name,
    representativeRfc,
    serial: certificate.serialNumber,
    expiresAt: notAfter.toISOString(),
    daysLeft,
    graceDaysLeft: status === 'grace' ? EFIRMA_GRACE_DAYS - daysExpired : null,
    status,
  };
}
