/** Binary backup codec only. A decoded snapshot is NOT proof of spendable funds. */
export interface TcbSnapshot {
  version: 1;
  cardId: string;
  balanceCents: number;
  timestampMs: number;
  sequence: number;
  previousHash: string;
  currentHash: string;
}

export type TcbSnapshotInput = Omit<TcbSnapshot, "version" | "currentHash">;

const HEADER_LENGTH = 17; // magic (4), envelope version (1), nonce (12)
const CONTENT_LENGTH = 106;
const HASH_OFFSET = 74;
const FILE_LENGTH = HEADER_LENGTH + CONTENT_LENGTH + 16; // GCM tag
const MAGIC = new Uint8Array([0x54, 0x43, 0x42, 0x00]);
export const TCB_GENESIS_HASH = "0".repeat(64);

function requireInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid TCB integer");
}

function requireCard(cardId: string): void {
  if (!/^[0-9]{16}$/.test(cardId)) throw new Error("Invalid TCB card identifier");
}

function hashBytes(hash: string): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("Invalid TCB hash");
  return Uint8Array.from(hash.match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16));
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

function encodeContent(input: TcbSnapshotInput): Uint8Array<ArrayBuffer> {
  requireCard(input.cardId);
  [input.balanceCents, input.timestampMs, input.sequence].forEach(requireInteger);
  if ((input.sequence === 0) !== (input.previousHash === TCB_GENESIS_HASH)) {
    throw new Error("Invalid TCB genesis reference");
  }
  const bytes = new Uint8Array(CONTENT_LENGTH);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 1);
  bytes.set(new TextEncoder().encode(input.cardId), 2);
  view.setBigUint64(18, BigInt(input.balanceCents));
  view.setBigUint64(26, BigInt(input.timestampMs));
  view.setBigUint64(34, BigInt(input.sequence));
  bytes.set(hashBytes(input.previousHash), 42);
  return bytes;
}

function requireKey(key: CryptoKey, usage: "encrypt" | "decrypt"): void {
  const algorithm = key.algorithm as AesKeyAlgorithm;
  if (key.type !== "secret" || key.extractable || algorithm.name !== "AES-GCM" ||
      algorithm.length !== 256 || !key.usages.includes(usage)) {
    throw new Error("TCB requires a non-exportable AES-256-GCM key");
  }
}

export function tcbFilename(cardId: string): string {
  requireCard(cardId);
  return `${cardId}.tcb`;
}

export async function createTcbSnapshot(input: TcbSnapshotInput): Promise<TcbSnapshot> {
  const bytes = encodeContent(input);
  const currentHash = hex(await crypto.subtle.digest("SHA-256", bytes.slice(0, HASH_OFFSET)));
  return { ...input, version: 1, currentHash };
}

/** The caller must obtain `previous` from a trusted checkpoint, not a restored local copy. */
export async function assertTcbSuccessor(previous: TcbSnapshot, next: TcbSnapshot): Promise<void> {
  for (const snapshot of [previous, next]) {
    const calculated = await createTcbSnapshot(snapshot);
    if (snapshot.version !== 1 || calculated.currentHash !== snapshot.currentHash) {
      throw new Error("Invalid TCB snapshot hash");
    }
  }
  if (next.cardId !== previous.cardId || next.sequence !== previous.sequence + 1 ||
      next.previousHash !== previous.currentHash || next.timestampMs < previous.timestampMs) {
    throw new Error("TCB checkpoint mismatch");
  }
}

/** No persistence, export, network or financial operation is performed here. */
export async function encodeTcbPayload(snapshot: TcbSnapshot): Promise<Uint8Array<ArrayBuffer>> {
  const checked = await createTcbSnapshot(snapshot);
  if (snapshot.version !== 1 || checked.currentHash !== snapshot.currentHash) {
    throw new Error("Invalid TCB snapshot hash");
  }
  const content = encodeContent(snapshot);
  content.set(hashBytes(snapshot.currentHash), HASH_OFFSET);
  return content;
}

/** For native vaults: plaintext crosses the local bridge, but keys never do. */
export async function decodeTcbPayload(payload: Uint8Array, expectedCardId: string): Promise<TcbSnapshot> {
  requireCard(expectedCardId);
  if (payload.length !== CONTENT_LENGTH) throw new Error("Invalid TCB payload size");
  const content = Uint8Array.from(payload);
  const view = new DataView(content.buffer);
  const snapshot: TcbSnapshot = {
    version: 1,
    cardId: new TextDecoder("utf-8", { fatal: true }).decode(content.slice(2, 18)),
    balanceCents: Number(view.getBigUint64(18)),
    timestampMs: Number(view.getBigUint64(26)),
    sequence: Number(view.getBigUint64(34)),
    previousHash: hex(content.slice(42, HASH_OFFSET).buffer),
    currentHash: hex(content.slice(HASH_OFFSET).buffer),
  };
  if (view.getUint16(0) !== 1 || snapshot.cardId !== expectedCardId) {
    throw new Error("TCB version or card mismatch");
  }
  const checked = await createTcbSnapshot(snapshot);
  if (checked.currentHash !== snapshot.currentHash) throw new Error("Invalid TCB snapshot hash");
  return snapshot;
}

export async function encryptTcb(snapshot: TcbSnapshot, key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  requireKey(key, "encrypt");
  const content = await encodeTcbPayload(snapshot);
  const header = new Uint8Array(HEADER_LENGTH);
  header.set(MAGIC);
  header[4] = 1;
  crypto.getRandomValues(header.subarray(5));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: header.slice(5), additionalData: header, tagLength: 128 }, key, content,
  );
  const file = new Uint8Array(FILE_LENGTH);
  file.set(header);
  file.set(new Uint8Array(ciphertext), HEADER_LENGTH);
  return file;
}

export async function decryptTcb(file: Uint8Array, key: CryptoKey, expectedCardId: string): Promise<TcbSnapshot> {
  requireKey(key, "decrypt");
  requireCard(expectedCardId);
  if (file.length !== FILE_LENGTH || !MAGIC.every((value, index) => file[index] === value) || file[4] !== 1) {
    throw new Error("Invalid TCB envelope");
  }
  // Own the buffers; never decrypt a mutable/shared caller buffer.
  const bytes = Uint8Array.from(file);
  const header = bytes.slice(0, HEADER_LENGTH);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: header.slice(5), additionalData: header, tagLength: 128 },
      key, bytes.slice(HEADER_LENGTH),
    );
  } catch {
    throw new Error("TCB authentication failed");
  }
  return decodeTcbPayload(new Uint8Array(plaintext), expectedCardId);
}