// Möbel und Wände (Gerald 06.11.2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMutation, buildStateFromMutations } from '../src/server/index';
import { seedFigureMapFromState, seedFiguresFromTemplate } from '../src/server/figures';
import { normalisiereMoebel, grundriss, stuehleUmTisch, MAX_MOEBEL } from '../src/types/moebel';
import { freierMoebelPlatz, raumAusWaenden } from '../src/client/pult-moebel';
import { planAusState } from '../src/client/vergleich-modell';

test('M1 normalisiereMoebel: unbekannte Art, fehlende ID, doppelte ID fallen weg; Werte begrenzt', () => {
  const l = normalisiereMoebel([
    { id: 'a', art: 'tisch', x: 1, z: 2, facingY: 0, laenge: 99 },
    { id: 'b', art: 'thron', x: 0, z: 0 },
    { art: 'stuhl', x: 0, z: 0 },
    { id: 'a', art: 'stuhl', x: 0, z: 0 },
    { id: 'c', art: 'wand', x: 500, z: -500, facingY: 'x', laenge: 0.1 },
    { id: "x'; DROP", art: 'stuhl' },
  ]);
  assert.deepEqual(l.map(m => m.id), ['a', 'c']);
  assert.equal(l[0].laenge, 6, 'Tischlänge höchstens 6');
  assert.deepEqual([l[1].x, l[1].z, l[1].facingY, l[1].laenge], [19, -19, 0, 0.5]);
  assert.deepEqual(normalisiereMoebel('kaputt'), []);
});

test('M2 Obergrenze und Stühle ohne Länge', () => {
  const viele = Array.from({ length: 200 }, (_, i) => ({ id: 's' + i, art: 'stuhl', x: 0, z: 0 }));
  assert.equal(normalisiereMoebel(viele).length, MAX_MOEBEL);
  assert.equal(normalisiereMoebel([{ id: 's', art: 'stuhl', laenge: 5 }])[0].laenge, undefined);
  assert.deepEqual(grundriss({ art: 'wand', laenge: 7 }), { breite: 7, tiefe: 0.12 });
});

test('M3 Stühle um den Tisch schauen zur Tischmitte', () => {
  let n = 0;
  for (const art of ['tisch', 'rundtisch'] as const) {
    const tisch = { id: 't', art, x: 2, z: -1, facingY: 0.7, laenge: 1.6 };
    const st = stuehleUmTisch(tisch, 4, () => 'st' + n++);
    assert.equal(st.length, 4);
    for (const s of st) {
      const blickX = Math.sin(s.facingY), blickZ = Math.cos(s.facingY);
      const zurMitte = { x: tisch.x - s.x, z: tisch.z - s.z };
      const l = Math.hypot(zurMitte.x, zurMitte.z);
      assert.ok(l > 0.5, 'Stuhl nicht im Tisch');
      assert.ok((blickX * zurMitte.x + blickZ * zurMitte.z) / l > 0.95, 'Blick zum Tisch');
    }
  }
});

test('M4 Raum aus Wänden und freier Platz', () => {
  const r = raumAusWaenden(8, 6);
  assert.equal(r.length, 4);
  assert.ok(r.every(w => w.art === 'wand'));
  const p = freierMoebelPlatz([{ x: 0, z: 0 }]);
  assert.ok(Math.hypot(p.x, p.z) >= 1.2);
});

test('M5 Server: setzen, leeren, außerhalb der Figuren, Neustart, Vorlage', () => {
  const room = 'moebel-1';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0 } });
  applyMutation(room, { type: 'moebel_set', moebel: [{ id: 't1', art: 'tisch', x: 1, z: 1, facingY: 0 }] });
  let st = buildStateFromMutations(room);
  assert.equal(st.moebel.length, 1);
  assert.equal(st.figures.length, 1);
  const map = new Map<string, any>();
  seedFigureMapFromState(map, st);
  assert.equal(map.get('__moebel__')?.moebel[0].id, 't1');
  // Vorlage ohne Möbel räumt auf, Vorlage mit Möbeln bringt sie mit
  seedFiguresFromTemplate(room, { figures: [] });
  assert.deepEqual(buildStateFromMutations(room).moebel, []);
  seedFiguresFromTemplate(room, { figures: [], moebel: [{ id: 'w', art: 'wand', x: 0, z: 2, facingY: 0, laenge: 4 }] });
  st = buildStateFromMutations(room);
  assert.equal(st.moebel[0].art, 'wand');
  applyMutation(room, { type: 'moebel_set', moebel: [] });
  assert.deepEqual(buildStateFromMutations(room).moebel, []);
});

test('M6 Vergleich zeichnet Möbel mit echten Maßen', () => {
  const p = planAusState({ figures: [], moebel: [{ id: 'w', art: 'wand', x: 0, z: 0, facingY: 0, laenge: 5 }, { id: 'q', art: 'quatsch' }] });
  assert.equal(p.moebel.length, 1);
  assert.equal(p.moebel[0].breite, 5);
});
