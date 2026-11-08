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

// ── Tablet und Sitzen (06.11.2026) ───────────────────────────────────────────
import { _onPointerDown, _onPointerMove, _onPointerUp, _resetTouchState, _getTouchMode, type TouchDeps } from '../src/client/touch-handler';
import { sitzplaetze, istBesetzt } from '../src/types/moebel';
import { PRESETS } from '../src/client/presets';

function touchDeps(over: Partial<TouchDeps> = {}): { deps: TouchDeps; log: string[] } {
  const log: string[] = [];
  const deps: TouchDeps = {
    pickContactAt: () => null, canDragFigure: () => true,
    startFigureDrag: () => log.push('fig-start'), moveFigureDrag: () => log.push('fig-move'), endFigureDrag: () => log.push('fig-end'),
    getOrbitDist: () => 10, setOrbitDist: () => {}, applyOrbitDelta: () => log.push('orbit'),
    capturePointer: () => {}, releasePointer: () => {},
    pickMoebelAt: () => 'tisch-1',
    startMoebelDrag: (id) => { log.push('m-start:' + id); return true; },
    moveMoebelDrag: () => log.push('m-move'),
    endMoebelDrag: () => log.push('m-end'),
    ...over,
  };
  return { deps, log };
}

test('M7 Finger auf Möbel verschiebt es, statt die Ansicht zu drehen', () => {
  _resetTouchState();
  const { deps, log } = touchDeps();
  _onPointerDown({ pointerId: 1, clientX: 10, clientY: 10, isPrimary: true }, deps);
  assert.equal(_getTouchMode(), 'moebel');
  _onPointerMove({ pointerId: 1, clientX: 30, clientY: 10 }, deps);
  _onPointerUp({ pointerId: 1, clientX: 30, clientY: 10 }, deps);
  assert.deepEqual(log, ['m-start:tisch-1', 'm-move', 'm-end']);
  assert.equal(_getTouchMode(), null);
});

test('M8 Figur hat Vorrang vor Möbeln; ohne Möbel dreht der Finger die Ansicht', () => {
  _resetTouchState();
  const a = touchDeps({ pickContactAt: () => ({ fig: 'f1' }) });
  _onPointerDown({ pointerId: 1, clientX: 0, clientY: 0, isPrimary: true }, a.deps);
  assert.equal(_getTouchMode(), 'figure');
  _onPointerUp({ pointerId: 1, clientX: 0, clientY: 0 }, a.deps);
  _resetTouchState();
  const b = touchDeps({ pickMoebelAt: () => null });
  _onPointerDown({ pointerId: 1, clientX: 0, clientY: 0, isPrimary: true }, b.deps);
  assert.equal(_getTouchMode(), 'orbit');
  _resetTouchState();
});

test('M9 Zweiter Finger beendet das Möbel-Ziehen und zoomt', () => {
  _resetTouchState();
  const { deps, log } = touchDeps();
  _onPointerDown({ pointerId: 1, clientX: 0, clientY: 0, isPrimary: true }, deps);
  _onPointerDown({ pointerId: 2, clientX: 50, clientY: 0, isPrimary: false }, deps);
  assert.equal(_getTouchMode(), 'pinch');
  _resetTouchState();
  assert.ok(log.includes('m-start:tisch-1'));
});

test('M10 Sitzplätze: Stuhl, Sessel, Bank (mehrere), Tisch/Wand keine', () => {
  const liste = normalisiereMoebel([
    { id: 's', art: 'stuhl', x: 1, z: 1, facingY: 0 },
    { id: 'k', art: 'sessel', x: 3, z: 0, facingY: Math.PI },
    { id: 'b', art: 'bank', x: 0, z: 3, facingY: 0, laenge: 2 },
    { id: 't', art: 'tisch', x: 0, z: 0, facingY: 0 },
    { id: 'w', art: 'wand', x: 0, z: -3, facingY: 0 },
  ]);
  const p = sitzplaetze(liste);
  assert.deepEqual(p.map(x => x.name), ['Stuhl 1', 'Sessel 1', 'Bank 1, Platz 1', 'Bank 1, Platz 2', 'Bank 1, Platz 3']);
  // Stuhl schaut nach +Z → Hüfte etwas dahinter (z kleiner), gleiche Blickrichtung wie der Stuhl
  assert.deepEqual([p[0].x, p[0].z, p[0].facingY], [1, 0.85, 0]);
  // Sessel um 180° gedreht → Hüfte liegt auf der anderen Seite
  assert.ok(p[1].z > 0);
  assert.equal(istBesetzt(p[0], [{ id: 'f1', x: 1, z: 0.9 }]), true);
  assert.equal(istBesetzt(p[0], [{ id: 'f1', x: 1, z: 0.9 }], 'f1'), false, 'eigene Figur zählt nicht');
});

test('M11 Haltung Sitzen: Oberschenkel waagrecht, Knie rechtwinklig', () => {
  const s = PRESETS.sit;
  assert.ok(s, 'Haltung sit fehlt');
  assert.ok(Math.abs(s.lHip.x + Math.PI / 2) < 0.01 && Math.abs(s.lKnee.x - Math.PI / 2) < 0.01);
  assert.equal(Object.keys(s).length, Object.keys(PRESETS.stand).length);
});

// ── Hinsetzen, Mitnehmen, Rückkehr (08.11.2026) ─────────────────────────────
import { naechsterSitzplatz, sitztAufPlatz, sitzendeAuf, mitnehmen } from '../src/types/moebel';
import { sollNeuLaden } from '../src/client/bildschirm-rueckkehr';
import { istKlientenAdresse } from '../src/client/klient-ansicht';

const stuhl = { id: 's', art: 'stuhl' as const, x: 1, z: 1, facingY: 0 };

test('M12 Figur nahe am freien Stuhl rastet ein, besetzter oder ferner Stuhl nicht', () => {
  const f = { id: 'f1', x: 1.2, z: 1 };
  assert.equal(naechsterSitzplatz([stuhl], f, [f])?.moebelId, 's');
  assert.equal(naechsterSitzplatz([stuhl], { id: 'f1', x: 3, z: 3 }, [f]), null, 'zu weit weg');
  const besetzt = { id: 'f2', x: 1, z: 0.85 };
  assert.equal(naechsterSitzplatz([stuhl], f, [f, besetzt]), null, 'schon besetzt');
});

test('M13 Sitzende werden beim Verschieben und Drehen mitgenommen, Stehende nicht', () => {
  const sitzt = { id: 'a', x: 1, z: 0.85, preset: 'sit' };
  const steht = { id: 'b', x: 1, z: 0.85, preset: 'stand' };
  assert.equal(sitztAufPlatz([stuhl], sitzt), true);
  assert.equal(sitztAufPlatz([stuhl], steht), false);
  assert.deepEqual(sitzendeAuf(stuhl, [sitzt, steht]).map(f => f.id), ['a']);
  assert.deepEqual(mitnehmen(stuhl, { ...stuhl, x: 3 }, [sitzt, steht]), [{ id: 'a', x: 3, z: 0.85, facingY: 0 }]);
  const [d] = mitnehmen(stuhl, { ...stuhl, facingY: Math.PI }, [sitzt]);
  assert.ok(Math.abs(d.z - 1.15) < 0.01 && d.facingY === Math.PI, 'gedreht: Hüfte auf der anderen Seite');
});

test('M14 Bank verkürzt: Platz weg, Figur wird nicht mitgenommen', () => {
  const bank = { id: 'b', art: 'bank' as const, x: 0, z: 0, facingY: 0, laenge: 2 };
  const p = sitzplaetze([bank]);
  assert.equal(p.length, 3);
  const f = { id: 'a', x: p[2].x, z: p[2].z, preset: 'sit' };
  assert.deepEqual(mitnehmen(bank, { ...bank, laenge: 1 }, [f]), []);
});

test('M15 Rückkehr ans Handy: Grafik verloren → neu laden, sonst nicht, kein Endlos-Neuladen', () => {
  const basis = { sichtbar: true, grafikVerloren: false, verbindungWeg: false, wegMs: 60000, seitNeustartMs: 60000 };
  assert.equal(sollNeuLaden({ ...basis, grafikVerloren: true }), true);
  assert.equal(sollNeuLaden(basis), false, 'alles in Ordnung');
  assert.equal(sollNeuLaden({ ...basis, grafikVerloren: true, sichtbar: false }), false, 'erst wenn wieder sichtbar');
  assert.equal(sollNeuLaden({ ...basis, grafikVerloren: true, seitNeustartMs: 3000 }), false, 'keine Endlosschleife');
  assert.equal(sollNeuLaden({ ...basis, verbindungWeg: true }), true, 'lange weg und keine Verbindung');
  assert.equal(sollNeuLaden({ ...basis, verbindungWeg: true, wegMs: 3000 }), false, 'kurzer Wechsel: Verbindung kommt von selbst');
});

test('M16 Klienten-Adresse: nur genau /k/<32 Zeichen>', () => {
  assert.equal(istKlientenAdresse('/k/' + 'a'.repeat(32)), true);
  assert.equal(istKlientenAdresse('/k/abc'), false);
  assert.equal(istKlientenAdresse('/k/' + 'a'.repeat(32) + '/x'), false);
  assert.equal(istKlientenAdresse('/'), false);
});
