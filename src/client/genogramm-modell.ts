// brett/src/client/genogramm-modell.ts
// Genogramm (Gerald 16.10.2026): drittes Fenster neben Spielfeld und
// Steuerpult. Kein eigener Datenbestand – es zeigt dieselben Figuren
// (Personen) und Linien (Beziehungen) des Raums als Stammbaum. Dieses Modul ist
// reine Logik ohne DOM/THREE (testbar): Geschlecht und Generation aus der
// Katalog-Rolle, Auto-Layout, Gruppierung der Eltern-Kind-Linien.

export type Geschlecht = 'm' | 'w' | 'd';

/** Beziehungsarten, die zum Stammbaum gehören (nicht aufs Brett). */
export const STRUKTUR_ARTEN = ['Ehe/Partnerschaft', 'Verlobung/lockere Beziehung', 'Trennung', 'Scheidung', 'Eltern–Kind',
  'Adoptiv-/Pflege-/Stiefkind', 'Zwillinge', 'Zwillinge (eineiig)'] as const;
/** Eltern-Kind-Arten (leibliches Kind bzw. Adoptiv-/Pflege-/Stiefkind). */
export const KIND_ARTEN = ['Eltern–Kind', 'Adoptiv-/Pflege-/Stiefkind'];
/** Paar-Arten (U-Linie unter beiden Symbolen). */
export const PAAR_ARTEN = ['Ehe/Partnerschaft', 'Verlobung/lockere Beziehung', 'Trennung', 'Scheidung'];

export type LinienStil = 'einfach' | 'doppelt' | 'dreifach' | 'gestrichelt' | 'abbruch' | 'zickzack' | 'pfeil';

/**
 * Genogramm-Darstellung emotionaler Beziehungen (Prompt Gerald 16.10.2026):
 * eng = zwei Linien, sehr eng = drei, Distanz = gestrichelt, Kontaktabbruch =
 * gestrichelt mit Unterbrechung, Konflikt = Zickzack, Fürsorge/Kontrolle/
 * Abhängigkeit = Pfeil (von → zu). Farbe: blau Bindung, grün Ressource, rot Spannung.
 */
export function linienStil(art: string | undefined, lineType?: string): { stil: LinienStil; farbe: string } {
  const farbe = lineType === 'tension' ? '#c0392b' : lineType === 'resource' ? '#2e8b57' : '#2f6fb0';
  switch (art) {
    case 'Nähe': return { stil: 'doppelt', farbe };
    case 'Unterstützung': return { stil: 'doppelt', farbe };
    case 'Sehr eng/verschmolzen': return { stil: 'dreifach', farbe };
    case 'Distanz': return { stil: 'gestrichelt', farbe };
    case 'Kontaktabbruch': return { stil: 'abbruch', farbe };
    case 'Konflikt': return { stil: 'zickzack', farbe };
    case 'Fürsorge': case 'Kontrolle': case 'Abhängigkeit': return { stil: 'pfeil', farbe };
    default: return { stil: 'einfach', farbe };
  }
}

/** Zickzack-Punkte zwischen a und b (für Konfliktlinien). */
export function zickzack(a: { x: number; y: number }, b: { x: number; y: number }, amplitude = 6, schritt = 12): Array<{ x: number; y: number }> {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const n = Math.max(2, Math.round(len / schritt));
  const pts = [{ ...a }];
  for (let i = 1; i < n; i++) {
    const s = i % 2 ? amplitude : -amplitude;
    pts.push({ x: a.x + dx * i / n + nx * s, y: a.y + dy * i / n + ny * s });
  }
  pts.push({ ...b });
  return pts;
}
export type StrukturArt = typeof STRUKTUR_ARTEN[number];

export interface EigenerMarker { name: string; kuerzel: string; farbe: string }

export interface GenoPerson {
  id: string;
  label?: string;
  role?: string;
  geschlecht?: Geschlecht;
  geno?: { x: number; y: number };
  person?: { geburtsjahr?: number; todesjahr?: number; inAufstellung?: boolean; ereignisse?: string[]; sonstiges?: string;
    /** Selbst definierte Marker (Name, Kürzel, Farbe). */
    marker?: EigenerMarker[] };
}

export interface GenoLinie {
  id: string;
  fromId: string;
  toId: string;
  art?: string;
  label?: string;
  lineType?: string;
  struktur?: boolean;
}

const WEIBLICH = new Set(['mutter', 'schwester', 'stiefmutter', 'pflegemutter', 'gm-mutter', 'gm-vater', 'tante']);
const MAENNLICH = new Set(['vater', 'bruder', 'stiefvater', 'pflegevater', 'gv-mutter', 'gv-vater', 'onkel']);

// Ersatz, wenn keine Katalog-Rolle da ist (z. B. Figuren aus Vorlagen wie
// „Mann“, „Frau“, „Kind 1“, „Oma“): am Namen erkennen. Erstes Wort zählt.
const NAME_W = /^(frau|mutter|mama|oma|großmutter|grossmutter|tochter|schwester|tante|partnerin|ehefrau)\b/i;
const NAME_M = /^(mann|vater|papa|opa|großvater|grossvater|sohn|bruder|onkel|partner|ehemann)\b/i;
const NAME_GEN: Array<[RegExp, number]> = [
  [/^(oma|opa|großmutter|großvater|grossmutter|grossvater)\b/i, 0],
  [/^(mutter|vater|mama|papa|onkel|tante)\b/i, 1],
  [/^(kind|tochter|sohn|baby)\b/i, 3],
  [/^(chef|chefin|kolleg|mitarbeiter)/i, 4],
];

/** Geschlecht: ausdrücklich gesetzt > aus der Rolle > aus dem Namen > unbekannt (Raute). */
export function geschlechtVon(p: GenoPerson): Geschlecht {
  if (p.geschlecht === 'm' || p.geschlecht === 'w' || p.geschlecht === 'd') return p.geschlecht;
  if (p.role && WEIBLICH.has(p.role)) return 'w';
  if (p.role && MAENNLICH.has(p.role)) return 'm';
  const n = (p.label || '').trim();
  if (NAME_W.test(n)) return 'w';
  if (NAME_M.test(n)) return 'm';
  return 'd';
}

/** Generation (0 = Großeltern, 1 = Eltern, 2 = Ich/Geschwister/Partner, 3 = Kinder, 4 = Arbeit/Sonstige). */
export function generationVon(role?: string, label?: string): number {
  if (!role) {
    const n = (label || '').trim();
    for (const [re, g] of NAME_GEN) if (re.test(n)) return g;
    return 2;
  }
  if (role.startsWith('gm-') || role.startsWith('gv-')) return 0;
  if (['mutter', 'vater', 'stiefmutter', 'stiefvater', 'pflegemutter', 'pflegevater', 'onkel', 'tante',
       'unbekannter-elternteil'].includes(role)) return 1;
  if (['kind', 'kind-verstorben', 'ungeboren'].includes(role)) return 3;
  if (['chef', 'kollege', 'mitarbeiter'].includes(role)) return 4;
  return 2;
}

export const ABSTAND_X = 140;
export const ABSTAND_Y = 150;

/**
 * Einfaches Auto-Layout: Personen ohne gespeicherte Position bekommen eine
 * Zeile nach Generation und werden darin nebeneinander gereiht (rechts neben
 * den schon platzierten). Vorhandene Positionen bleiben unangetastet
 * (Gerald/Prompt: Auto-Layout darf nichts überschreiben).
 */
export function positionen(personen: GenoPerson[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const naechstesX = new Map<number, number>();
  for (const p of personen) {
    if (p.geno) {
      pos.set(p.id, { ...p.geno });
      const g = Math.round(p.geno.y / ABSTAND_Y);
      naechstesX.set(g, Math.max(naechstesX.get(g) ?? 0, p.geno.x + ABSTAND_X));
    }
  }
  const ohne = personen.filter(p => !p.geno)
    .sort((a, b) => (a.person?.geburtsjahr ?? 9999) - (b.person?.geburtsjahr ?? 9999));
  for (const p of ohne) {
    const g = generationVon(p.role, p.label);
    const x = naechstesX.get(g) ?? 0;
    pos.set(p.id, { x, y: g * ABSTAND_Y });
    naechstesX.set(g, x + ABSTAND_X);
  }
  return pos;
}

/**
 * Eltern-Kind-Linien gruppieren: Kinder mit denselben Eltern bilden eine
 * Geschwistergruppe (für die Stammbaum-Zeichnung: Paar → Querbalken → Kinder).
 * Konvention: fromId = Elternteil, toId = Kind.
 */
export function elternGruppen(linien: GenoLinie[]): Array<{ eltern: string[]; kinder: string[]; adoptiert: string[] }> {
  const elternVon = new Map<string, Set<string>>();
  const adoptiert = new Set<string>();
  for (const l of linien) {
    if (!KIND_ARTEN.includes(l.art || '')) continue;
    if (!elternVon.has(l.toId)) elternVon.set(l.toId, new Set());
    elternVon.get(l.toId)!.add(l.fromId);
    if (l.art === 'Adoptiv-/Pflege-/Stiefkind') adoptiert.add(l.toId);
  }
  const gruppen = new Map<string, { eltern: string[]; kinder: string[]; adoptiert: string[] }>();
  for (const [kind, eltern] of elternVon) {
    const e = [...eltern].sort();
    const key = e.join('+');
    if (!gruppen.has(key)) gruppen.set(key, { eltern: e, kinder: [], adoptiert: [] });
    gruppen.get(key)!.kinder.push(kind);
    if (adoptiert.has(kind)) gruppen.get(key)!.adoptiert.push(kind);
  }
  return [...gruppen.values()];
}

/** Zwillingspaare (Kind-Linien laufen auf dem Geschwisterbalken zusammen). */
export function zwillingsPaare(linien: GenoLinie[]): Array<{ a: string; b: string; eineiig: boolean }> {
  return linien.filter(l => l.art === 'Zwillinge' || l.art === 'Zwillinge (eineiig)')
    .map(l => ({ a: l.fromId, b: l.toId, eineiig: l.art === 'Zwillinge (eineiig)' }));
}

/** Würde die neue Eltern-Kind-Linie einen Kreis bilden (Kind ist Vorfahr des Elternteils)? */
export function waereZirkulaer(linien: GenoLinie[], elternteil: string, kind: string): boolean {
  if (elternteil === kind) return true;
  const kinderVon = new Map<string, string[]>();
  for (const l of linien) {
    if (!KIND_ARTEN.includes(l.art || '')) continue;
    if (!kinderVon.has(l.fromId)) kinderVon.set(l.fromId, []);
    kinderVon.get(l.fromId)!.push(l.toId);
  }
  // Ist `elternteil` ein Nachfahre von `kind`?
  const stapel = [kind];
  const gesehen = new Set<string>();
  while (stapel.length) {
    const x = stapel.pop()!;
    if (x === elternteil) return true;
    if (gesehen.has(x)) continue;
    gesehen.add(x);
    stapel.push(...(kinderVon.get(x) ?? []));
  }
  return false;
}

// ── Marker (Ereignisse am Symbol, Gerald 16.10.2026) ──────────────────────────
// Buchstaben in Farbkreisen statt Emojis (sehen auf jedem Rechner und im Export
// gleich aus). Farbe = Gruppe: grau Verlust, rot Gesundheit, orange Flucht/
// Krieg, blau Beziehung, lila Gewalt/Sucht, grün Pflege/Adoption.
const GRAU = '#6b6f78', ROT = '#c0392b', ORANGE = '#d9822b', BLAU = '#2f6fb0', LILA = '#7b4fa0', GRUEN = '#2e8b57';
const MARKER: Record<string, { kuerzel: string; farbe: string }> = {
  'Tod': { kuerzel: 'T', farbe: GRAU },
  'Früher Tod': { kuerzel: 'FT', farbe: GRAU },
  'Fehlgeburt/Abbruch': { kuerzel: 'FG', farbe: GRAU },
  'Schwere Krankheit': { kuerzel: 'K', farbe: ROT },
  'Unfall': { kuerzel: 'U', farbe: ROT },
  'Migration/Flucht': { kuerzel: 'M', farbe: ORANGE },
  'Krieg': { kuerzel: 'Kr', farbe: ORANGE },
  'Trennung': { kuerzel: 'Tr', farbe: BLAU },
  'Scheidung': { kuerzel: 'Sch', farbe: BLAU },
  'Kontaktabbruch': { kuerzel: 'KA', farbe: BLAU },
  'Sucht': { kuerzel: 'S', farbe: LILA },
  'Gewalt': { kuerzel: 'G', farbe: LILA },
  'Adoption/Pflege': { kuerzel: 'A', farbe: GRUEN },
};

/** Marker für ein Ereignis; unbekannte/„Sonstiges“ → ✱ grau. */
export function markerFuer(ereignis: string): { kuerzel: string; farbe: string } {
  return MARKER[ereignis] ?? { kuerzel: '✱', farbe: GRAU };
}

/** Marker einer Person: Katalog-Ereignisse + „Sonstiges“ (Freitext) als ✱. */
export function markerVon(p: { person?: { ereignisse?: string[]; sonstiges?: string; marker?: EigenerMarker[] } }): Array<{ ereignis: string; kuerzel: string; farbe: string }> {
  const liste = (p.person?.ereignisse ?? []).map(e => ({ ereignis: e, ...markerFuer(e) }));
  for (const m of p.person?.marker ?? []) liste.push({ ereignis: m.name, kuerzel: m.kuerzel, farbe: m.farbe });
  const s = p.person?.sonstiges?.trim();
  if (s) liste.push({ ereignis: s, kuerzel: '✱', farbe: GRAU });
  return liste;
}

/** „1949–2008“, „*1949“, „†2008“ oder ''. */
export function lebensjahre(p: GenoPerson): string {
  const g = p.person?.geburtsjahr, t = p.person?.todesjahr;
  if (g && t) return `${g}–${t}`;
  if (g) return `*${g}`;
  if (t) return `†${t}`;
  return '';
}
