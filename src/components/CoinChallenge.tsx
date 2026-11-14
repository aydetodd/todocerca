import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COIN_RADIUS, coinOutcome, moveCoin, phaseDuration, randomCoinTarget, type CoinPhase, type CoinPosition } from '@/lib/coinChallenge';

type Status = 'ready' | 'running' | 'passed' | 'blocked';
interface Props { onVerified: () => void }
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

/** Visual friction only: browser events and state are not a server-side CAPTCHA. */
export default function CoinChallenge({ onVerified }: Props) {
  const [status, setStatus] = useState<Status>('ready');
  const [phase, setPhase] = useState<CoinPhase>('fast');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<Status>('ready');
  const keyboardRef = useRef(false);
  const drawn = useRef<{ coin: CoinPosition; phase: CoinPhase; width: number; height: number } | null>(null);

  useEffect(() => {
    if (status !== 'running') return;
    const canvas = canvasRef.current;
    const surface = surfaceRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !surface || !ctx) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let coin = { x: 0, y: 0 };
    let target = { x: 0, y: 0 };
    let currentPhase: CoinPhase = 'fast';
    let remaining = phaseDuration(currentPhase, random);
    let turnIn = 0;
    let last = performance.now();
    let frame = 0;
    const trail: CoinPosition[] = [];
    const styles = getComputedStyle(surface);
    const gold = `hsl(${styles.getPropertyValue('--coin-gold')})`;
    const light = `hsl(${styles.getPropertyValue('--coin-light')})`;
    const ink = `hsl(${styles.getPropertyValue('--coin-ink')})`;
    const resize = () => {
      width = surface.clientWidth;
      height = surface.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      coin = { x: width / 2, y: height / 2 };
      target = randomCoinTarget(width, height, random);
      trail.length = 0;
      drawn.current = null;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    resize();
    const paintCoin = (point: CoinPosition, opacity: number, ghost: boolean) => {
      ctx.save();
      ctx.globalAlpha = opacity;
      if (ghost) ctx.filter = 'blur(3px)';
      ctx.beginPath();
      ctx.arc(point.x, point.y, COIN_RADIUS - 2, 0, Math.PI * 2);
      ctx.fillStyle = gold;
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(point.x, point.y, COIN_RADIUS - 7, 0, Math.PI * 2);
      ctx.strokeStyle = light;
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', point.x, point.y + 1);
      ctx.restore();
    };
    const animate = (now: number) => {
      if (statusRef.current !== 'running') return;
      const elapsed = Math.max(0, Math.min(now - last, 50));
      last = now;
      // Pause both motion and phase clocks in background tabs.
      if (!document.hidden) {
        remaining -= elapsed;
        if (remaining <= 0) {
          currentPhase = currentPhase === 'fast' ? 'slow' : 'fast';
          remaining = phaseDuration(currentPhase, random);
          target = randomCoinTarget(width, height, random);
          trail.length = 0;
          setPhase(currentPhase);
        }
        const stationary = reducedMotion.matches || keyboardRef.current;
        if (!stationary) {
          turnIn -= elapsed;
          if (turnIn <= 0 || Math.hypot(target.x - coin.x, target.y - coin.y) < 2) {
            target = randomCoinTarget(width, height, random);
            turnIn = currentPhase === 'fast' ? 80 + random() * 100 : 800 + random() * 1000;
          }
          coin = moveCoin(coin, target, currentPhase, elapsed);
          trail.unshift({ ...coin });
          if (trail.length > 8) trail.pop();
        }
        ctx.clearRect(0, 0, width, height);
        if (!stationary) trail.slice(1).reverse().forEach((point, index) => paintCoin(point, (index + 1) * 0.045, true));
        paintCoin(coin, 1, false);
        drawn.current = { coin: { ...coin }, phase: currentPhase, width, height };
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); drawn.current = null; };
  }, [status]);

  const finish = (result: 'passed' | 'blocked') => {
    statusRef.current = result;
    setStatus(result);
    if (result === 'passed') onVerified();
  };

  return (
    <section className="coin-challenge space-y-3" aria-label="Atrapa la Moneda">
      <div className="flex items-center gap-2 font-semibold text-foreground">
        {status === 'passed' ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <ShieldCheck className="h-5 w-5 text-primary" />}
        <span>Atrapa la Moneda</span>
      </div>
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        {status === 'ready' && 'Espera a que la moneda vaya lenta y atrápala.'}
        {status === 'running' && (phase === 'fast' ? 'Fase rápida · Espera' : 'Fase lenta · Atrapa la moneda')}
        {status === 'passed' && 'Moneda atrapada. Puedes continuar.'}
        {status === 'blocked' && 'Intento bloqueado: captura en fase rápida. Vuelve a abrir esta pantalla para intentarlo de nuevo.'}
      </p>
      {status === 'ready' && <Button type="button" variant="outline" className="w-full" onClick={(event) => {
        keyboardRef.current = event.detail === 0;
        statusRef.current = 'running';
        setStatus('running');
      }}>Comenzar</Button>}
      {status === 'running' && (
        <Button ref={surfaceRef} type="button" variant="outline" className="coin-arena" aria-label="Atrapar moneda" aria-describedby="coin-keyboard-help"
          onPointerDown={(event) => {
            if (statusRef.current !== 'running' || event.button !== 0 || !event.isPrimary) return;
            const snapshot = drawn.current;
            if (!snapshot) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const tap = { x: (event.clientX - bounds.left) * snapshot.width / bounds.width, y: (event.clientY - bounds.top) * snapshot.height / bounds.height };
            const result = coinOutcome(snapshot.phase, snapshot.coin, tap);
            if (result !== 'miss') finish(result);
          }}
          onKeyDown={(event) => {
            keyboardRef.current = true;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            if (event.repeat || statusRef.current !== 'running' || !drawn.current) return;
            finish(drawn.current.phase === 'fast' ? 'blocked' : 'passed');
          }}>
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true" />
          <span id="coin-keyboard-help" className="sr-only">Con teclado: espera la fase lenta y pulsa Enter o espacio.</span>
        </Button>
      )}
      {status === 'blocked' && <ShieldAlert className="h-8 w-8 text-destructive" aria-hidden="true" />}
    </section>
  );
}