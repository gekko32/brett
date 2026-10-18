// brett/src/client/figur-stil.ts
// Figurenart des Bretts (Gerald, 18.10.2026; technik/hetzner/BRETT-FIGUREN-REALISMUS.md):
//   klassisch  – Kugeln/Quader/Zylinder wie bisher
//   verfeinert – Kapseln, Hals, gerundeter Rumpf, Hände und Füße (Stufe a)
//   mannequin  – glatte MPFB-Figuren als GLB mit Skelett (Stufe b)
//
// Alle Arten hängen an denselben 14 Gelenk-Gruppen der Figur (mannequin.ts).
// Haltungen, Gelenke ziehen, Physik, Zubehör und Auswahl arbeiten weiter auf
// diesen Gruppen; die klassischen Teile bleiben unsichtbar als Klickfläche
// erhalten. Beim Mannequin folgen die Knochen des Modells in jedem Bild den
// Gruppen (Weltdrehung × Ruhe-Versatz).
//
// Die Art gilt für den ganzen Raum (Optik-Wert `figuren`). Der Abgleich läuft
// im Bildtakt: weicht die gewünschte Darstellung einer Figur ab, wird sie neu
// aufgebaut (auch für Figuren, deren Rolle/Name erst später ankommt).

import * as THREE from 'three';
import { STATE, SELECTION_DIM } from './state';
import { recolorFigure } from './mannequin';
import { applyFigureOpacity } from './mannequin-visuals';
import { geschlechtVon } from './genogramm-modell';

export type FigurStil = 'klassisch' | 'verfeinert' | 'mannequin';
export const FIGUR_STILE: FigurStil[] = ['klassisch', 'verfeinert', 'mannequin'];

let stil: FigurStil = 'klassisch';
export function getFigurStil(): FigurStil { return stil; }
export function setFigurStil(neu: string | undefined): void {
  stil = (FIGUR_STILE as string[]).includes(neu || '') ? (neu as FigurStil) : 'klassisch';
}

// Gesichtsausdruck/Zubehör nach dem Umbau neu anbringen (appearance.ts meldet sich hier an).
let gesichtNeu: ((fig: any) => void) | null = null;
export function setGesichtNeuAnbringen(fn: (fig: any) => void): void { gesichtNeu = fn; }

// ── Auswahl der Mannequin-Variante ──────────────────────────────────────────
export function varianteFuer(fig: any): string {
  const role: string = fig.role || '';
  const label: string = fig.label || '';
  const body: string = fig.appearance?.body || '';
  const kind = body === 'child' || ['kind', 'kind-verstorben', 'ungeboren'].includes(role)
    || /^(kind|sohn|tochter|baby)\b/i.test(label);
  if (kind) return 'kind';
  const g = geschlechtVon({ id: fig.id, role, label, geschlecht: fig.geschlecht } as any);
  const s = g === 'w' ? 'frau' : g === 'm' ? 'mann' : 'neutral';
  const alt = body === 'elder' || role.startsWith('gm-') || role.startsWith('gv-')
    || /^(oma|opa|gro(ß|ss)(mutter|vater)|ur)/i.test(label);
  return alt ? 'aelter_' + s : s;
}

function wunschSchluessel(fig: any): string {
  return stil === 'mannequin' ? 'mannequin:' + varianteFuer(fig) : stil;
}

// ── Gemeinsame Helfer ───────────────────────────────────────────────────────
function teileEntfernen(fig: any): void {
  const weg: THREE.Object3D[] = [];
  fig.root.traverse((o: any) => { if (o.userData?.stilTeil) weg.push(o); });
  for (const o of weg) {
    o.parent?.remove(o);
    o.traverse((m: any) => {
      if (m.isMesh && !m.userData?.geteilteGeometrie) m.geometry?.dispose?.();
      if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x: any) => x?.dispose?.());
    });
  }
  fig._modell = null;
  fig._gesicht = null;
}

function klassischeTeile(fig: any, sichtbar: boolean): void {
  fig.root.traverse((o: any) => {
    if (o.userData?.klassisch) o.visible = sichtbar;
    if (o.userData?.isContact) o.visible = sichtbar;
    if (o.name === 'faceNose') o.visible = sichtbar || stil === 'verfeinert';
  });
}

/** Gelenkpositionen der klassischen Figur merken bzw. wiederherstellen. */
function positionenMerken(fig: any): void {
  if (fig._posKlassisch) return;
  fig._posKlassisch = {};
  for (const [name, g] of Object.entries(fig.bones as Record<string, THREE.Object3D>)) fig._posKlassisch[name] = g.position.clone();
}
function positionenZurueck(fig: any): void {
  if (!fig._posKlassisch) return;
  for (const [name, p] of Object.entries(fig._posKlassisch as Record<string, THREE.Vector3>)) fig.bones[name]?.position.copy(p);
}

function nachUmbau(fig: any): void {
  if (fig.color) recolorFigure(fig, fig.color);
  applyFigureOpacity(fig, STATE.selectedId === fig.id ? 1.0 : SELECTION_DIM);
  gesichtNeu?.(fig);
}

// ── Stufe a: verfeinerte Grundformen ────────────────────────────────────────
function teil(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D,
  pos: [number, number, number], skala?: [number, number, number], rotX = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (skala) m.scale.set(...skala);
  if (rotX) m.rotation.x = rotX;
  m.userData.stilTeil = true;
  parent.add(m);
  return m;
}
function glied(parent: THREE.Object3D, r: number, laenge: number, mat: THREE.Material): void {
  const geo = new THREE.CapsuleGeometry(r, Math.max(0.01, laenge - 2 * r * 0.6), 6, 12);
  teil(geo, mat, parent, [0, -laenge / 2, 0]);
}

function verfeinertBauen(fig: any): void {
  const b = fig.bones;
  const mat = new THREE.MeshStandardMaterial({ color: fig.color || '#b8c0a8', roughness: 0.75, metalness: 0 });
  // Rumpf: Brustkorb (abgeflachte Kapsel) + Becken
  teil(new THREE.CapsuleGeometry(0.19, 0.34, 8, 18), mat, b.hips, [0, 0.42, 0], [1.25, 1, 0.62]);
  teil(new THREE.SphereGeometry(0.2, 18, 12), mat, b.hips, [0, 0.02, 0], [1.05, 0.62, 0.7]);
  // Hals und Kopf (leicht oval, Radius wie bisher → Gesichtsbild passt)
  teil(new THREE.CylinderGeometry(0.06, 0.075, 0.16, 12), mat, b.hips, [0, 0.74, 0]);
  teil(new THREE.SphereGeometry(0.16, 24, 18), mat, b.head, [0, 0, 0], [0.93, 1.08, 1]);
  // Arme und Beine
  glied(b.lShoulder, 0.068, 0.32, mat); glied(b.rShoulder, 0.068, 0.32, mat);
  glied(b.lElbow, 0.056, 0.30, mat); glied(b.rElbow, 0.056, 0.30, mat);
  glied(b.lHip, 0.09, 0.42, mat); glied(b.rHip, 0.09, 0.42, mat);
  glied(b.lKnee, 0.068, 0.40, mat); glied(b.rKnee, 0.068, 0.40, mat);
  // Hände (flach) und Füße (nach vorn = +Z)
  for (const w of [b.lWrist, b.rWrist]) teil(new THREE.SphereGeometry(0.055, 12, 10), mat, w, [0, -0.06, 0], [0.75, 1.3, 0.5]);
  for (const a of [b.lAnkle, b.rAnkle]) teil(new THREE.CapsuleGeometry(0.05, 0.12, 4, 10), mat, a, [0, -0.04, 0.06], undefined, Math.PI / 2);
}

// ── Stufe b: Mannequin aus GLB ──────────────────────────────────────────────
const ZIEL_HOEHE = 2.0; // wie die klassische Figur (Fuß bis Scheitel)
const HAUTTON = '#d9cbbb'; // neutral, kein bestimmter Hauttyp
type FigurInfo = { datei: string; hoehe: number; boden?: number; kopf?: { mitte: number[]; vorn: number; breite: number } };
let infoPromise: Promise<Record<string, FigurInfo>> | null = null;
const modellCache = new Map<string, Promise<any>>();

function infos(): Promise<Record<string, FigurInfo>> {
  infoPromise ??= fetch('/assets/figuren/figuren.json').then(r => r.json()).then(j => j.figuren || {});
  return infoPromise;
}
function modell(name: string): Promise<any> {
  if (!modellCache.has(name)) {
    modellCache.set(name, import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) =>
      new GLTFLoader().loadAsync('/assets/figuren/' + name + '.glb')));
  }
  return modellCache.get(name)!;
}

// Unsere Gelenke → Knochen des MPFB-Skeletts „game_engine“ (Eltern zuerst).
const ZUORDNUNG: Array<[string, string]> = [
  ['hips', 'pelvis'], ['head', 'head'],
  ['lShoulder', 'upperarm_l'], ['lElbow', 'lowerarm_l'], ['lWrist', 'hand_l'],
  ['rShoulder', 'upperarm_r'], ['rElbow', 'lowerarm_r'], ['rWrist', 'hand_r'],
  ['lHip', 'thigh_l'], ['lKnee', 'calf_l'], ['lAnkle', 'foot_l'],
  ['rHip', 'thigh_r'], ['rKnee', 'calf_r'], ['rAnkle', 'foot_r'],
];
// Für die Gelenkpositionen: welcher Knochen ist der „Elternpunkt“ unserer Gruppe?
const ELTERN: Record<string, string | null> = {
  hips: null, head: 'hips', lShoulder: 'hips', rShoulder: 'hips', lHip: 'hips', rHip: 'hips',
  lElbow: 'lShoulder', rElbow: 'rShoulder', lWrist: 'lElbow', rWrist: 'rElbow',
  lKnee: 'lHip', rKnee: 'rHip', lAnkle: 'lKnee', rAnkle: 'rKnee',
};

async function mannequinBauen(fig: any, variante: string, schluessel: string): Promise<void> {
  const [alle, gltf, { clone }] = await Promise.all([
    infos(), modell(variante), import('three/examples/jsm/utils/SkeletonUtils.js'),
  ]);
  // Inzwischen anders entschieden (Stil gewechselt, Figur gelöscht)?
  if (fig._stilSchluessel !== schluessel || !fig.root.parent) return;
  const info = alle[variante];
  if (!info) return;

  const k = ZIEL_HOEHE / info.hoehe;
  const huelle = new THREE.Group();
  huelle.userData.stilTeil = true;
  huelle.scale.setScalar(k);
  huelle.position.y = -(info.boden ?? 0) * k; // Schuhsohlen genau auf den Boden
  const szene = clone(gltf.scene);
  huelle.add(szene);
  fig.root.add(huelle);

  let mitSkelett = false;
  szene.traverse((o: any) => {
    if (o.isMesh) {
      o.userData.geteilteGeometrie = true; // Geometrie teilen sich alle Klone
      // Kleidung in der Ebenenfarbe, sichtbare Haut (Kopf, Hände) in festem neutralem Ton.
      let istHaut = false;
      for (let x: any = o; x && x !== szene; x = x.parent) if (/^Koerper/.test(x.name || '')) istHaut = true;
      o.material = istHaut
        ? new THREE.MeshStandardMaterial({ color: HAUTTON, roughness: 0.8, metalness: 0 })
        : new THREE.MeshStandardMaterial({ color: fig.color || '#b8c0a8', roughness: 0.85, metalness: 0 });
      if (istHaut) o.userData.festeFarbe = true;
      o.frustumCulled = false;
      o.raycast = () => { /* Klicks treffen die unsichtbaren Grundformen */ };
      if (o.isSkinnedMesh) mitSkelett = true;
    }
  });
  if (!mitSkelett) return;

  // Ruhelage: Knochenpositionen (im Raum der Figur) und Ruhe-Versatz der Drehung.
  fig.root.updateMatrixWorld(true);
  const rootQ = fig.root.getWorldQuaternion(new THREE.Quaternion());
  const rootQInv = rootQ.clone().invert();
  const pos = (knochen: THREE.Object3D) => fig.root.worldToLocal(knochen.getWorldPosition(new THREE.Vector3()));
  const knochenVon = new Map<string, THREE.Object3D>();
  for (const [gelenk, name] of ZUORDNUNG) {
    const kn = szene.getObjectByName(name);
    if (kn) knochenVon.set(gelenk, kn);
  }
  if (knochenVon.size !== ZUORDNUNG.length) return;

  // Gelenk-Gruppen auf die Gelenke des Modells setzen (Kopf: Kopfmitte).
  positionenMerken(fig);
  const p: Record<string, THREE.Vector3> = {};
  for (const [gelenk] of ZUORDNUNG) p[gelenk] = pos(knochenVon.get(gelenk)!);
  if (info.kopf) p.head = new THREE.Vector3(info.kopf.mitte[0], info.kopf.mitte[1], info.kopf.mitte[2]).multiplyScalar(k);
  // MPFB steht in A-Haltung (Arme schräg ab). Unsere Ruhelage hat hängende
  // Arme und gerade Beine → Glieder des Modells senkrecht nach unten drehen
  // (Gerald 16.10.: „Arme anlegen“). Korrektur gilt für Lage und Drehung.
  const korrektur: Record<string, THREE.Quaternion> = {};
  const unten = new THREE.Vector3(0, -1, 0);
  for (const [a, b, c] of [['lShoulder', 'lElbow', 'lWrist'], ['rShoulder', 'rElbow', 'rWrist'],
                           ['lHip', 'lKnee', 'lAnkle'], ['rHip', 'rKnee', 'rAnkle']]) {
    const C = new THREE.Quaternion().setFromUnitVectors(p[c].clone().sub(p[a]).normalize(), unten);
    for (const x of [b, c]) p[x] = p[a].clone().add(p[x].clone().sub(p[a]).applyQuaternion(C));
    for (const x of [a, b, c]) korrektur[x] = C;
  }
  for (const [gelenk] of ZUORDNUNG) {
    const eltern = ELTERN[gelenk];
    const ziel = eltern ? p[gelenk].clone().sub(p[eltern]) : p[gelenk];
    fig.bones[gelenk].position.copy(ziel);
  }

  const paare = ZUORDNUNG.map(([gelenk]) => {
    const kn = knochenVon.get(gelenk)!;
    const versatz = (korrektur[gelenk]?.clone() ?? new THREE.Quaternion())
      .multiply(rootQInv.clone().multiply(kn.getWorldQuaternion(new THREE.Quaternion())));
    return { g: fig.bones[gelenk] as THREE.Object3D, b: kn, versatz };
  });
  fig._modell = { huelle, paare };
  if (info.kopf) {
    fig._gesicht = { z: (info.kopf.vorn - info.kopf.mitte[2]) * k + 0.004, groesse: info.kopf.breite * k * 0.95 };
  }
  nachUmbau(fig);
  posenAbgleichen(fig);
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
/** Knochen des Modells auf die aktuelle Lage der Gelenk-Gruppen setzen. */
function posenAbgleichen(fig: any): void {
  const m = fig._modell;
  if (!m) return;
  for (const { g, b, versatz } of m.paare) {
    g.getWorldQuaternion(qa).multiply(versatz);
    b.parent!.getWorldQuaternion(qb).invert();
    b.quaternion.copy(qb.multiply(qa));
  }
}

// ── Umschalten und Bildtakt ─────────────────────────────────────────────────
function anwenden(fig: any, schluessel: string): void {
  teileEntfernen(fig);
  positionenZurueck(fig);
  fig._stilSchluessel = schluessel;
  if (schluessel === 'klassisch') {
    klassischeTeile(fig, true);
    nachUmbau(fig);
  } else if (schluessel === 'verfeinert') {
    klassischeTeile(fig, false);
    verfeinertBauen(fig);
    nachUmbau(fig);
  } else {
    klassischeTeile(fig, false);
    nachUmbau(fig);
    mannequinBauen(fig, schluessel.split(':')[1], schluessel).catch((e) => {
      console.warn('[brett] Mannequin konnte nicht geladen werden, nutze verfeinert', e);
      if (fig._stilSchluessel === schluessel) { verfeinertBauen(fig); nachUmbau(fig); }
    });
  }
}

/** Im Bildtakt aufrufen: Darstellung abgleichen, Mannequin-Knochen nachführen. */
export function tickFigurStil(): void {
  for (const fig of STATE.figures as any[]) {
    if (!fig?.root || !fig.bones) continue;
    const soll = wunschSchluessel(fig);
    if ((fig._stilSchluessel ?? 'klassisch') !== soll) anwenden(fig, soll);
    if (fig._modell) posenAbgleichen(fig);
  }
}
