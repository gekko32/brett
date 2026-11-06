// Klientenbezug, Kopie, Vergleich (Gerald 06.11.2026, BRETT-ABGLEICH-1A.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  istUuid, plusTage, heuteIso, alsIso, brauchtErinnerung, parseKlientPatch, SPAETER_TAGE,
} from '../src/server/routes/klienten';
import { buildSnapshotListQuery, parseSnapshotInsert, kopieName } from '../src/server/routes/snapshots';
import { planAusState, gemeinsamerRahmen, blick, nurInEinem } from '../src/client/vergleich-modell';

const ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

// ── Klient ──────────────────────────────────────────────────────────────────
test('K1 istUuid: nur echte UUIDs', () => {
  assert.equal(istUuid(ID), true);
  assert.equal(istUuid('abc'), false);
  assert.equal(istUuid("x'; DROP TABLE customers;--"), false);
  assert.equal(istUuid(undefined), false);
});

test('K2 plusTage: Monats- und Jahreswechsel', () => {
  assert.equal(plusTage('2026-11-06', SPAETER_TAGE), '2027-02-04');
  assert.equal(plusTage('2026-12-31', 1), '2027-01-01');
  assert.equal(plusTage('2028-02-28', 1), '2028-02-29');
});

test('K3 heuteIso / alsIso', () => {
  assert.equal(heuteIso(new Date(2026, 10, 6, 23, 30)), '2026-11-06');
  assert.equal(alsIso('2026-11-06T00:00:00.000Z'), '2026-11-06');
  assert.equal(alsIso(null), null);
  assert.equal(alsIso('kaputt'), null);
});

test('K4 Erinnerung nur nach Ende der Begleitung und wenn noch Daten da sind', () => {
  const basis = { begleitung_ende: '2026-11-01', erinnerung_ab: null, aufstellungen: 2, sitzungen: 1 };
  assert.equal(brauchtErinnerung(basis, '2026-11-06'), true);
  assert.equal(brauchtErinnerung({ ...basis, begleitung_ende: null }, '2026-11-06'), false, 'Begleitung läuft');
  assert.equal(brauchtErinnerung({ ...basis, begleitung_ende: '2026-12-01' }, '2026-11-06'), false, 'Ende in der Zukunft');
  assert.equal(brauchtErinnerung({ ...basis, aufstellungen: 0, sitzungen: 0 }, '2026-11-06'), false, 'nichts mehr gespeichert');
  assert.equal(brauchtErinnerung({ ...basis, erinnerung_ab: '2027-02-04' }, '2026-11-06'), false, 'später erinnern');
  assert.equal(brauchtErinnerung({ ...basis, erinnerung_ab: '2026-11-06' }, '2026-11-06'), true, 'Verschiebung abgelaufen');
});

test('K5 parseKlientPatch', () => {
  assert.deepEqual(parseKlientPatch({ spaeter: true }), { art: 'spaeter' });
  assert.deepEqual(parseKlientPatch({ begleitung_ende: '2026-11-01' }), { art: 'ende', begleitung_ende: '2026-11-01' });
  assert.deepEqual(parseKlientPatch({ begleitung_ende: null }), { art: 'ende', begleitung_ende: null });
  assert.deepEqual(parseKlientPatch({ begleitung_ende: '' }), { art: 'ende', begleitung_ende: null });
  assert.equal(parseKlientPatch({ begleitung_ende: '1.11.2026' }), null);
  assert.equal(parseKlientPatch({}), null);
  assert.equal(parseKlientPatch(null), null);
});

// ── Gespeicherte Aufstellungen ──────────────────────────────────────────────
test('K6 Liste ohne Klient zeigt nur Aufstellungen ohne Zuordnung', () => {
  const q = buildSnapshotListQuery({ savedOnly: true, ohneKlient: true });
  assert.equal(q.valid, true);
  assert.match(q.sql, /is_template = false AND customer_id IS NULL/);
  const k = buildSnapshotListQuery({ customerId: ID });
  assert.match(k.sql, /customer_id = \$1/);
  assert.deepEqual(k.args, [ID]);
});

test('K7 parseSnapshotInsert: Klient und Herkunft müssen UUIDs sein', () => {
  const ok = parseSnapshotInsert({ name: 'A', state: { figures: [] }, customer_id: ID, kopie_von: ID });
  assert.equal(ok.valid, true);
  assert.equal(ok.values?.customer_id, ID);
  assert.equal(ok.values?.kopie_von, ID);
  assert.equal(parseSnapshotInsert({ name: 'A', state: { figures: [] }, customer_id: 'M0001' }).valid, false);
  assert.equal(parseSnapshotInsert({ name: 'A', state: { figures: [] }, kopie_von: 'x' }).valid, false);
  assert.equal(parseSnapshotInsert({ name: 'A', state: { figures: [] } }).values?.kopie_von, null);
});

test('K8 kopieName', () => {
  assert.equal(kopieName('Heute'), 'Heute – Kopie');
  assert.equal(kopieName('Heute', '  Zukunft A '), 'Zukunft A');
  assert.equal(kopieName('x'.repeat(199)).length, 200);
});

// ── Vergleich ───────────────────────────────────────────────────────────────
test('K9 planAusState: fehlertolerant, verdeckte und Hilfsfiguren fehlen', () => {
  assert.deepEqual(planAusState(null), { figuren: [], zonen: [], anker: [], linien: [], moebel: [] });
  const p = planAusState({
    figures: [
      { id: 'a', x: 1, z: 2, label: 'Ich' },
      { id: 'b', x: 'kaputt', label: 'Mutter', hidden: true },
      { id: '__coaching_steps__', steps: [] },
      { id: 'c', x: -1, z: 0, label: 'Vater', color: '#123456' },
    ],
    lines: [{ fromId: 'a', toId: 'c', lineType: 'tension', art: 'Konflikt' }, { fromId: 'a', toId: 'b' }, { fromId: 'a', toId: 'c', struktur: true }],
    zones: { z1: { x: 0, z: 0, shape: 'circle', radius: 3, variant: 'frame' } },
  });
  assert.deepEqual(p.figuren.map(f => f.label), ['Ich', 'Vater']);
  assert.equal(p.figuren[1].color, '#123456');
  assert.equal(p.linien.length, 1, 'Linie zu verdeckter Figur und Stammbaumlinie fehlen');
  assert.equal(p.linien[0].label, 'Konflikt');
  assert.equal(p.zonen[0].frame, true);
});

test('K10 gemeinsamer Rahmen umfasst beide Pläne und ist quadratisch', () => {
  const a = planAusState({ figures: [{ id: 'a', x: -4, z: 0 }] });
  const b = planAusState({ figures: [{ id: 'b', x: 6, z: 1 }] });
  const r = gemeinsamerRahmen([a, b]);
  assert.ok(r.minX <= -4.3 && r.maxX >= 6.3);
  assert.ok(Math.abs((r.maxX - r.minX) - (r.maxZ - r.minZ)) < 1e-9);
  const leer = gemeinsamerRahmen([]);
  assert.ok(leer.maxX - leer.minX >= 4);
});

test('K11 Blickrichtung: vorn = +Z, facingY wie THREE rotation.y', () => {
  const v0 = blick(0);
  assert.ok(Math.abs(v0.dx) < 1e-9 && Math.abs(v0.dz - 1) < 1e-9);
  const v90 = blick(Math.PI / 2);
  assert.ok(Math.abs(v90.dx - 1) < 1e-9 && Math.abs(v90.dz) < 1e-9);
});

test('K12 nurInEinem nennt nur Tatsachen (Namen), keine Bewertung', () => {
  const a = planAusState({ figures: [{ id: '1', label: 'Ich' }, { id: '2', label: 'Chef' }] });
  const b = planAusState({ figures: [{ id: '1', label: 'Ich' }, { id: '3', label: 'Ressource' }] });
  assert.deepEqual(nurInEinem(a, b), { nurA: ['Chef'], nurB: ['Ressource'] });
});
