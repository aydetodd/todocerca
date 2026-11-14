// A client-side interaction hurdle, not proof of identity or server authorization.
export type CoinPhase = 'fast' | 'slow';
export type CoinOutcome = 'miss' | 'blocked' | 'passed';
export const COIN_RADIUS = 24;
export const COIN_SPEED = { fast: 2400, slow: 65 } as const;
export interface CoinPosition { x: number; y: number }

export function coinOutcome(phase: CoinPhase, coin: CoinPosition, tap: CoinPosition): CoinOutcome {
  if (Math.hypot(coin.x - tap.x, coin.y - tap.y) > COIN_RADIUS) return 'miss';
  return phase === 'fast' ? 'blocked' : 'passed';
}

export function moveCoin(coin: CoinPosition, target: CoinPosition, phase: CoinPhase, deltaMs: number): CoinPosition {
  const distance = Math.hypot(target.x - coin.x, target.y - coin.y);
  if (!distance) return { ...coin };
  const step = Math.min(distance, COIN_SPEED[phase] * Math.max(0, Math.min(deltaMs, 50)) / 1000);
  return { x: coin.x + (target.x - coin.x) * step / distance, y: coin.y + (target.y - coin.y) * step / distance };
}

export function randomCoinTarget(width: number, height: number, random: () => number): CoinPosition {
  const padding = COIN_RADIUS + 8;
  return { x: padding + random() * Math.max(0, width - padding * 2), y: padding + random() * Math.max(0, height - padding * 2) };
}

export function phaseDuration(phase: CoinPhase, random: () => number): number {
  return phase === 'fast' ? 1500 + random() * 1000 : 6000 + random() * 3000;
}