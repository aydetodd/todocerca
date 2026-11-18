/** Presentation never changes server authorization or a card's power switch. */
export function cardHasFunds(balance: number): boolean {
  return Number.isFinite(balance) && balance > 0;
}
export function cardIsInColor(balance: number, authorized: boolean, powered: boolean): boolean {
  return cardHasFunds(balance) && authorized && powered;
}
export function validPocketPin(pin: string): boolean {
  return /^(\d{4}|\d{6})$/.test(pin);
}
export function pocketDestinationAllowed(index: number): boolean { return index === 0; }
export function withdrawalFeeCents(amountCents: number, action: 'conversion' | 'spei' | 'qard' | 'oxxo'): number {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new Error('Importe inválido');
  return action === 'spei' ? Math.round(amountCents * 2 / 100) : 0;
}