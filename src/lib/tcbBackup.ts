import {
  assertTcbSuccessor, createTcbSnapshot, decodeTcbPayload, encodeTcbPayload,
  TCB_GENESIS_HASH, tcbFilename, type TcbSnapshot,
} from "./tcbCodec";

/** Local bridge contract. It never exposes keys or ciphertext for export. */
export interface TcbVaultPort {
  read(options: { scope: string; cardId: string }): Promise<{ payload: string | null }>;
  write(options: { scope: string; cardId: string; payload: string; expectedHash: string | null }): Promise<void>;
}

export interface TcbBackupContext {
  /** Authenticated account ID; never a role, phone number, CVV or password. */
  ownerId: string;
  /** Stable backend/project namespace so draft and production files cannot collide. */
  backendId: string;
}

export interface TcbConfirmedBalance {
  cardId: string;
  balanceCents: number;
  /** Use a confirmed server snapshot timestamp, not the phone clock. */
  confirmedAtMs: number;
}

function fromBase64(encoded: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/]{142}==$/.test(encoded)) throw new Error("Invalid TCB bridge payload");
  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export async function tcbOwnerScope(context: TcbBackupContext): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.ownerId) ||
      !/^[a-zA-Z0-9._-]{1,128}$/.test(context.backendId)) {
    throw new Error("Invalid TCB account scope");
  }
  const bytes = new TextEncoder().encode(`tcb-v1:${context.backendId}:${context.ownerId.toLowerCase()}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Backup orchestrator only. Inputs must come from a confirmed owner-scoped server read.
 * Local hashes and timestamps are NOT financial authorization or anti-rollback anchors.
 */
export class TcbBackupStore {
  private tail: Promise<void> = Promise.resolve();
  private active = true;

  private readonly context: TcbBackupContext;

  constructor(private readonly port: TcbVaultPort, context: TcbBackupContext) {
    this.context = { ...context };
  }

  /** Call on sign-out/account change; queued writes cannot spill into another session. */
  close(): void { this.active = false; }

  private requireActive(): void {
    if (!this.active) throw new Error("TCB backup session closed");
  }

  async read(cardId: string): Promise<TcbSnapshot | null> {
    this.requireActive();
    tcbFilename(cardId);
    const scope = await tcbOwnerScope(this.context);
    this.requireActive();
    const result = await this.port.read({ scope, cardId });
    this.requireActive();
    return result.payload === null ? null : decodeTcbPayload(fromBase64(result.payload), cardId);
  }

  saveConfirmed(value: TcbConfirmedBalance): Promise<TcbSnapshot> {
    const confirmed = { ...value };
    const task = this.tail.then(() => this.save(confirmed));
    this.tail = task.then(() => undefined, () => undefined);
    return task;
  }

  private async save(value: TcbConfirmedBalance): Promise<TcbSnapshot> {
    this.requireActive();
    // Validate before any native call, including invalid cents and identifiers.
    await createTcbSnapshot({ cardId: value.cardId, balanceCents: value.balanceCents,
      timestampMs: value.confirmedAtMs, sequence: 0, previousHash: TCB_GENESIS_HASH });
    const prior = await this.read(value.cardId);
    if (prior && (value.confirmedAtMs < prior.timestampMs ||
        (value.confirmedAtMs === prior.timestampMs && value.balanceCents !== prior.balanceCents))) {
      throw new Error("TCB confirmed snapshot conflict");
    }
    if (prior && value.confirmedAtMs === prior.timestampMs && value.balanceCents === prior.balanceCents) return prior;
    const snapshot = await createTcbSnapshot({ cardId: value.cardId, balanceCents: value.balanceCents,
      timestampMs: value.confirmedAtMs, sequence: prior ? prior.sequence + 1 : 0,
      previousHash: prior?.currentHash ?? TCB_GENESIS_HASH });
    if (prior) await assertTcbSuccessor(prior, snapshot);
    const scope = await tcbOwnerScope(this.context);
    const payload = toBase64(await encodeTcbPayload(snapshot));
    this.requireActive();
    await this.port.write({ scope, cardId: value.cardId, payload, expectedHash: prior?.currentHash ?? null });
    this.requireActive();
    const persisted = await this.read(value.cardId);
    if (persisted?.currentHash !== snapshot.currentHash) throw new Error("TCB backup readback failed");
    return persisted;
  }
}