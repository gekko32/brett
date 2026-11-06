// brett/src/types/moebel.ts
// Möbel und Wände (Gerald 06.11.2026): Tisch, Stühle und einfache Wände als
// räumliche Begrenzung, bei Bedarf hinzufügbar. Gemeinsam für Server
// (Prüfung/Speicherung), Spielfeld (3D), Steuerpult und Vergleich.
// Keine DOM-/THREE-Abhängigkeit → testbar (test/moebel.test.ts).
//
// Maße in Brett-Einheiten: eine Figur ist etwa 2 Einheiten hoch (≈ 1 Einheit
// ≈ 90 cm). Möbel tragen keine Bedeutung – die gibt der Klient.

export type MoebelArt = 'tisch' | 'rundtisch' | 'stuhl' | 'sessel' | 'bank' | 'wand' | 'tuer';

export interface Moebel {
  id: string;
  art: MoebelArt;
  x: number;
  z: number;
  /** Drehung um die Hochachse (wie Figuren: vorn = +Z). */
  facingY: number;
  /** Länge für Wand, Bank und Tisch (sonst ignoriert). */
  laenge?: number;
}

interface ArtInfo { name: string; breite: number; tiefe: number; laengeVon?: number; laengeBis?: number }

/** Grundmaße je Art. breite = entlang der lokalen X-Achse, tiefe = entlang Z. */
export const MOEBEL_ARTEN: Record<MoebelArt, ArtInfo> = {
  tisch:     { name: 'Tisch',     breite: 1.6, tiefe: 0.9, laengeVon: 0.8, laengeBis: 6 },
  rundtisch: { name: 'Rundtisch', breite: 1.2, tiefe: 1.2 },
  stuhl:     { name: 'Stuhl',     breite: 0.5, tiefe: 0.5 },
  sessel:    { name: 'Sessel',    breite: 0.9, tiefe: 0.85 },
  bank:      { name: 'Bank',      breite: 1.8, tiefe: 0.5, laengeVon: 0.8, laengeBis: 6 },
  wand:      { name: 'Wand',      breite: 3.0, tiefe: 0.12, laengeVon: 0.5, laengeBis: 20 },
  tuer:      { name: 'Tür',       breite: 1.1, tiefe: 0.15 },
};

export const MAX_MOEBEL = 80;
const GRENZE = 19; // Boden ist 40 × 40

const zahl = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);
const klemme = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rund = (v: number) => Math.round(v * 100) / 100;

export function istMoebelArt(v: unknown): v is MoebelArt {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(MOEBEL_ARTEN, v);
}

/** Ein Stück prüfen und bereinigen; Ungültiges → null. */
export function normalisiereStueck(roh: any): Moebel | null {
  if (!roh || typeof roh !== 'object' || !istMoebelArt(roh.art)) return null;
  const id = typeof roh.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(roh.id) ? roh.id : null;
  if (!id) return null;
  const info = MOEBEL_ARTEN[roh.art as MoebelArt];
  const m: Moebel = {
    id, art: roh.art,
    x: rund(klemme(zahl(roh.x, 0), -GRENZE, GRENZE)),
    z: rund(klemme(zahl(roh.z, 0), -GRENZE, GRENZE)),
    facingY: rund(zahl(roh.facingY, 0) % (Math.PI * 2)),
  };
  if (info.laengeVon !== undefined) {
    m.laenge = rund(klemme(zahl(roh.laenge, info.breite), info.laengeVon, info.laengeBis!));
  }
  return m;
}

/** Ganze Liste prüfen: Ungültiges fällt weg, doppelte IDs nur einmal, höchstens MAX_MOEBEL. */
export function normalisiereMoebel(roh: unknown): Moebel[] {
  if (!Array.isArray(roh)) return [];
  const ids = new Set<string>();
  const aus: Moebel[] = [];
  for (const r of roh) {
    const m = normalisiereStueck(r);
    if (!m || ids.has(m.id)) continue;
    ids.add(m.id);
    aus.push(m);
    if (aus.length >= MAX_MOEBEL) break;
  }
  return aus;
}

/** Grundfläche (für Draufsicht und Abstände). */
export function grundriss(m: Pick<Moebel, 'art' | 'laenge'>): { breite: number; tiefe: number } {
  const info = MOEBEL_ARTEN[m.art];
  return { breite: info.laengeVon !== undefined ? (m.laenge ?? info.breite) : info.breite, tiefe: info.tiefe };
}

/**
 * Stühle rund um einen Tisch: je eine Seite (eckig) bzw. gleichmäßig im Kreis
 * (rund), alle zum Tisch gewandt.
 */
export function stuehleUmTisch(tisch: Moebel, anzahl: number, neueId: () => string): Moebel[] {
  const n = klemme(Math.round(anzahl), 1, 12);
  const aus: Moebel[] = [];
  const { breite, tiefe } = grundriss(tisch);
  for (let i = 0; i < n; i++) {
    let lx: number, lz: number;
    if (tisch.art === 'rundtisch') {
      const w = (i / n) * Math.PI * 2;
      const r = breite / 2 + 0.45;
      lx = Math.sin(w) * r; lz = Math.cos(w) * r;
    } else {
      // abwechselnd vorn/hinten, verteilt über die Länge; ab 2 je Seite auch an die Stirnseiten
      const proSeite = Math.ceil(n / 2);
      const seite = i % 2 === 0 ? 1 : -1;
      const k = Math.floor(i / 2);
      const schritt = breite / proSeite;
      lx = -breite / 2 + schritt * (k + 0.5);
      lz = seite * (tiefe / 2 + 0.4);
    }
    // in Weltkoordinaten drehen (THREE rotation.y: x' = x cos + z sin, z' = -x sin + z cos)
    const c = Math.cos(tisch.facingY), s = Math.sin(tisch.facingY);
    const x = tisch.x + lx * c + lz * s;
    const z = tisch.z - lx * s + lz * c;
    // zum Tischmittelpunkt schauen: vorn = +Z → facing = atan2(dx, dz)
    const facingY = Math.atan2(tisch.x - x, tisch.z - z);
    aus.push({ id: neueId(), art: 'stuhl', x: rund(x), z: rund(z), facingY: rund(facingY) });
  }
  return aus;
}
