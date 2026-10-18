// brett/src/client/person-catalog.ts
// Personenkatalog nach Ebenen (Geralds Vorgaben, 16.10.2026; siehe
// technik/hetzner/BRETT-PERSONENKATALOG-ANFORDERUNGEN.md im code-Repo).
//
// Schritt 1: reine Figurenauswahl. Die Felder `inAufstellung` und
// `beziehungen` sind Vorgaben für Schritt 2 (Personenangaben/Genogramm) und
// werden hier noch nicht ausgewertet.

export type Koerper = 'erwachsen' | 'kind' | 'aelter';
export type InAufstellung = 'ja' | 'meist' | 'je-nach-thema' | 'bei-thema';

export interface KatalogRolle {
  /** Stabiler Schlüssel, wird an der Figur als `role` gespeichert. */
  key: string;
  label: string;
  koerper: Koerper;
  /** Halbtransparent darstellen (Verstorbene, Ausgeblendete). */
  blass?: boolean;
  inAufstellung: InAufstellung;
  /** Übliche Beziehungen (Rollen-Keys) – Vorgabe für Schritt 2. */
  beziehungen?: string[];
}

export interface KatalogEbene {
  key: string;
  label: string;
  /** Kurzer Hinweis, warum die Ebene relevant ist. */
  hinweis: string;
  farbe: string;
  rollen: KatalogRolle[];
}

export const KOERPER_GROESSE: Record<Koerper, number> = { erwachsen: 1.0, kind: 0.7, aelter: 0.95 };
export const KOERPER_APPEARANCE: Record<Koerper, string> = { erwachsen: 'adult-average', kind: 'child', aelter: 'elder' };
export const BLASS_OPACITY = 0.45;

export const PERSONEN_KATALOG: KatalogEbene[] = [
  {
    key: 'kern', label: 'Kernsystem / Gegenwart', farbe: '#4f7cac',
    hinweis: 'Das unmittelbare Beziehungssystem.',
    rollen: [
      { key: 'ich', label: 'Ich', koerper: 'erwachsen', inAufstellung: 'ja' },
      { key: 'partner', label: 'Partner/in', koerper: 'erwachsen', inAufstellung: 'ja', beziehungen: ['ich', 'kind'] },
      { key: 'ex-partner', label: 'Ex-Partner/in', koerper: 'erwachsen', inAufstellung: 'je-nach-thema', beziehungen: ['ich', 'kind'] },
      { key: 'kind', label: 'Kind', koerper: 'kind', inAufstellung: 'ja', beziehungen: ['ich', 'partner'] },
      { key: 'kind-verstorben', label: 'Verstorbenes Kind', koerper: 'kind', blass: true, inAufstellung: 'bei-thema', beziehungen: ['ich', 'partner'] },
    ],
  },
  {
    key: 'herkunft', label: 'Herkunftsfamilie', farbe: '#c0607a',
    hinweis: 'Zentrale Bezugspersonen der Kindheit.',
    rollen: [
      { key: 'mutter', label: 'Mutter', koerper: 'erwachsen', inAufstellung: 'ja', beziehungen: ['vater', 'geschwister'] },
      { key: 'vater', label: 'Vater', koerper: 'erwachsen', inAufstellung: 'ja', beziehungen: ['mutter', 'geschwister'] },
      { key: 'bruder', label: 'Bruder', koerper: 'erwachsen', inAufstellung: 'je-nach-thema', beziehungen: ['mutter', 'vater', 'ich'] },
      { key: 'schwester', label: 'Schwester', koerper: 'erwachsen', inAufstellung: 'je-nach-thema', beziehungen: ['mutter', 'vater', 'ich'] },
      { key: 'stiefmutter', label: 'Stiefmutter', koerper: 'erwachsen', inAufstellung: 'je-nach-thema' },
      { key: 'stiefvater', label: 'Stiefvater', koerper: 'erwachsen', inAufstellung: 'je-nach-thema' },
      { key: 'pflegemutter', label: 'Adoptiv-/Pflegemutter', koerper: 'erwachsen', inAufstellung: 'je-nach-thema' },
      { key: 'pflegevater', label: 'Adoptiv-/Pflegevater', koerper: 'erwachsen', inAufstellung: 'je-nach-thema' },
    ],
  },
  {
    key: 'grosseltern', label: 'Großeltern', farbe: '#8a7fa8',
    hinweis: 'Muster über drei Generationen.',
    rollen: [
      { key: 'gm-mutter', label: 'Großmutter mütterlicherseits', koerper: 'aelter', inAufstellung: 'meist', beziehungen: ['gv-mutter', 'mutter'] },
      { key: 'gv-mutter', label: 'Großvater mütterlicherseits', koerper: 'aelter', inAufstellung: 'meist', beziehungen: ['gm-mutter', 'mutter'] },
      { key: 'gm-vater', label: 'Großmutter väterlicherseits', koerper: 'aelter', inAufstellung: 'meist', beziehungen: ['gv-vater', 'vater'] },
      { key: 'gv-vater', label: 'Großvater väterlicherseits', koerper: 'aelter', inAufstellung: 'meist', beziehungen: ['gm-vater', 'vater'] },
    ],
  },
  {
    key: 'schicksal', label: 'Schicksal / Verluste', farbe: '#6b6f78',
    hinweis: 'Frühe Tode, schwere Krankheit, Brüche.',
    rollen: [
      { key: 'frueh-verstorben', label: 'Früh verstorbene/r Angehörige/r', koerper: 'erwachsen', blass: true, inAufstellung: 'bei-thema' },
      { key: 'schwer-krank', label: 'Schwer erkrankte Person', koerper: 'erwachsen', inAufstellung: 'bei-thema' },
    ],
  },
  {
    key: 'ausgeblendet', label: 'Ausgeblendete Personen', farbe: '#9aa3ad',
    hinweis: 'Gehören zum System, werden aber nicht benannt.',
    rollen: [
      { key: 'ungeboren', label: 'Ungeborenes Kind', koerper: 'kind', blass: true, inAufstellung: 'bei-thema' },
      { key: 'unbekannter-elternteil', label: 'Unbekannter Elternteil', koerper: 'erwachsen', blass: true, inAufstellung: 'bei-thema' },
      { key: 'verschwiegene-beziehung', label: 'Verschwiegene Beziehung', koerper: 'erwachsen', blass: true, inAufstellung: 'bei-thema' },
    ],
  },
  {
    key: 'optional', label: 'Weitere Bezugspersonen', farbe: '#6fb38a',
    hinweis: 'Bei besonderer Fürsorge- oder Konfliktrolle.',
    rollen: [
      { key: 'onkel', label: 'Onkel', koerper: 'erwachsen', inAufstellung: 'je-nach-thema' },
      { key: 'tante', label: 'Tante', koerper: 'erwachsen', inAufstellung: 'je-nach-thema' },
      { key: 'pate', label: 'Pate/Patin', koerper: 'erwachsen', inAufstellung: 'je-nach-thema' },
      { key: 'bezugsperson', label: 'Bezugsperson', koerper: 'erwachsen', inAufstellung: 'je-nach-thema' },
    ],
  },
  {
    key: 'arbeit', label: 'Arbeit', farbe: '#b05a3c',
    hinweis: 'Team- und Arbeitssystem.',
    rollen: [
      { key: 'chef', label: 'Chef/in', koerper: 'erwachsen', inAufstellung: 'ja' },
      { key: 'kollege', label: 'Kolleg/in', koerper: 'erwachsen', inAufstellung: 'ja' },
      { key: 'mitarbeiter', label: 'Mitarbeiter/in', koerper: 'erwachsen', inAufstellung: 'ja' },
    ],
  },
];

// ── Schritt 2: Angaben zur Person ────────────────────────────────────────────

/** Bedeutsame Ereignisse (Katalog) – dazu ein Freitext „Sonstiges“. */
export const EREIGNISSE: string[] = [
  'Tod', 'Früher Tod', 'Fehlgeburt/Abbruch', 'Schwere Krankheit', 'Trennung',
  'Scheidung', 'Migration/Flucht', 'Krieg', 'Kontaktabbruch', 'Unfall', 'Sucht',
  'Gewalt', 'Adoption/Pflege',
];

/** Personenangaben an einer Figur (lebt nur in der Aufstellung, Entscheidung 16.10.2026). */
export interface PersonAngaben {
  geburtsjahr?: number;
  todesjahr?: number;
  todesursache?: string;
  ereignisse?: string[];
  sonstiges?: string;
  /** false = im System erfasst, aber (noch) nicht aufgestellt → stark abgeblendet. */
  inAufstellung?: boolean;
}

// ── Schritt 3: Beziehungen ───────────────────────────────────────────────────

/**
 * Beziehungsarten (genogrammnah, Bedienkonzept 16.10.2026). `linie` bestimmt
 * die Darstellung über die vorhandenen Linientypen: Bezug = blau durchgezogen,
 * Spannung = rot gestrichelt, Ressource = grün.
 */
export const BEZIEHUNGSARTEN: Array<{ art: string; linie: 'relationship' | 'tension' | 'resource' }> = [
  { art: 'Ehe/Partnerschaft', linie: 'relationship' },
  // Genogramm: gestrichelte Paarlinie (Verlobung, lockere oder befristete Beziehung)
  { art: 'Verlobung/lockere Beziehung', linie: 'relationship' },
  { art: 'Eltern–Kind', linie: 'relationship' },
  // Genogramm: gestrichelte Kind-Linie mit Beschriftung
  { art: 'Adoptiv-/Pflege-/Stiefkind', linie: 'relationship' },
  // Genogramm: Kind-Linien laufen zusammen (eineiig zusätzlich mit Querstrich)
  { art: 'Zwillinge', linie: 'relationship' },
  { art: 'Zwillinge (eineiig)', linie: 'relationship' },
  { art: 'Geschwister', linie: 'relationship' },
  { art: 'Nähe', linie: 'relationship' },
  { art: 'Sehr eng/verschmolzen', linie: 'relationship' },
  { art: 'Unterstützung', linie: 'resource' },
  { art: 'Konflikt', linie: 'tension' },
  { art: 'Distanz', linie: 'tension' },
  { art: 'Trennung', linie: 'tension' },
  { art: 'Scheidung', linie: 'tension' },
  { art: 'Kontaktabbruch', linie: 'tension' },
  // mit Richtung (Pfeil von → zu)
  { art: 'Fürsorge', linie: 'resource' },
  { art: 'Kontrolle', linie: 'tension' },
  { art: 'Abhängigkeit', linie: 'tension' },
  { art: 'Sonstiges', linie: 'relationship' },
];

/** Böden für „Farbe und Struktur des Brettes“ (optik-map.ts FLOOR_COLORS). */
export const BOEDEN: Array<[string, string]> = [
  ['slate', 'Schiefer'], ['wood-dark', 'Holz dunkel'], ['felt-green', 'Filz grün'],
  ['marble', 'Marmor'], ['sand', 'Sand'],
  ['hellgrau', 'Hellgrau'], ['holz-hell', 'Holz hell'], ['creme', 'Creme'], ['weiss', 'Weiß'],
];

/** „1950–2010“, „*1950“, „†2010“ oder '' für das Namensschild. */
export function jahreText(p: PersonAngaben | undefined): string {
  if (!p) return '';
  const g = p.geburtsjahr, t = p.todesjahr;
  if (g && t) return `${g}–${t}`;
  if (g) return `*${g}`;
  if (t) return `†${t}`;
  return '';
}

/** Rolle + Ebene zu einem Key finden (für spätere Anzeige an der Figur). */
export function findeRolle(key: string): { rolle: KatalogRolle; ebene: KatalogEbene } | null {
  for (const ebene of PERSONEN_KATALOG) {
    const rolle = ebene.rollen.find(r => r.key === key);
    if (rolle) return { rolle, ebene };
  }
  return null;
}

/** Freier Platz in der Nähe der Mitte (Spirale), damit Figuren nicht übereinander landen. */
export function freierPlatz(belegt: Array<{ x: number; z: number }>, abstand = 1.6): { x: number; z: number } {
  for (let i = 0; i < 200; i++) {
    const r = i === 0 ? 0 : 0.9 + 0.5 * Math.sqrt(i);
    const a = i * 2.39996; // goldener Winkel
    const p = { x: +(r * Math.sin(a)).toFixed(2), z: +(r * Math.cos(a)).toFixed(2) };
    if (belegt.every(b => Math.hypot(b.x - p.x, b.z - p.z) >= abstand)) return p;
  }
  return { x: 0, z: 0 };
}

/** „Kind“, „Kind 2“, „Kind 3“ … wenn der Name schon vergeben ist. */
export function eindeutigerName(basis: string, vorhanden: string[]): string {
  if (!vorhanden.includes(basis)) return basis;
  let n = 2;
  while (vorhanden.includes(`${basis} ${n}`)) n++;
  return `${basis} ${n}`;
}
