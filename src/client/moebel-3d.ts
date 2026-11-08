// brett/src/client/moebel-3d.ts
// Möbel und Wände im Spielfeld (Gerald 06.11.2026): schlicht, einfarbig,
// passend zu den reduzierten Figuren. Hinzufügen, drehen, Länge und Löschen
// im Steuerpult; verschieben hier mit der Maus (nur Leitung/Admin).
// Server-autoritativ: Änderungen gehen als admin_moebel_set (ganze Liste)
// und kommen als moebel_changed zurück.

import * as THREE from 'three';
import { STATE, getScene, getWs, isWsReady } from './state';
import { type Moebel, type FigurPos, grundriss, mitnehmen, sitzendeAuf, sitztAufPlatz, naechsterSitzplatz } from '../types/moebel';
import { applyPreset } from './presets';
import { sendMove } from './ws-client';

let liste: Moebel[] = [];
const gruppen = new Map<string, THREE.Group>();

const HOLZ = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.8 });
const POLSTER = new THREE.MeshStandardMaterial({ color: 0x6b6f78, roughness: 0.9 });
const WAND = new THREE.MeshStandardMaterial({ color: 0xd9d3c7, roughness: 0.95 });
const RAHMEN = new THREE.MeshStandardMaterial({ color: 0x7a5c40, roughness: 0.8 });
// Unsichtbare Griff-Fläche: Ein besetzter Stuhl ist sonst kaum zu treffen (Handy).
const GRIFF = new THREE.MeshBasicMaterial({ visible: false });

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
      // Sitzfläche oben bei 0,42 = Oberschenkel einer sitzenden Figur (Haltung „Sitzen“).
      g.add(kasten(breite, 0.05, tiefe, HOLZ, 0, 0.395, 0));
      beine(g, breite, tiefe, 0.37, HOLZ, 0.045);
      // Lehne hinten (vorn = +Z → Lehne bei -Z)
      g.add(kasten(breite, 0.5, 0.05, HOLZ, 0, 0.67, -tiefe / 2 + 0.025));
      break;
    case 'sessel':
      g.add(kasten(breite, 0.42, tiefe, POLSTER, 0, 0.21, 0));
      g.add(kasten(breite, 0.55, 0.18, POLSTER, 0, 0.69, -tiefe / 2 + 0.09));
      g.add(kasten(0.14, 0.25, tiefe, POLSTER, -breite / 2 + 0.07, 0.54, 0));
      g.add(kasten(0.14, 0.25, tiefe, POLSTER, breite / 2 - 0.07, 0.54, 0));
      break;
    case 'bank':
      g.add(kasten(breite, 0.06, tiefe, HOLZ, 0, 0.39, 0));
      beine(g, breite, tiefe, 0.36, HOLZ);
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
  if (m.art === 'stuhl' || m.art === 'sessel' || m.art === 'bank') {
    const griff = new THREE.Mesh(new THREE.BoxGeometry(breite + 0.7, 0.02, tiefe + 0.7), GRIFF);
    griff.position.y = 0.01;
    g.add(griff);
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
  // Auswahl überlebt das Neuzeichnen; gelöschtes Möbel → Auswahl weg.
  if (auswahl && !gruppen.has(auswahl)) setzeAuswahl(null);
  else if (auswahl) rahmenNeu();
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

function strahl(e: { clientX: number; clientY: number }, refs: Refs): boolean {
  refs.mannequin.setNdc(e);
  const { ndc } = refs.mannequin.getTickRefs();
  if (!ndc) return false;
  refs.raycaster.setFromCamera(ndc, getScene().camera);
  return true;
}

type Punkt = { clientX: number; clientY: number };

// Gemeinsam für Maus und Finger (Tablet/Handy, 06.11.2026).
// Antippen = auswählen (Knöpfe ⟲ ⟳ ✕ am Möbel), Ziehen = verschieben (08.11.2026).
let refsGlobal: Refs | null = null;
interface Zug { id: string; dx: number; dz: number; sx: number; sy: number; bewegt: boolean; alt: Moebel; figStart: FigurPos[] }
let zug: Zug | null = null;
const darfVerschieben = () => !!refsGlobal && !!(window as any).__brettCurrentUserIsAdmin;

function figurenPos(): FigurPos[] {
  return STATE.figures.map((f: any) => ({ id: f.id, x: f.root.position.x, z: f.root.position.z, preset: f.preset }));
}
function setzeFigurLokal(id: string, x: number, z: number, facingY: number): void {
  const f: any = STATE.figures.find((g: any) => g.id === id);
  if (!f) return;
  f.root.position.x = x; f.root.position.z = z;
  f.facingY = facingY; f.root.rotation.y = facingY;
}

/** Möbel ändern; wer darauf sitzt, kommt mit. */
function aendere(id: string, patch: Partial<Moebel>, figuren: FigurPos[] = figurenPos()): void {
  const alt = liste.find(m => m.id === id);
  if (!alt) return;
  const neu = { ...alt, ...patch };
  liste = liste.map(m => m.id === id ? neu : m);
  sende(liste);
  for (const p of mitnehmen(alt, neu, figuren)) {
    setzeFigurLokal(p.id, p.x, p.z, p.facingY);
    sendMove(p.id, p.x, p.z, p.facingY);
  }
  zeichne();
}

function loesche(id: string): void {
  const m = liste.find(x => x.id === id);
  if (!m) return;
  for (const f of sitzendeAuf(m, figurenPos())) applyPreset(f.id, 'stand');
  liste = liste.filter(x => x.id !== id);
  sende(liste);
  setzeAuswahl(null);
  zeichne();
}

// ── Auswahl: Rahmen um das Möbel, Knöpfe darüber ─────────────────────────────
let auswahl: string | null = null;
let rahmen: THREE.BoxHelper | null = null;
let menue: HTMLDivElement | null = null;
let schleife = 0;

function baueMenue(): HTMLDivElement {
  const d = document.createElement('div');
  d.id = 'moebel-menue';
  Object.assign(d.style, { position: 'fixed', display: 'none', gap: '6px', zIndex: '60', transform: 'translate(-50%, -100%)' } as CSSStyleDeclaration);
  const knopf = (text: string, titel: string, f: () => void) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = text; b.title = titel;
    Object.assign(b.style, { minWidth: '44px', minHeight: '44px', fontSize: '20px', borderRadius: '10px', cursor: 'pointer',
      background: 'rgba(14,17,22,0.9)', color: '#f3efe6', border: '1px solid rgba(200,169,110,0.7)' } as CSSStyleDeclaration);
    b.addEventListener('click', f);
    d.append(b);
  };
  knopf('⟲', 'Nach links drehen', () => { const m = liste.find(x => x.id === auswahl); if (m) aendere(m.id, { facingY: m.facingY + Math.PI / 4 }); });
  knopf('⟳', 'Nach rechts drehen', () => { const m = liste.find(x => x.id === auswahl); if (m) aendere(m.id, { facingY: m.facingY - Math.PI / 4 }); });
  knopf('✕', 'Möbel entfernen', () => { if (auswahl) loesche(auswahl); });
  document.body.append(d);
  return d;
}

function menueNachfuehren(): void {
  cancelAnimationFrame(schleife);
  if (!auswahl) { if (menue) menue.style.display = 'none'; return; }
  const g = gruppen.get(auswahl);
  if (g && refsGlobal && menue) {
    const v = new THREE.Vector3(g.position.x, 1.5, g.position.z).project(getScene().camera);
    const r = refsGlobal.renderer.domElement.getBoundingClientRect();
    menue.style.left = `${Math.max(90, Math.min(r.width - 90, r.left + (v.x + 1) / 2 * r.width))}px`;
    menue.style.top = `${Math.max(100, r.top + (1 - v.y) / 2 * r.height)}px`;
    menue.style.display = 'flex';
    rahmen?.update();
  }
  schleife = requestAnimationFrame(menueNachfuehren);
}

function rahmenNeu(): void {
  if (rahmen) { rahmen.parent?.remove(rahmen); rahmen.geometry.dispose(); rahmen = null; }
  const g = auswahl ? gruppen.get(auswahl) : null;
  const s = szene();
  if (g && s) { rahmen = new THREE.BoxHelper(g, 0xc8a96e); s.add(rahmen); }
}

function setzeAuswahl(id: string | null): void {
  auswahl = id;
  if (id && !menue) menue = baueMenue();
  rahmenNeu();
  menueNachfuehren();
}

function waehleMoebel(e: Punkt, refs: Refs): string | null {
  if (!gruppen.size || !strahl(e, refs)) return null;
  const treffer = refs.raycaster.intersectObjects([...gruppen.values()], true)[0];
  let o: THREE.Object3D | null = treffer?.object ?? null;
  while (o) { if (o.userData?.moebelId) return o.userData.moebelId; o = o.parent; }
  return null;
}

function bodenPunkt(e: Punkt, refs: Refs): { x: number; z: number } | null {
  if (!strahl(e, refs)) return null;
  const hit = refs.raycaster.intersectObject(refs.floor, false)[0];
  return hit ? { x: Math.round(hit.point.x * 20) / 20, z: Math.round(hit.point.z * 20) / 20 } : null;
}

/** Möbel unter dem Punkt (nur für die Leitung), sonst null. */
export function moebelAn(clientX: number, clientY: number): string | null {
  if (!darfVerschieben()) return null;
  return waehleMoebel({ clientX, clientY }, refsGlobal!);
}

export function starteMoebelZug(id: string, clientX: number, clientY: number): boolean {
  if (!darfVerschieben()) return false;
  const m = liste.find(x => x.id === id);
  const p = bodenPunkt({ clientX, clientY }, refsGlobal!);
  if (!m || !p) return false;
  zug = { id, dx: m.x - p.x, dz: m.z - p.z, sx: clientX, sy: clientY, bewegt: false, alt: { ...m }, figStart: figurenPos() };
  return true;
}

export function bewegeMoebelZug(clientX: number, clientY: number): void {
  if (!zug || !refsGlobal) return;
  if (!zug.bewegt && Math.hypot(clientX - zug.sx, clientY - zug.sy) < 8) return; // Antippen, kein Ziehen
  zug.bewegt = true;
  const p = bodenPunkt({ clientX, clientY }, refsGlobal);
  const g = gruppen.get(zug.id);
  if (!p || !g) return;
  g.position.x = p.x + zug.dx;
  g.position.z = p.z + zug.dz;
  // Wer sitzt, fährt sichtbar mit.
  for (const f of mitnehmen(zug.alt, { ...zug.alt, x: g.position.x, z: g.position.z }, zug.figStart)) setzeFigurLokal(f.id, f.x, f.z, f.facingY);
}

export function beendeMoebelZug(): void {
  if (!zug) return;
  const z = zug;
  zug = null;
  if (!z.bewegt) { setzeAuswahl(auswahl === z.id ? null : z.id); return; }
  const g = gruppen.get(z.id);
  if (!g) return;
  aendere(z.id, { x: Math.round(g.position.x * 100) / 100, z: Math.round(g.position.z * 100) / 100 }, z.figStart);
}

// ── Hinsetzen durch Ziehen (08.11.2026) ──────────────────────────────────────
let sassBeimStart = false;

/** Beim Greifen einer Figur: Saß sie auf einem Platz? */
export function figurZugStart(fig: any): void {
  sassBeimStart = sitztAufPlatz(liste, { id: fig.id, x: fig.root.position.x, z: fig.root.position.z, preset: fig.preset });
}

/** Beim Loslassen: nahe am freien Platz → setzen; vom Platz weggezogen → aufstehen. */
export function figurLosgelassen(fig: any): void {
  const p = naechsterSitzplatz(liste, { id: fig.id, x: fig.root.position.x, z: fig.root.position.z }, figurenPos());
  if (p) {
    setzeFigurLokal(fig.id, p.x, p.z, p.facingY);
    sendMove(fig.id, p.x, p.z, p.facingY);
    if (fig.preset !== 'sit') applyPreset(fig.id, 'sit');
    return;
  }
  if (sassBeimStart && fig.preset === 'sit') applyPreset(fig.id, 'stand');
}

export function initMoebelVerschieben(refs: Refs): void {
  refsGlobal = refs;
  zeichne(); // falls Möbel vor der Szene ankamen
  if (!(window as any).__brettCurrentUserIsAdmin) return;
  const el = refs.renderer.domElement;

  // Tipp/Klick neben das Möbel hebt die Auswahl auf.
  el.addEventListener('pointerdown', (e) => {
    if (auswahl && moebelAn(e.clientX, e.clientY) === null) setzeAuswahl(null);
  }, { capture: true });

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.shiftKey) return;
    if (refs.mannequin.pickContact?.(e)) return; // Figur hat Vorrang
    if (refs.mannequin.pickMannequinBody?.(e)) return;
    const id = moebelAn(e.clientX, e.clientY);
    if (!id || !starteMoebelZug(id, e.clientX, e.clientY)) return;
    el.style.cursor = 'grabbing';
    e.preventDefault();
    e.stopImmediatePropagation();
  }, { capture: true });

  window.addEventListener('mousemove', (e) => bewegeMoebelZug(e.clientX, e.clientY));
  window.addEventListener('mouseup', () => {
    if (!zug) return;
    el.style.cursor = '';
    beendeMoebelZug();
  });
}
