export const QARD_FEES = { activation: 150, subActivation: 100, reload: 15, merchant: 5, platform: 10 } as const;
export function reloadBreakdown(amount: number, pending: boolean, merchant: boolean) {
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) throw new Error('Monto inválido');
  const opening = pending ? QARD_FEES.activation : 0;
  const net = +(amount - opening - QARD_FEES.reload).toFixed(2);
  if (net <= 0) throw new Error('Monto insuficiente');
  return { opening, fee: QARD_FEES.reload, net, merchant: merchant ? QARD_FEES.merchant : 0, platform: merchant ? QARD_FEES.platform : QARD_FEES.reload };
}
export type Agent = {
  id: string; user_id: string; business_name: string; status: string;
  curp_status: string; rfc_status: string; biometric_status: string; review_note: string | null;
  curp_document: string; ine_front_document: string; ine_back_document: string; rfc_document: string;
};
export type Terminal = { code: string; name: string; operational: boolean };
export type Permission = { id: string; user_id: string; terminal_code: string; status: string };
export function terminalEnabled(agent: Agent | null, permission: Permission | undefined, terminal: Terminal) {
  return !!agent && agent.status === 'approved' && agent.curp_status === 'valid' && agent.rfc_status === 'valid' && agent.biometric_status === 'valid' && permission?.status === 'accepted' && terminal.operational;
}
export function dynamicCvvValid(value: string) { return /^\d{4}$/.test(value); }
export function subActivationEligible(curpValid: boolean, level: number) { return curpValid && level === 1; }
export const documentFields = [
  { key: 'curp', field: 'curp_document', label: 'CURP' },
  { key: 'ine_front', field: 'ine_front_document', label: 'INE · frente' },
  { key: 'ine_back', field: 'ine_back_document', label: 'INE · reverso' },
  { key: 'rfc', field: 'rfc_document', label: 'RFC · constancia fiscal' },
] as const;