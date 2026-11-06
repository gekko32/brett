// brett/src/client/vergleich-modell.ts
// Reine Logik fürs Vergleichsfenster (Baustein 4, Gerald 06.11.2026).
// Kein DOM, kein THREE → unit-testbar (test/vergleich-modell.test.ts).
//
// Grundsatz (BRETT-ARBEITSRAUM-PROMPT.md): nichts deuten, nichts bewerten.
// Das Fenster zeigt zwei Aufstellungen im gleichen Maßstab und nennt nur
// Tatsachen (welche Namen nur in einer der beiden vorkommen).

import { normalisiereMoebel, grundriss } from '../types/moebel';

export interface PlanFigur { id: string; x: number; z: number; facingY: number; label: string; color: string; scale: number; opacity: number }
export interface PlanZone { x: number; z: number; shape: 'rect' | 'circle'; width: number; height: number; radius: number; label: string; color: string; opacity: number; frame: boolean }
export interface PlanAnker { x: number; z: number; label: string; color: string }
export interface PlanLinie { fromId: string; toId: string; label: string; color: string }
export interface PlanMoebel { x: number; z: number; facingY: number; art: string; breite: number; tiefe: number }
export interface Plan { figuren: PlanFigur[]; zonen: PlanZone[]; anker: PlanAnker[]; linien: PlanLinie[]; moebel: PlanMoebel[]; notiz?: string }

const zahl = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const liste = (v: unknown): any[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);

const LINIENFARBE: Record<string, string> = { relationship: '#2f6fb0', tension: '#c0392b', resource: '#2e8b57' };

/** Gespeicherten Stand (brett_snapshots.state) in einen Plan übersetzen. Fehlertolerant. */
export function planAusState(state: any): Plan {
  const s = state && typeof state === 'object' ? state : {};
  const figuren: PlanFigur[] = liste(s.figures)
    .filter(f => f && typeof f.id === 'string' && !f.hidden && !String(f.id).startsWith('__'))
    .map(f => ({
      id: f.id, x: zahl(f.x, 0), z: zahl(f.z, 0), facingY: zahl(f.facingY, 0),
      label: text(f.label), color: text(f.color) || text(f.appearance?.color) || '#8a8f98',
      scale: zahl(f.scale, 1), opacity: zahl(f.opacity, 1),
    }));
  const zonen: PlanZone[] = liste(s.zones).filter(z => z && typeof z === 'object').map(z => ({
    x: zahl(z.x, 0), z: zahl(z.z, 0), shape: z.shape === 'circle' ? 'circle' : 'rect',
    width: zahl(z.width, 2), height: zahl(z.height, 2), radius: zahl(z.radius, 1.5),
    label: text(z.label), color: text(z.color) || '#4ea1ff', opacity: zahl(z.opacity, 0.25), frame: z.variant === 'frame',
  }));
  const anker: PlanAnker[] = liste(s.anchors).filter(a => a && typeof a === 'object').map(a => ({
    x: zahl(a.x, 0), z: zahl(a.z, 0), label: text(a.label), color: text(a.color) || '#c8a96e',
  }));
  const ids = new Set(figuren.map(f => f.id));
  const linien: PlanLinie[] = liste(s.lines)
    .filter(l => l && !l.struktur && ids.has(l.fromId) && ids.has(l.toId))
    .map(l => ({ fromId: l.fromId, toId: l.toId, label: text(l.label) || text(l.art), color: LINIENFARBE[l.lineType] || '#2f6fb0' }));
  // Möbel und Wände (06.11.2026): gleiche Prüfung und Maße wie auf dem Brett.
  const moebel: PlanMoebel[] = normalisiereMoebel(liste(s.moebel)).map(m => ({
    x: m.x, z: m.z, facingY: m.facingY, art: m.art, ...grundriss(m),
  }));
  const notiz = text(s.sitzungsnotiz);
  return notiz ? { figuren, zonen, anker, linien, moebel, notiz } : { figuren, zonen, anker, linien, moebel };
}

export interface Rahmen { minX: number; maxX: number; minZ: number; maxZ: number }

/** Gemeinsamer Ausschnitt beider Pläne (gleicher Maßstab links und rechts), mit Rand. */
export function gemeinsamerRahmen(plaene: Plan[], rand = 1): Rahmen {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const nimm = (x: number, z: number, r = 0) => {
    minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r);
    minZ = Math.min(minZ, z - r); maxZ = Math.max(maxZ, z + r);
  };
  for (const p of plaene) {
    for (const f of p.figuren) nimm(f.x, f.z, 0.3);
    for (const a of p.anker) nimm(a.x, a.z);
    for (const m of p.moebel) nimm(m.x, m.z, Math.max(m.breite, m.tiefe) / 2);
    for (const z of p.zonen) {
      if (z.shape === 'circle') nimm(z.x, z.z, z.radius);
      else { nimm(z.x - z.width / 2, z.z - z.height / 2); nimm(z.x + z.width / 2, z.z + z.height / 2); }
    }
  }
  if (!isFinite(minX)) { minX = -2; maxX = 2; minZ = -2; maxZ = 2; }
  // Mindestgröße, damit eine einzelne Figur nicht riesig erscheint.
  const mitteX = (minX + maxX) / 2, mitteZ = (minZ + maxZ) / 2;
  const halb = Math.max(2, (maxX - minX) / 2, (maxZ - minZ) / 2) + rand;
  return { minX: mitteX - halb, maxX: mitteX + halb, minZ: mitteZ - halb, maxZ: mitteZ + halb };
}

/**
 * Blickrichtung in der Draufsicht. Vorn = lokal +Z, gedreht um facingY
 * (wie THREE rotation.y) → (sin, cos). +Z zeigt im Plan nach unten (zum
 * Betrachter, wie die Startansicht des Bretts).
 */
export function blick(facingY: number): { dx: number; dz: number } {
  return { dx: Math.sin(facingY), dz: Math.cos(facingY) };
}

/** Tatsachen ohne Bewertung: welche Namen kommen nur links bzw. nur rechts vor? */
export function nurInEinem(a: Plan, b: Plan): { nurA: string[]; nurB: string[] } {
  const na = new Set(a.figuren.map(f => f.label).filter(Boolean));
  const nb = new Set(b.figuren.map(f => f.label).filter(Boolean));
  const sortiert = (s: Iterable<string>) => [...s].sort((x, y) => x.localeCompare(y, 'de'));
  return { nurA: sortiert([...na].filter(n => !nb.has(n))), nurB: sortiert([...nb].filter(n => !na.has(n))) };
}
