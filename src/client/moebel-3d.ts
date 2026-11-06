// brett/src/client/moebel-3d.ts
// Möbel und Wände im Spielfeld (Gerald 06.11.2026): schlicht, einfarbig,
// passend zu den reduzierten Figuren. Hinzufügen, drehen, Länge und Löschen
// im Steuerpult; verschieben hier mit der Maus (nur Leitung/Admin).
// Server-autoritativ: Änderungen gehen als admin_moebel_set (ganze Liste)
// und kommen als moebel_changed zurück.

import * as THREE from 'three';
import { getScene, getWs, isWsReady } from './state';
import { type Moebel, grundriss } from '../types/moebel';

let liste: Moebel[] = [];
const gruppen = new Map<string, THREE.Group>();

const HOLZ = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.8 });
const POLSTER = new THREE.MeshStandardMaterial({ color: 0x6b6f78, roughness: 0.9 });
const WAND = new THREE.MeshStandardMaterial({ color: 0xd9d3c7, roughness: 0.95 });
const RAHMEN = new THREE.MeshStandardMaterial({ color: 0x7a5c40, roughness: 0.8 });

function kasten(b: number, h: number, t: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(b, h, t), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function beine(g: THREE.Group, b: number, t: number, h: number, mat: THREE.Material, dicke = 0.06): void {
  const dx = b / 2 - dicke, dz = t / 2 - dicke;
  for (const [x, z] of [[-dx, -dz], [dx, -dz], [-dx, dz], [dx, dz]]) g.add(kasten(dicke, h, dicke, mat, x, h / 2, z));
}

/** 3D-Modell eines Stücks (lokal: vorn = +Z, Boden = y 0). */
export function baueModell(m: Moebel): THREE.Group {
  const g = new THREE.Group();
  const { breite, tiefe } = grundriss(m);
  switch (m.art) {
    case 'tisch':
      g.add(kasten(breite, 0.06, tiefe, HOLZ, 0, 0.82, 0));
      beine(g, breite, tiefe, 0.79, HOLZ);
      break;
    case 'rundtisch': {
      const platte = new THREE.Mesh(new THREE.CylinderGeometry(breite / 2, breite / 2, 0.06, 40), HOLZ);
      platte.position.y = 0.82; platte.castShadow = true; g.add(platte);
      const fuss = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.79, 12), HOLZ);
      fuss.position.y = 0.4; g.add(fuss);
      const teller = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 24), HOLZ);
      teller.position.y = 0.02; g.add(teller);
      break;
    }
    case 'stuhl':
      g.add(kasten(breite, 0.05, tiefe, HOLZ, 0, 0.5, 0));
      beine(g, breite, tiefe, 0.48, HOLZ, 0.045);
      // Lehne hinten (vorn = +Z → Lehne bei -Z)
      g.add(kasten(breite, 0.5, 0.05, HOLZ, 0, 0.78, -tiefe / 2 + 0.025));
      break;
    case 'sessel':
      g.add(kasten(breite, 0.42, tiefe, POLSTER, 0, 0.21, 0));
      g.add(kasten(breite, 0.55, 0.18, POLSTER, 0, 0.69, -tiefe / 2 + 0.09));
      g.add(kasten(0.14, 0.25, tiefe, POLSTER, -breite / 2 + 0.07, 0.54, 0));
      g.add(kasten(0.14, 0.25, tiefe, POLSTER, breite / 2 - 0.07, 0.54, 0));
      break;
    case 'bank':
      g.add(kasten(breite, 0.06, tiefe, HOLZ, 0, 0.48, 0));
      beine(g, breite, tiefe, 0.45, HOLZ);
      break;
    case 'wand':
      g.add(kasten(breite, 1.3, tiefe, WAND, 0, 0.65, 0));
      break;
    case 'tuer': {
      const h = 2.3, p = 0.12;
      g.add(kasten(p, h, tiefe, RAHMEN, -breite / 2 + p / 2, h / 2, 0));
      g.add(kasten(p, h, tiefe, RAHMEN, breite / 2 - p / 2, h / 2, 0));
      g.add(kasten(breite, p, tiefe, RAHMEN, 0, h - p / 2, 0));
      g.add(kasten(breite, 0.02, tiefe + 0.1, RAHMEN, 0, 0.01, 0)); // Schwelle
      break;
    }
  }
  g.position.set(m.x, 0, m.z);
  g.rotation.y = m.facingY;
  g.userData.moebelId = m.id;
  return g;
}

function entsorge(g: THREE.Group): void {
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
  g.parent?.remove(g);
}

function szene(): THREE.Scene | null {
  try { return getScene()?.scene ?? null; } catch { return null; }
}

/** Liste übernehmen und neu zeichnen (ohne Szene: merken, später zeichnen). */
export function setzeMoebel(neu: Moebel[] | undefined | null): void {
  liste = Array.isArray(neu) ? neu.map(m => ({ ...m })) : [];
  zeichne();
}

export function zeichne(): void {
  const s = szene();
  if (!s) return;
  for (const g of gruppen.values()) entsorge(g);
  gruppen.clear();
  for (const m of liste) {
    const g = baueModell(m);
    s.add(g);
    gruppen.set(m.id, g);
  }
}

export function aktuelleMoebel(): Moebel[] { return liste.map(m => ({ ...m })); }

function sende(neu: Moebel[]): void {
  const ws = getWs();
  if (isWsReady() && ws) ws.send(JSON.stringify({ type: 'admin_moebel_set', moebel: neu }));
}

// ── Verschieben mit der Maus ─────────────────────────────────────────────────
interface Refs {
  renderer: THREE.WebGLRenderer;
  raycaster: THREE.Raycaster;
  mannequin: any;
  floor: THREE.Object3D;
}

function strahl(e: MouseEvent, refs: Refs): boolean {
  refs.mannequin.setNdc(e);
  const { ndc } = refs.mannequin.getTickRefs();
  if (!ndc) return false;
  refs.raycaster.setFromCamera(ndc, getScene().camera);
  return true;
}

function waehleMoebel(e: MouseEvent, refs: Refs): string | null {
  if (!gruppen.size || !strahl(e, refs)) return null;
  const treffer = refs.raycaster.intersectObjects([...gruppen.values()], true)[0];
  let o: THREE.Object3D | null = treffer?.object ?? null;
  while (o) { if (o.userData?.moebelId) return o.userData.moebelId; o = o.parent; }
  return null;
}

function bodenPunkt(e: MouseEvent, refs: Refs): { x: number; z: number } | null {
  if (!strahl(e, refs)) return null;
  const hit = refs.raycaster.intersectObject(refs.floor, false)[0];
  return hit ? { x: Math.round(hit.point.x * 20) / 20, z: Math.round(hit.point.z * 20) / 20 } : null;
}

export function initMoebelVerschieben(refs: Refs): void {
  zeichne(); // falls Möbel vor der Szene ankamen
  if (!(window as any).__brettCurrentUserIsAdmin) return;
  const el = refs.renderer.domElement;
  let zug: { id: string; dx: number; dz: number } | null = null;

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.shiftKey) return;
    if (refs.mannequin.pickContact?.(e)) return; // Figur hat Vorrang
    const id = waehleMoebel(e, refs);
    if (!id) return;
    const m = liste.find(x => x.id === id);
    const p = bodenPunkt(e, refs);
    if (!m || !p) return;
    zug = { id, dx: m.x - p.x, dz: m.z - p.z };
    el.style.cursor = 'grabbing';
    e.preventDefault();
    e.stopImmediatePropagation();
  }, { capture: true });

  window.addEventListener('mousemove', (e) => {
    if (!zug) return;
    const p = bodenPunkt(e, refs);
    const g = gruppen.get(zug.id);
    if (!p || !g) return;
    g.position.x = p.x + zug.dx;
    g.position.z = p.z + zug.dz;
  });

  window.addEventListener('mouseup', () => {
    if (!zug) return;
    const g = gruppen.get(zug.id);
    const id = zug.id;
    zug = null;
    el.style.cursor = '';
    if (!g) return;
    const neu = liste.map(m => m.id === id ? { ...m, x: Math.round(g.position.x * 100) / 100, z: Math.round(g.position.z * 100) / 100 } : m);
    liste = neu;
    sende(neu);
  });
}
