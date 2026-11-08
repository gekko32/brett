import { test } from 'node:test';
import assert from 'node:assert/strict';
import { klientDarf } from '../src/server/permissions';
import { gateMutation } from '../src/server/ws-handler';
import { filterSnapshotFigures, translateBroadcastForRole } from '../src/server/hidden-filter';

test('Klient: Bewegen, Drehen und Setzen sind erlaubt', () => {
  for (const m of [
    { type: 'join', room: 'r' },
    { type: 'move', id: 'f', x: 1, z: 2, facingY: 0.5 },
    { type: 'figure_lock', id: 'f' },
    { type: 'figure_unlock', id: 'f' },
    { type: 'update', id: 'f', changes: { preset: 'sit', boneOverrides: {} } },
    { type: 'update', id: 'f', changes: { preset: 'stand' } },
  ]) assert.equal(klientDarf(m), true, JSON.stringify(m));
});

test('Klient: alles andere ist verboten', () => {
  for (const m of [
    { type: 'add', figure: {} },
    { type: 'delete', id: 'f' },
    { type: 'clear' },
    { type: 'jump', id: 'f' },
    { type: 'undo' },
    { type: 'stiffness', value: 1 },
    { type: 'snapshot' },
    { type: 'figure_possess', figureId: 'f' },
    { type: 'figure_note_set', figureId: 'f', note: 'x' },
    { type: 'admin_moebel_set', moebel: [] },
    { type: 'admin_regiebuch_frage', text: 'x' },
    { type: 'update', id: 'f', changes: { label: 'x' } },
    { type: 'update', id: 'f', changes: { preset: 'sit', color: '#000' } },
    { type: 'update', id: 'f', changes: { preset: 'tanzen' } },
    { type: 'update', id: 'f', changes: { preset: 'sit', boneOverrides: { arm: {} } } },
    { type: 'update', id: 'f' },
    { type: 'move', id: 'f', x: Infinity, z: 0 },
    { type: 'move', id: 'f', x: 'a', z: 0 },
    {},
    null,
  ]) assert.equal(klientDarf(m), false, JSON.stringify(m));
});

const deps = (freeze: boolean) => ({
  buildStateFromMutations: () => ({ sessionCode: 'X', roles: {}, moderation: { freeze } }),
  figureMaps: new Map(),
  canMutate: () => { throw new Error('darf für Klienten nicht gefragt werden'); },
  resolveRole: () => 'beobachter',
}) as any;

test('Klient: Einfrieren sperrt auch ihn', () => {
  const ws = { _isKlient: true, _isZuschauer: true };
  assert.equal(gateMutation(ws, 'r', 'move', 'f', deps(false)), true);
  assert.equal(gateMutation(ws, 'r', 'move', 'f', deps(true)), false);
  assert.equal(gateMutation(ws, 'r', 'update', 'f', deps(true)), false);
  assert.equal(gateMutation(ws, 'r', 'figure_lock', 'f', deps(true)), false);
  assert.equal(gateMutation(ws, 'r', 'request_state_snapshot', undefined, deps(true)), true);
  assert.equal(gateMutation(ws, 'r', 'delete', 'f', deps(false)), false);
});

test('Zuschauer bleibt reiner Zuschauer', () => {
  const ws = { _isZuschauer: true };
  assert.equal(gateMutation(ws, 'r', 'move', 'f', deps(false)), false);
});

test('Notizen erreichen Zuschauer und Klienten nicht', () => {
  const f = { id: 'f', x: 0, z: 0, note: 'geheim' } as any;
  assert.equal('note' in filterSnapshotFigures([f], 'zuschauer')[0], false);
  assert.equal(filterSnapshotFigures([f], 'leiter')[0], f);
  assert.equal(translateBroadcastForRole({ type: 'figure_note_changed', figureId: 'f', note: 'x' }, 'zuschauer', () => null), null);
  const add: any = translateBroadcastForRole({ type: 'add', figure: f }, 'zuschauer', () => null);
  assert.equal('note' in add.figure, false);
  const fuerLeiter: any = translateBroadcastForRole({ type: 'add', figure: f }, 'leiter', () => null);
  assert.equal(fuerLeiter.figure.note, 'geheim');
});
