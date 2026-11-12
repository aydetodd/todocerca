import { test } from "node:test";
import { strict as assert } from "node:assert";
import { assertTcbSuccessor, createTcbSnapshot, decryptTcb, encryptTcb, tcbFilename, TCB_GENESIS_HASH } from "./tcbCodec";

const input = { cardId: "5226030000000001", balanceCents: 268706, timestampMs: 1794442800000, sequence: 0, previousHash: TCB_GENESIS_HASH };
const key = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

test("filename is exactly 16 digits plus .tcb; no path injection", () => {
  assert.equal(tcbFilename(input.cardId), "5226030000000001.tcb");
  for (const value of ["../5226030000000001", "522603000000001", "52260300000000011", "522603000000000a"]) {
    assert.throws(() => tcbFilename(value));
  }
});

test("binary authenticated backup preserves every field and cents", async () => {
  const snapshot = await createTcbSnapshot(input);
  const secret = await key();
  const file = await encryptTcb(snapshot, secret);
  assert.equal(file.length, 139);
  assert.deepEqual(await decryptTcb(file, secret, input.cardId), snapshot);
  assert.equal(new TextDecoder().decode(file).includes(input.cardId), false);
});

test("each rewrite uses a fresh nonce and ciphertext", async () => {
  const snapshot = await createTcbSnapshot(input);
  const secret = await key();
  const first = await encryptTcb(snapshot, secret);
  const second = await encryptTcb(snapshot, secret);
  assert.notDeepEqual(first.slice(5, 17), second.slice(5, 17));
  assert.notDeepEqual(first.slice(17), second.slice(17));
});

test("tampering at any byte is rejected", async () => {
  const secret = await key();
  const file = await encryptTcb(await createTcbSnapshot(input), secret);
  for (let index = 0; index < file.length; index++) {
    const changed = file.slice(); changed[index] ^= 1;
    await assert.rejects(decryptTcb(changed, secret, input.cardId));
  }
});

test("wrong key, card, truncated and appended files are rejected", async () => {
  const secret = await key();
  const file = await encryptTcb(await createTcbSnapshot(input), secret);
  await assert.rejects(decryptTcb(file, await key(), input.cardId));
  await assert.rejects(decryptTcb(file, secret, "5226030000000002"));
  await assert.rejects(decryptTcb(file.slice(0, -1), secret, input.cardId));
  await assert.rejects(decryptTcb(new Uint8Array([...file, 0]), secret, input.cardId));
});

test("all six input fields affect the hash", async () => {
  const base = { ...input, sequence: 1, previousHash: "a".repeat(64) };
  const original = await createTcbSnapshot(base);
  for (const change of [{ cardId: "5226030000000002" }, { balanceCents: 268707 }, { timestampMs: input.timestampMs + 1 }, { sequence: 2 }, { previousHash: "b".repeat(64) }]) {
    assert.notEqual((await createTcbSnapshot({ ...base, ...change })).currentHash, original.currentHash);
  }
});

test("invalid cents, timestamps, sequences and genesis are rejected", async () => {
  for (const field of ["balanceCents", "timestampMs", "sequence"]) {
    for (const value of [-1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(createTcbSnapshot({ ...input, [field]: value }));
    }
  }
  await assert.rejects(createTcbSnapshot({ ...input, previousHash: "a".repeat(64) }));
  await assert.rejects(createTcbSnapshot({ ...input, sequence: 1 }));
});

test("trusted checkpoint rejects replay, skipped sequence, different card and time reversal", async () => {
  const previous = await createTcbSnapshot(input);
  const nextInput = { ...input, sequence: 1, previousHash: previous.currentHash, balanceCents: 268606 };
  const next = await createTcbSnapshot(nextInput);
  await assertTcbSuccessor(previous, next);
  await assert.rejects(assertTcbSuccessor(previous, previous));
  for (const change of [{ sequence: 2 }, { cardId: "5226030000000002" }, { previousHash: "a".repeat(64) }, { timestampMs: input.timestampMs - 1 }]) {
    await assert.rejects(assertTcbSuccessor(previous, await createTcbSnapshot({ ...nextInput, ...change })));
  }
});

test("modified snapshot cannot be encrypted with its old hash", async () => {
  const snapshot = await createTcbSnapshot(input);
  await assert.rejects(encryptTcb({ ...snapshot, balanceCents: 268707 }, await key()));
});

test("exportable and weaker keys are rejected", async () => {
  const snapshot = await createTcbSnapshot(input);
  for (const [length, extractable] of [[256, true], [128, false]] as const) {
    const secret = await crypto.subtle.generateKey({ name: "AES-GCM", length }, extractable, ["encrypt", "decrypt"]);
    await assert.rejects(encryptTcb(snapshot, secret));
  }
});