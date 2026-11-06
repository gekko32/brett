// Regiebuch (Gerald 06.11.2026, Baustein 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMutation, buildStateFromMutations } from '../src/server/index';
import { seedFigureMapFromState } from '../src/server/figures';
import { parseRegiebuch, fassungTitel } from '../src/server/routes/regiebuecher';
import {
  starte, gehe, istLetzter, brettText, speicherName, fragenAusText, laufAusSpeicher,
} from '../src/client/regiebuch-ablauf';
import { readFileSync } from 'fs';

const buch = {
  id: 'rb-test', titel: 'Mein Platz im System',
  schritte: [
    { titel: 'Aufbauen', anleitung: '', fragen: ['Wer gehört dazu?', 'Wo stehst du?'], speicherpunkt: false },
    { titel: 'Beschreiben', anleitung: '', fragen: ['Was fällt dir auf?'], speicherpunkt: true },
    { titel: 'Festhalten', anleitung: '', fragen: [], speicherpunkt: false },
  ],
};

// ── Ablauf ──────────────────────────────────────────────────────────────────
test('R1 Start: erster Schritt, keine Frage auf dem Brett, Schalter wie gewählt', () => {
  assert.deepEqual(starte(buch), { id: 'rb-test', index: 0, frageAn: false, frageIndex: null });
  assert.equal(starte(buch, true).frageAn, true);
});

test('R2 Überspringen und zurück, Grenzen werden eingehalten', () => {
  let l = starte(buch);
  l = gehe(l, buch, 2);
  assert.equal(l.index, 2);
  assert.equal(istLetzter(l, buch), true);
  assert.equal(gehe(l, buch, 9).index, 2);
  assert.equal(gehe(l, buch, -3).index, 0);
});

test('R3 Schrittwechsel nimmt die Frage vom Brett', () => {
  const l = { ...starte(buch, true), frageIndex: 1 };
  assert.equal(brettText(l, buch), 'Wo stehst du?');
  assert.equal(gehe(l, buch, 1).frageIndex, null);
});

test('R4 Schalter aus: nichts auf dem Brett, auch wenn eine Frage gewählt war', () => {
  const l = { ...starte(buch, false), frageIndex: 0 };
  assert.equal(brettText(l, buch), null);
  assert.equal(brettText(null, buch), null);
  assert.equal(brettText({ ...l, frageAn: true, frageIndex: 7 }, buch), null);
});

test('R5 Speicherpunkt-Name und Fragen aus Textfeld', () => {
  assert.equal(speicherName(buch, gehe(starte(buch), buch, 1)), 'Mein Platz im System – Beschreiben');
  assert.deepEqual(fragenAusText(' Eins \r\n\n Zwei\n  '), ['Eins', 'Zwei']);
});

test('R6 Lauf aus dem Browser-Speicher: nur passend zum Regiebuch', () => {
  assert.equal(laufAusSpeicher(null, buch), null);
  assert.equal(laufAusSpeicher({ id: 'anderes', index: 0 }, buch), null);
  assert.deepEqual(laufAusSpeicher({ id: 'rb-test', index: 99, frageAn: true, frageIndex: 5 }, buch),
    { id: 'rb-test', index: 2, frageAn: true, frageIndex: null });
});

// ── Bibliothek ──────────────────────────────────────────────────────────────
test('R7 parseRegiebuch: bereinigt und prüft', () => {
  assert.equal(parseRegiebuch({}).fehler, 'Titel fehlt');
  assert.equal(parseRegiebuch({ titel: 'X', schritte: [] }).fehler, 'mindestens ein Schritt');
  assert.equal(parseRegiebuch({ titel: 'X', schritte: [{ titel: ' ' }] }).fehler, 'Jeder Schritt braucht einen Titel');
  const ok = parseRegiebuch({ titel: ' X ', schritte: [{ titel: 'A', fragen: ['', ' F ', 3], speicherpunkt: 'ja' }] });
  assert.deepEqual(ok.werte?.schritte, [{ titel: 'A', anleitung: '', fragen: ['F'], speicherpunkt: false }]);
  assert.equal(ok.werte?.titel, 'X');
});

test('R8 Titel der eigenen Fassung', () => {
  assert.equal(fassungTitel('Grenze'), 'Grenze (eigene Fassung)');
  assert.ok(fassungTitel('x'.repeat(200)).length <= 120);
});

test('R9 Startregiebücher: fünf Stück, offene Fragen, keine Deutung', () => {
  const sql = readFileSync(__dirname + '/../src/server/migrations/009_regiebuecher.sql', 'utf8');
  const ids = [...sql.matchAll(/^\('(rb-[a-z-]+)'/gm)].map(m => m[1]);
  assert.deepEqual(ids, ['rb-mein-platz', 'rb-zwei-erwartungen', 'rb-grenze', 'rb-ressourcen', 'rb-zwei-zukuenfte']);
  // Jede JSON-Schrittliste ist gültig, jede Frage endet mit „?“.
  for (const m of sql.matchAll(/'(\[\s*\{[\s\S]*?\}\s*\])'::jsonb/g)) {
    const schritte = JSON.parse(m[1]);
    assert.ok(schritte.length >= 3);
    for (const s of schritte) for (const f of s.fragen) assert.match(f, /\?$/, f);
  }
  // Keine suggestiven Wörter in den Fragen (Methodenregel aus dem Prompt).
  assert.doesNotMatch(sql, /\b(eigentlich|warum nicht|Schuld|richtig(e|er)? Platz)\b/i);
});

// ── Frage auf dem Brett (Server) ────────────────────────────────────────────
test('R10 Frage setzen, ausblenden, bleibt außerhalb der Figuren', () => {
  const room = 'rb-frage-1';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0 } });
  applyMutation(room, { type: 'regiebuch_frage_set', text: '  Wo stehst du?  ' });
  let st = buildStateFromMutations(room);
  assert.equal(st.regiebuchFrage, 'Wo stehst du?');
  assert.equal(st.figures.length, 1);
  applyMutation(room, { type: 'regiebuch_frage_set', text: '' });
  st = buildStateFromMutations(room);
  assert.equal(st.regiebuchFrage, undefined);
});

test('R11 Frage überlebt Neustart (Stand → Speicher → Stand)', () => {
  const map = new Map<string, any>();
  seedFigureMapFromState(map, { figures: [], regiebuchFrage: 'Was nimmst du mit?' });
  assert.equal(map.get('__regiebuch_frage__')?.text, 'Was nimmst du mit?');
});
