// brett/test/genogramm-modell.test.ts — Genogramm-Logik (Gerald 16.10.2026)
import { test } from 'node:test';
import assert from 'node:assert';
import {
  geschlechtVon, generationVon, positionen, elternGruppen, waereZirkulaer, lebensjahre,
  ABSTAND_X, ABSTAND_Y,
} from '../src/client/genogramm-modell';

test('geschlechtVon: ausdrücklich > Rolle > unbekannt', () => {
  assert.equal(geschlechtVon({ id: 'a', role: 'mutter' }), 'w');
  assert.equal(geschlechtVon({ id: 'a', role: 'gv-vater' }), 'm');
  assert.equal(geschlechtVon({ id: 'a', role: 'ich' }), 'd');
  assert.equal(geschlechtVon({ id: 'a', role: 'mutter', geschlecht: 'd' }), 'd');
});

test('generationVon: Großeltern oben, Kinder unten', () => {
  assert.equal(generationVon('gm-mutter'), 0);
  assert.equal(generationVon('vater'), 1);
  assert.equal(generationVon('ich'), 2);
  assert.equal(generationVon('kind'), 3);
  assert.equal(generationVon(undefined), 2);
});

test('positionen: vorhandene bleiben, neue reihen sich je Generation an', () => {
  const pos = positionen([
    { id: 'v', role: 'vater', geno: { x: 0, y: ABSTAND_Y } },
    { id: 'm', role: 'mutter' },
    { id: 'i', role: 'ich' },
  ]);
  assert.deepEqual(pos.get('v'), { x: 0, y: ABSTAND_Y });
  assert.deepEqual(pos.get('m'), { x: ABSTAND_X, y: ABSTAND_Y });
  assert.deepEqual(pos.get('i'), { x: 0, y: 2 * ABSTAND_Y });
});

test('elternGruppen: Geschwister mit denselben Eltern zusammen', () => {
  const g = elternGruppen([
    { id: '1', fromId: 'v', toId: 'k1', art: 'Eltern–Kind' },
    { id: '2', fromId: 'm', toId: 'k1', art: 'Eltern–Kind' },
    { id: '3', fromId: 'v', toId: 'k2', art: 'Eltern–Kind' },
    { id: '4', fromId: 'm', toId: 'k2', art: 'Eltern–Kind' },
    { id: '5', fromId: 'v', toId: 'm', art: 'Ehe/Partnerschaft' },
  ]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].eltern, ['m', 'v']);
  assert.deepEqual(g[0].kinder.sort(), ['k1', 'k2']);
});

test('waereZirkulaer: Kind kann nicht Vorfahr seines Elternteils sein', () => {
  const linien = [
    { id: '1', fromId: 'opa', toId: 'vater', art: 'Eltern–Kind' },
    { id: '2', fromId: 'vater', toId: 'ich', art: 'Eltern–Kind' },
  ];
  assert.equal(waereZirkulaer(linien, 'ich', 'opa'), true);
  assert.equal(waereZirkulaer(linien, 'vater', 'vater'), true);
  assert.equal(waereZirkulaer(linien, 'vater', 'schwester'), false);
});

test('lebensjahre', () => {
  assert.equal(lebensjahre({ id: 'a', person: { geburtsjahr: 1949, todesjahr: 2008 } }), '1949–2008');
  assert.equal(lebensjahre({ id: 'a', person: { geburtsjahr: 1949 } }), '*1949');
  assert.equal(lebensjahre({ id: 'a' }), '');
});

test('ohne Rolle: Geschlecht und Generation aus dem Namen (Vorlagen)', () => {
  assert.equal(geschlechtVon({ id: 'a', label: 'Frau' }), 'w');
  assert.equal(geschlechtVon({ id: 'a', label: 'Opa' }), 'm');
  assert.equal(geschlechtVon({ id: 'a', label: 'Kind 1' }), 'd');
  assert.equal(generationVon(undefined, 'Kind 2'), 3);
  assert.equal(generationVon(undefined, 'Oma'), 0);
  assert.equal(generationVon(undefined, 'Mann'), 2);
});

test('linienStil: Genogramm-Darstellung emotionaler Beziehungen', async () => {
  const { linienStil, zickzack } = await import('../src/client/genogramm-modell');
  assert.equal(linienStil('Nähe').stil, 'doppelt');
  assert.equal(linienStil('Sehr eng/verschmolzen').stil, 'dreifach');
  assert.equal(linienStil('Konflikt', 'tension').stil, 'zickzack');
  assert.equal(linienStil('Konflikt', 'tension').farbe, '#c0392b');
  assert.equal(linienStil('Kontrolle').stil, 'pfeil');
  assert.equal(linienStil('Kontaktabbruch').stil, 'abbruch');
  assert.equal(linienStil(undefined).stil, 'einfach');
  const z = zickzack({ x: 0, y: 0 }, { x: 120, y: 0 });
  assert.deepEqual(z[0], { x: 0, y: 0 });
  assert.deepEqual(z[z.length - 1], { x: 120, y: 0 });
  assert.ok(z.length > 4);
});

test('Marker: Ereignisse als Kürzel in Gruppenfarbe, Sonstiges als ✱', async () => {
  const { markerFuer, markerVon } = await import('../src/client/genogramm-modell');
  assert.deepEqual(markerFuer('Migration/Flucht'), { kuerzel: 'M', farbe: '#d9822b' });
  assert.equal(markerFuer('Sucht').kuerzel, 'S');
  assert.equal(markerFuer('etwas Unbekanntes').kuerzel, '✱');
  const m = markerVon({ person: { ereignisse: ['Krieg', 'Sucht'], sonstiges: 'Insolvenz 1998' } });
  assert.deepEqual(m.map(x => x.kuerzel), ['Kr', 'S', '✱']);
  assert.equal(m[2].ereignis, 'Insolvenz 1998');
  assert.deepEqual(markerVon({}), []);
});

test('Adoption und Zwillinge im Stammbaum', async () => {
  const { elternGruppen, zwillingsPaare, waereZirkulaer } = await import('../src/client/genogramm-modell');
  const linien = [
    { id: '1', fromId: 'v', toId: 'k1', art: 'Eltern–Kind' },
    { id: '2', fromId: 'v', toId: 'k2', art: 'Adoptiv-/Pflege-/Stiefkind' },
    { id: '3', fromId: 'k1', toId: 'k3', art: 'Zwillinge (eineiig)' },
  ];
  const g = elternGruppen(linien);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].kinder.sort(), ['k1', 'k2']);
  assert.deepEqual(g[0].adoptiert, ['k2']);
  assert.deepEqual(zwillingsPaare(linien), [{ a: 'k1', b: 'k3', eineiig: true }]);
  assert.equal(waereZirkulaer(linien, 'k2', 'v'), true);
});

test('eigene Marker erscheinen mit Kürzel und Farbe', async () => {
  const { markerVon } = await import('../src/client/genogramm-modell');
  const m = markerVon({ person: { marker: [{ name: 'Insolvenz', kuerzel: 'In', farbe: '#123456' }] } });
  assert.deepEqual(m, [{ ereignis: 'Insolvenz', kuerzel: 'In', farbe: '#123456' }]);
});
