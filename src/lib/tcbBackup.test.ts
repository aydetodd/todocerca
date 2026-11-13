import { test } from "node:test";
import { strict as assert } from "node:assert";
import { TcbBackupStore, tcbOwnerScope, type TcbVaultPort } from "./tcbBackup";
import { createTcbSnapshot, decodeTcbPayload, encodeTcbPayload, TCB_GENESIS_HASH } from "./tcbCodec";

const context = { ownerId: "00000000-0000-4000-8000-000000000001", backendId: "production" };
const balance = { cardId: "5226030000000001", balanceCents: 268706, confirmedAtMs: 1794442800000 };

/** In-memory port is a test double only; no app imports this file. */
class MemoryPort implements TcbVaultPort {
  values = new Map<string, string>();
  writes = 0;
  failNext = false;
  corruptReads = false;
  async read(options: { scope: string; cardId: string }) {
    const payload = this.values.get(`${options.scope}/${options.cardId}`) ?? null;
    return { payload: this.corruptReads && payload ? "!" : payload };
  }
  async write(options: { scope: string; cardId: string; payload: string; expectedHash: string | null }) {
    if (this.failNext) { this.failNext = false; throw new Error("write failed"); }
    const id = `${options.scope}/${options.cardId}`;
    const existing = this.values.get(id);
    const prior = existing ? await decodeTcbPayload(Uint8Array.from(atob(existing), (c) => c.charCodeAt(0)), options.cardId) : null;
    if ((prior?.currentHash ?? null) !== options.expectedHash) throw new Error("conflict");
    this.values.set(id, options.payload);
    this.writes++;
  }
}

test("native payload preserves exact cents and fixed 106-byte format", async () => {
  const snapshot = await createTcbSnapshot({ cardId: balance.cardId, balanceCents: 268706,
    timestampMs: balance.confirmedAtMs, sequence: 0, previousHash: TCB_GENESIS_HASH });
  const bytes = await encodeTcbPayload(snapshot);
  assert.equal(bytes.length, 106);
  assert.deepEqual(await decodeTcbPayload(bytes, balance.cardId), snapshot);
  const changed = bytes.slice(); changed[25] ^= 1;
  await assert.rejects(decodeTcbPayload(changed, balance.cardId));
  await assert.rejects(decodeTcbPayload(bytes.slice(0, -1), balance.cardId));
  await assert.rejects(decodeTcbPayload(bytes, "5226030000000002"));
});

test("save reads back the actual persisted snapshot and duplicate confirmation does not rewrite", async () => {
  const port = new MemoryPort(); const store = new TcbBackupStore(port, context);
  assert.equal(await store.read(balance.cardId), null);
  const snapshot = await store.saveConfirmed(balance);
  assert.equal(snapshot.balanceCents, 268706);
  assert.equal(snapshot.sequence, 0);
  assert.deepEqual(await store.read(balance.cardId), snapshot);
  assert.deepEqual(await store.saveConfirmed(balance), snapshot);
  assert.equal(port.writes, 1);
});

test("rapid confirmations serialize without losing cents or hash succession", async () => {
  const port = new MemoryPort(); const store = new TcbBackupStore(port, context);
  const snapshots = await Promise.all([0, 1, 2].map((i) => store.saveConfirmed({ ...balance,
    balanceCents: balance.balanceCents - i, confirmedAtMs: balance.confirmedAtMs + i })));
  assert.deepEqual(snapshots.map((s) => s.sequence), [0, 1, 2]);
  assert.equal(snapshots[2].previousHash, snapshots[1].currentHash);
  assert.equal((await store.read(balance.cardId))?.balanceCents, 268704);
});

test("Personal and Empresarial card identifiers keep distinct backups", async () => {
  const store = new TcbBackupStore(new MemoryPort(), context);
  await store.saveConfirmed(balance);
  await store.saveConfirmed({ ...balance, cardId: "5226030000000002", balanceCents: 0 });
  assert.equal((await store.read(balance.cardId))?.balanceCents, 268706);
  assert.equal((await store.read("5226030000000002"))?.balanceCents, 0);
});

test("owners and backend namespaces cannot read each other's backup", async () => {
  const port = new MemoryPort(); const store = new TcbBackupStore(port, context);
  await store.saveConfirmed(balance);
  for (const other of [{ ...context, ownerId: "00000000-0000-4000-8000-000000000002" }, { ...context, backendId: "draft" }]) {
    assert.equal(await new TcbBackupStore(port, other).read(balance.cardId), null);
    assert.notEqual(await tcbOwnerScope(context), await tcbOwnerScope(other));
  }
  await assert.rejects(tcbOwnerScope({ ...context, ownerId: "../owner" }));
  await assert.rejects(tcbOwnerScope({ ...context, backendId: "../project" }));
});

test("older or conflicting confirmations do not overwrite a confirmed backup", async () => {
  const port = new MemoryPort(); const store = new TcbBackupStore(port, context);
  await store.saveConfirmed(balance);
  await assert.rejects(store.saveConfirmed({ ...balance, confirmedAtMs: balance.confirmedAtMs - 1 }));
  await assert.rejects(store.saveConfirmed({ ...balance, balanceCents: 1 }));
  assert.equal(port.writes, 1);
});

test("failed write preserves previous file and retry cannot double advance", async () => {
  const port = new MemoryPort(); const store = new TcbBackupStore(port, context);
  await store.saveConfirmed(balance);
  const next = { ...balance, balanceCents: 268705, confirmedAtMs: balance.confirmedAtMs + 1 };
  port.failNext = true;
  await assert.rejects(store.saveConfirmed(next));
  assert.equal((await store.read(balance.cardId))?.sequence, 0);
  assert.equal((await store.saveConfirmed(next)).sequence, 1);
  assert.equal((await store.saveConfirmed(next)).sequence, 1);
  assert.equal(port.writes, 2);
});

test("invalid values or corrupt stored contents fail closed without new writes", async () => {
  const port = new MemoryPort(); const store = new TcbBackupStore(port, context);
  for (const change of [{ cardId: "../5226030000000001" }, { balanceCents: -1 }, { balanceCents: 1.1 }, { confirmedAtMs: NaN }]) {
    await assert.rejects(store.saveConfirmed({ ...balance, ...change }));
  }
  assert.equal(port.writes, 0);
  await store.saveConfirmed(balance);
  port.corruptReads = true;
  await assert.rejects(store.read(balance.cardId));
  await assert.rejects(store.saveConfirmed({ ...balance, confirmedAtMs: balance.confirmedAtMs + 1 }));
  assert.equal(port.writes, 1);
});

test("closed session prevents queued writes and reads", async () => {
  const port = new MemoryPort(); const store = new TcbBackupStore(port, context);
  const queued = store.saveConfirmed(balance);
  store.close();
  await assert.rejects(queued);
  await assert.rejects(store.read(balance.cardId));
  assert.equal(port.writes, 0);
});

test("write returning success without persistence is never reported as a saved backup", async () => {
  const port: TcbVaultPort = { async read() { return { payload: null }; }, async write() {} };
  await assert.rejects(new TcbBackupStore(port, context).saveConfirmed(balance), /readback/);
});

test("caller mutations cannot switch account or queued confirmed cents", async () => {
  const port = new MemoryPort();
  const account = { ...context };
  const value = { ...balance };
  const store = new TcbBackupStore(port, account);
  const task = store.saveConfirmed(value);
  account.ownerId = "00000000-0000-4000-8000-000000000002";
  value.balanceCents = 0;
  assert.equal((await task).balanceCents, 268706);
  assert.equal((await new TcbBackupStore(port, context).read(balance.cardId))?.balanceCents, 268706);
  assert.equal(await new TcbBackupStore(port, account).read(balance.cardId), null);
});