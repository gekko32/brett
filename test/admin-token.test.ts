// brett/test/admin-token.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildStateFromMutations,
  assignAdminToken,
  handoffAdminToken,
  releaseAdminToken,
  getAdminTokenHolder,
  beginTokenGrace,
  reclaimAdminToken,
  setRoomAdminPresence,
  handleAdminHandoffMessage,
} from '../src/server/index';

test('assignAdminToken: sets holder when none exists', () => {
  const room = 'token-test-1';
  const result = assignAdminToken(room, 'leitung-a');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(buildStateFromMutations(room).adminTokenHolder, 'leitung-a');
});

test('assignAdminToken: returns ok=false when holder already set (no force)', () => {
  const room = 'token-test-2';
  assignAdminToken(room, 'leitung-a');
  const result = assignAdminToken(room, 'leitung-b');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(buildStateFromMutations(room).adminTokenHolder, 'leitung-a');
});

test('handoffAdminToken: holder leitung-a → leitung-b succeeds', () => {
  const room = 'token-test-3';
  assignAdminToken(room, 'leitung-a');
  const result = handoffAdminToken(room, 'leitung-a', 'leitung-b');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(buildStateFromMutations(room).adminTokenHolder, 'leitung-b');
});

test('handoffAdminToken: rejects when fromPlayerId != current holder', () => {
  const room = 'token-test-4';
  assignAdminToken(room, 'leitung-a');
  const result = handoffAdminToken(room, 'leitung-b', 'leitung-a');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'not-current-holder');
});

test('releaseAdminToken: clears holder', () => {
  const room = 'token-test-5';
  assignAdminToken(room, 'leitung-a');
  releaseAdminToken(room);
  assert.strictEqual(buildStateFromMutations(room).adminTokenHolder, undefined);
});

test('beginTokenGrace: starts 30s timer; reclaim within window restores holder', async () => {
  const room = 'token-grace-1';
  assignAdminToken(room, 'leitung-a');
  beginTokenGrace(room, 'leitung-a', { timeoutMs: 100 }); // shortened for test
  // Within grace: holder still set
  assert.strictEqual(getAdminTokenHolder(room), 'leitung-a');
  // Reclaim before timeout
  reclaimAdminToken(room, 'leitung-a');
  await new Promise(r => setTimeout(r, 150));
  assert.strictEqual(getAdminTokenHolder(room), 'leitung-a', 'reclaim should keep holder');
});

test('beginTokenGrace: 30s expiry without reclaim → token released', async () => {
  const room = 'token-grace-2';
  assignAdminToken(room, 'leitung-a');
  beginTokenGrace(room, 'leitung-a', { timeoutMs: 50 });
  await new Promise(r => setTimeout(r, 100));
  assert.strictEqual(getAdminTokenHolder(room), null, 'grace expired → released');
});

test('beginTokenGrace expiry: auto-claim to other admin present in room', async () => {
  const room = 'token-grace-3';
  assignAdminToken(room, 'leitung-a');
  // Simulate leitung-b present as admin in the room
  setRoomAdminPresence(room, ['leitung-a', 'leitung-b']);
  beginTokenGrace(room, 'leitung-a', { timeoutMs: 50 });
  await new Promise(r => setTimeout(r, 100));
  assert.strictEqual(getAdminTokenHolder(room), 'leitung-b', 'leitung-b auto-claims after grace expiry');
});

test('handleAdminHandoffMessage: leitung-a hands off → leitung-b, broadcast fired', () => {
  const room = 'handoff-test-1';
  assignAdminToken(room, 'leitung-a');
  const broadcasts: any[] = [];
  const result = handleAdminHandoffMessage(room, 'leitung-a', 'leitung-b', (msg: any) => broadcasts.push(msg));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(getAdminTokenHolder(room), 'leitung-b');
  assert.deepStrictEqual(broadcasts, [{
    type: 'admin_token_changed', holderPlayerId: 'leitung-b', reason: 'handoff'
  }]);
});
