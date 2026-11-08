// brett/src/client/pult-markierungen.ts
// Anker und Flächen im Steuerpult (Gerald 08.11.2026): Die Knöpfe unten auf dem
// Brett verdeckten auf dem Handy die Aufstellung, deshalb hier.
// Anker = beschrifteter Punkt am Boden, Fläche = farbiges Feld oder Rahmen.
// Keine feste Bedeutung – die gibt der Klient. Texte zunächst nur Deutsch.

import type { Anchor, Zone } from '../types/state';
import type { PultHelfer } from './pult-klient';
import { freierMoebelPlatz } from './pult-moebel';

export const markierungen = { anker: [] as Anchor[], zonen: [] as Zone[] };

/** Nachricht vom Server übernehmen; true = die Liste hat sich geändert. */
export function markierungenEmpfangen(m: any): boolean {
  switch (m.type) {
    case 'snapshot':
      if (Array.isArray(m.anchors)) markierungen.anker = m.anchors;
      if (Array.isArray(m.zones)) markierungen.zonen = m.zones;
      return true;
    case 'anchor_added': if (m.anchor) markierungen.anker = [...markierungen.anker, m.anchor]; return true;
    case 'anchor_removed': markierungen.anker = markierungen.anker.filter(a => a.id !== m.anchorId); return true;
    case 'zone_added': if (m.zone) markierungen.zonen = [...markierungen.zonen, m.zone]; return true;
    case 'zone_updated': markierungen.zonen = markierungen.zonen.map(z => z.id === m.zone?.id ? m.zone : z); return true;
    case 'zone_removed': markierungen.zonen = markierungen.zonen.filter(z => z.id !== m.zoneId); return true;
    default: return false;
  }
}

export interface MarkierungDeps {
  senden: (m: any) => void;
  belegtePlaetze: () => Array<{ x: number; z: number }>;
}

let beschriftung = '';
const SCHRITT = 0.5;

export function markierungenBlock(hf: PultHelfer, d: MarkierungDeps): HTMLElement {
  const { h, knopf } = hf;
  const eingabe = h('input', { type: 'text', maxlength: '40', placeholder: 'Beschriftung (optional)' }) as HTMLInputElement;
  eingabe.value = beschriftung;
  eingabe.addEventListener('input', () => { beschriftung = eingabe.value; });
  const platz = () => freierMoebelPlatz(d.belegtePlaetze());
  const neuerText = () => { const t = beschriftung.trim(); beschriftung = ''; eingabe.value = ''; return t; };

  const plusAnker = knopf('＋ Anker', () => {
    const label = neuerText();
    d.senden({ type: 'anchor_create', anchor: { ...platz(), ...(label ? { label } : {}), color: '#c8a96e' } });
  });
  const plusZone = knopf('＋ Fläche', () => {
    const label = neuerText();
    d.senden({ type: 'zone_create', zone: { ...platz(), shape: 'rect', width: 3, height: 3, ...(label ? { label } : {}), color: '#4ea1ff', opacity: 0.25 } });
  });

  const ankerZeilen = markierungen.anker.map((a, i) => h('div', { class: 'moebel-zeile' },
    h('span', { class: 'moebel-name' }, `⚓ ${a.label || 'Anker ' + (i + 1)}`),
    knopf('✕', () => d.senden({ type: 'anchor_delete', anchorId: a.id }), 'mini')));

  const zonenZeilen = markierungen.zonen.map((z, i) => {
    const aendern = (patch: Partial<Zone>) => d.senden({ type: 'zone_update', zoneId: z.id, ...patch });
    const groesse = (f: number) => z.shape === 'circle'
      ? aendern({ radius: Math.max(0.5, (z.radius ?? 1.5) + f) })
      : aendern({ width: Math.max(0.5, (z.width ?? 2) + f), height: Math.max(0.5, (z.height ?? 2) + f) });
    return h('div', { class: 'zone-eintrag' },
      h('div', { class: 'moebel-zeile' },
        h('span', { class: 'moebel-name' }, `▭ ${z.label || 'Fläche ' + (i + 1)}`),
        knopf('−', () => groesse(-SCHRITT), 'mini'), knopf('＋', () => groesse(SCHRITT), 'mini'),
        knopf(z.variant === 'frame' ? 'Füllen' : 'Rahmen', () => aendern({ variant: z.variant === 'frame' ? 'filled' : 'frame' }), 'mini'),
        knopf('✕', () => d.senden({ type: 'zone_delete', zoneId: z.id }), 'mini')),
      h('div', { class: 'moebel-zeile' },
        h('span', { class: 'moebel-name klein' }, 'verschieben'),
        knopf('◀', () => aendern({ x: z.x - SCHRITT }), 'mini'), knopf('▶', () => aendern({ x: z.x + SCHRITT }), 'mini'),
        knopf('▲', () => aendern({ z: z.z - SCHRITT }), 'mini'), knopf('▼', () => aendern({ z: z.z + SCHRITT }), 'mini')));
  });

  const anzahl = markierungen.anker.length + markierungen.zonen.length;
  return hf.block('markierungen', `Anker & Flächen (${anzahl})`,
    h('div', { class: 'klein', style: { marginBottom: '4px' } }, 'Anker: beschrifteter Punkt am Boden. Fläche: farbiges Feld, z. B. für Gruppe oder Grenze.'),
    eingabe,
    h('div', { class: 'reihe', style: { marginTop: '4px' } }, plusAnker, plusZone),
    ...ankerZeilen, ...zonenZeilen,
  );
}
