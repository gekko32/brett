// brett/src/client/pult-moebel.ts
// Möbel und Wände im Steuerpult (Gerald 06.11.2026): bei Bedarf hinzufügen,
// drehen, Länge ändern, löschen. Verschieben geht auf dem Brett mit der Maus.
// Texte zunächst nur Deutsch.

import { type Moebel, type MoebelArt, MOEBEL_ARTEN, stuehleUmTisch, normalisiereMoebel } from '../types/moebel';
import type { PultHelfer } from './pult-klient';

export const moebelZustand = { liste: [] as Moebel[] };

export interface MoebelDeps {
  senden: (m: any) => void;
  /** Positionen der Figuren, damit Neues nicht auf einer Figur landet. */
  belegtePlaetze: () => Array<{ x: number; z: number }>;
}

const neueId = () => (crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(36).slice(2)).slice(0, 36);

/** Freier Platz nahe der Mitte (Spirale), Abstand ≥ 1,2 zu Belegtem. */
export function freierMoebelPlatz(belegt: Array<{ x: number; z: number }>): { x: number; z: number } {
  for (let r = 0; r < 12; r += 0.8) {
    const schritte = Math.max(1, Math.round(r * 6));
    for (let i = 0; i < schritte; i++) {
      const w = (i / schritte) * Math.PI * 2;
      const p = { x: Math.round(Math.sin(w) * r * 10) / 10, z: Math.round(Math.cos(w) * r * 10) / 10 };
      if (belegt.every(b => Math.hypot(b.x - p.x, b.z - p.z) >= 1.2)) return p;
    }
  }
  return { x: 0, z: 0 };
}

/** Raum aus vier Wänden um die Mitte (Innenmaß breite × tiefe). */
export function raumAusWaenden(breite = 8, tiefe = 6): Moebel[] {
  return [
    { id: neueId(), art: 'wand', x: 0, z: -tiefe / 2, facingY: 0, laenge: breite },
    { id: neueId(), art: 'wand', x: 0, z: tiefe / 2, facingY: 0, laenge: breite },
    { id: neueId(), art: 'wand', x: -breite / 2, z: 0, facingY: Math.PI / 2, laenge: tiefe },
    { id: neueId(), art: 'wand', x: breite / 2, z: 0, facingY: Math.PI / 2, laenge: tiefe },
  ];
}

function setze(liste: Moebel[], d: MoebelDeps, hf: PultHelfer): void {
  moebelZustand.liste = normalisiereMoebel(liste);
  d.senden({ type: 'admin_moebel_set', moebel: moebelZustand.liste });
  hf.neuZeichnen();
}

function belegt(d: MoebelDeps): Array<{ x: number; z: number }> {
  return [...d.belegtePlaetze(), ...moebelZustand.liste.map(m => ({ x: m.x, z: m.z }))];
}

export function moebelBlock(hf: PultHelfer, d: MoebelDeps): HTMLElement {
  const { h, knopf } = hf;
  const L = moebelZustand.liste;
  const hinzu = (art: MoebelArt) => knopf('＋ ' + MOEBEL_ARTEN[art].name, () => {
    const p = freierMoebelPlatz(belegt(d));
    setze([...L, { id: neueId(), art, x: p.x, z: p.z, facingY: 0 }], d, hf);
  });
  const tischMitStuehlen = knopf('＋ Tisch mit 4 Stühlen', () => {
    const p = freierMoebelPlatz(belegt(d));
    const tisch: Moebel = { id: neueId(), art: 'tisch', x: p.x, z: p.z, facingY: 0, laenge: 1.6 };
    setze([...L, tisch, ...stuehleUmTisch(tisch, 4, neueId)], d, hf);
  });
  const raum = knopf('＋ Raum aus 4 Wänden', () => setze([...L, ...raumAusWaenden()], d, hf));

  const zaehler: Record<string, number> = {};
  const zeilen = L.map((m) => {
    zaehler[m.art] = (zaehler[m.art] ?? 0) + 1;
    const info = MOEBEL_ARTEN[m.art];
    const drehe = (grad: number) => setze(L.map(x => x.id === m.id ? { ...x, facingY: x.facingY + grad * Math.PI / 180 } : x), d, hf);
    let laenge: HTMLInputElement | null = null;
    if (info.laengeVon !== undefined) {
      laenge = h('input', { type: 'number', min: String(info.laengeVon), max: String(info.laengeBis), step: '0.1',
        value: String(m.laenge ?? info.breite), title: 'Länge', style: { width: '64px' } }) as HTMLInputElement;
      laenge.addEventListener('change', () => {
        const v = parseFloat(laenge!.value);
        if (isFinite(v)) setze(L.map(x => x.id === m.id ? { ...x, laenge: v } : x), d, hf);
      });
    }
    return h('div', { class: 'moebel-zeile' },
      h('span', { class: 'moebel-name' }, `${info.name} ${zaehler[m.art]}`),
      knopf('⟲', () => drehe(-15), 'mini'), knopf('⟳', () => drehe(15), 'mini'), knopf('↻ 90°', () => drehe(90), 'mini'),
      laenge ?? h('span', { style: { width: '64px', flexShrink: '0' } }),
      knopf('✕', () => setze(L.filter(x => x.id !== m.id), d, hf), 'mini'));
  });

  let alleBereit = false;
  const alle = knopf('Alle entfernen', () => {
    if (!alleBereit) { alleBereit = true; alle.textContent = 'Wirklich alle?'; alle.classList.add('warn'); return; }
    setze([], d, hf);
  });

  const arten: MoebelArt[] = ['tisch', 'rundtisch', 'stuhl', 'sessel', 'bank', 'wand', 'tuer'];
  return hf.block('moebel', `Möbel & Wände (${L.length})`,
    h('div', { class: 'raster3' }, ...arten.map(hinzu)),
    h('div', { class: 'reihe', style: { marginTop: '4px' } }, tischMitStuehlen, raum),
    h('div', { class: 'klein', style: { margin: '4px 0' } }, 'Auf dem Brett mit der Maus verschieben. Drehen und Länge hier.'),
    ...(zeilen.length ? zeilen : [h('div', { class: 'leer' }, 'Noch keine Möbel auf dem Brett.')]),
    ...(L.length ? [h('div', { class: 'reihe', style: { marginTop: '6px' } }, alle)] : []),
  );
}
