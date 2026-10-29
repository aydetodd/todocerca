import { z } from 'zod';

export const GUIDE_VERSION = 'v1';
export const FISCAL_BUCKET = 'formalizacion-documentos';
export const formalizationSteps = [
  { key: 'eligibility', title: 'Revisar si RESICO corresponde', detail: 'Revisa tus actividades, ingresos y las exclusiones con el SAT o tu contador. RESICO no corresponde automáticamente a todos los negocios.', link: 'https://sat.gob.mx/ordenamiento/18355/ley-del-impuesto-sobre-la-renta', linkLabel: 'Requisitos en la ley' },
  { key: 'documents', title: 'Reunir documentos', detail: 'Ten a mano tu identificación, CURP, RFC si ya lo tienes y comprobante de domicilio. Confirma los requisitos del trámite que realizarás.', link: 'https://www.sat.gob.mx/portal/public/tramites/inscripcion-y-aviso-al-rfc', linkLabel: 'Documentos y trámites SAT' },
  { key: 'rfc', title: 'Inscripción o actualización del RFC', detail: 'Si aún no tienes RFC, solicita la inscripción. Si ya lo tienes, revisa la actualización de actividades y obligaciones. Conserva el acuse real del SAT.', link: 'https://www.sat.gob.mx/portal/public/tramites/inscripcion-y-aviso-al-rfc', linkLabel: 'Inscripción y avisos al RFC' },
  { key: 'credentials', title: 'e.firma, sello digital y Buzón', detail: 'Revisa las obligaciones que te corresponden. La e.firma y el certificado de sello digital no son lo mismo. No compartas contraseñas ni archivos de llaves privadas aquí.', link: 'https://wwwmat.sat.gob.mx/aplicacion/16660/genera-y-descarga-tus-archivos-a-traves-de-la-aplicacion-certifica', linkLabel: 'e.firma y sello digital', extraLink: 'https://www.sat.gob.mx/minisitio/BuzonTributario/quienes_deben_habilitarlo.html', extraLabel: 'Buzón Tributario' },
  { key: 'fiscal_profile', title: 'Confirmar expediente fiscal', detail: 'Copia los datos de tu constancia de situación fiscal en la pestaña Expediente. Confirmarlos aquí no verifica ni modifica tu registro en el SAT.', link: 'https://www.sat.gob.mx/portal/public/tramites/inscripcion-y-aviso-al-rfc', linkLabel: 'Consultar trámites fiscales' },
  { key: 'obligations', title: 'Revisar próximos pendientes', detail: 'Anota tus obligaciones y próximos pendientes según tu situación real. Confirma con el SAT o tu contador las fechas aplicables; no se crean plazos automáticos.', link: 'https://www.sat.gob.mx/portal/public/tramites', linkLabel: 'Trámites oficiales SAT' },
] as const;

export const fiscalDraftSchema = z.object({
  rfc: z.string().trim().toUpperCase().refine(v => !v || /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(v), 'Revisa el RFC: debe tener 12 o 13 caracteres.'),
  legal_name: z.string().trim().max(250),
  tax_regime: z.string().trim().refine(v => !v || /^\d{3}$/.test(v), 'El código del régimen debe tener 3 dígitos.'),
  postal_code: z.string().trim().refine(v => !v || /^\d{5}$/.test(v), 'El código postal debe tener 5 dígitos.'),
  activity: z.string().trim().max(1000),
});
export type FiscalDraft = z.infer<typeof fiscalDraftSchema>;
export const emptyFiscalDraft: FiscalDraft = { rfc: '', legal_name: '', tax_regime: '', postal_code: '', activity: '' };
export function canConfirmFiscalProfile(draft: FiscalDraft) {
  return fiscalDraftSchema.safeParse(draft).success && Object.values(draft).every(value => value.trim().length > 0);
}
export function validateFiscalEvidence(file: Pick<File, 'size' | 'type' | 'name'>) {
  if (file.size > 5 * 1024 * 1024) return 'El archivo debe pesar como máximo 5 MB.';
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !['pdf', 'jpg', 'jpeg', 'png'].includes(ext) || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) return 'Selecciona un PDF o una imagen JPG/PNG; no subas llaves ni contraseñas.';
  return null;
}
export function formalizationSummary(rows: ReadonlyArray<{step_key: string; status: string}>) {
  const current = new Map(rows.map(row => [row.step_key, row.status]));
  return {
    completed: formalizationSteps.filter(step => current.get(step.key) === 'completed').length,
    notApplicable: formalizationSteps.filter(step => current.get(step.key) === 'not_applicable').length,
    total: formalizationSteps.length,
  };
}