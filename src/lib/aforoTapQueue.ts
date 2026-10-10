type Confirmacion = { n: number; cap: number };

/** Immediate local feedback; only confirmed, sequential deltas reach other users. */
export class AforoTapQueue {
  private pending: (1 | -1)[] = [];
  private running = false;
  private n = 0;
  private cap = 4;
  revision = 0;

  constructor(
    private save: (delta: 1 | -1) => Promise<Confirmacion>,
    private show: (n: number) => void,
    private failed: (error: unknown) => void,
  ) {}

  get busy() { return this.running; }

  tap(delta: 1 | -1, initial: number, capacity: number) {
    if (!this.running) { this.n = initial; this.cap = capacity; }
    const projected = this.n + this.pending.reduce<number>((sum, d) => sum + d, 0) + delta;
    if (projected < 0 || projected > this.cap) return;
    this.revision++;
    this.pending.push(delta);
    this.show(projected);
    if (!this.running) void this.drain();
  }

  private async drain() {
    this.running = true;
    try {
      while (this.pending.length) {
        const delta = this.pending[0];
        if (delta === undefined) break;
        const confirmed = await this.save(delta);
        this.n = confirmed.n;
        this.cap = confirmed.cap;
        this.pending.shift();
        this.show(Math.max(0, Math.min(this.cap, this.n + this.pending.reduce<number>((sum, d) => sum + d, 0))));
      }
    } catch (error) {
      this.pending = [];
      this.show(this.n);
      this.failed(error);
    } finally {
      this.running = false;
    }
  }
}