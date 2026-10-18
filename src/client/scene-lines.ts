// brett/src/client/scene-lines.ts — 3D-Linienrendering (T000467)
// Feature-Flag: window.__brettFeatures['sf-t000467']
import * as THREE from 'three';
import { STATE, getScene } from './state';
import type { BrettLine, LineType } from '../types/state';
import { artText } from './katalog-texte';

export const LINE_COLORS: Record<LineType, number> = {
  relationship: 0x4ea1ff,  // Blau — neutraler Bezug
  tension:      0xe05555,  // Rot — Konflikt/Spannung
  resource:     0x55bb77,  // Grün — Unterstützung/Ressource
};

// Aktive THREE.Line Objekte, geindext nach lineId
const lineObjects = new Map<string, THREE.Line>();
// Beziehungsebene (Gerald 16.10.2026): Namensschild je Linie + Ein/Aus-Schalter.
const labelObjects = new Map<string, THREE.Sprite>();
let beziehungenSichtbar = true;

/** Alle Beziehungen (Linien + Schilder) ein- oder ausblenden (Steuerpult „Ansicht“). */
export function setBeziehungenSichtbar(an: boolean): void {
  beziehungenSichtbar = an;
  for (const m of lineObjects.values()) m.visible = an;
  for (const l of labelObjects.values()) l.visible = an;
}

function labelText(line: BrettLine): string {
  return (line.label && line.label.trim()) || artText(line.art);
}

function makeLineLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(10,14,24,0.8)';
  ctx.beginPath();
  if ((ctx as any).roundRect) (ctx as any).roundRect(4, 4, 248, 40, 10); else ctx.rect(4, 4, 248, 40);
  ctx.fill();
  ctx.font = 'italic 600 20px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#f3f0e6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.length > 20 ? text.slice(0, 19) + '…' : text, 128, 25);
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.0, 0.19, 1);
  sprite.renderOrder = 18;
  return sprite;
}

function labelPosition(line: BrettLine): THREE.Vector3 | null {
  const from = getFigPos(line.fromId);
  const to = getFigPos(line.toId);
  if (!from || !to) return null;
  return from.lerp(to, 0.5).add(new THREE.Vector3(0, 0.55, 0));
}

/** Test-Seam: gibt die interne lineObjects-Map zurück (für Identitäts-Tests). */
export function getLineObjects(): Map<string, THREE.Line> {
  return lineObjects;
}

// Letzte bekannte Positionen der Figuren (dirty-check für Frame-Loop Update)
const lastPositions = new Map<string, { x: number; z: number }>();

function isFeatureActive(): boolean {
  const feats: Record<string, boolean> =
    (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
  return feats['sf-t000467'] === true;
}

function getFigPos(figId: string): THREE.Vector3 | null {
  const fig = STATE.figures.find((f: any) => f.id === figId);
  if (!fig) return null;
  return new THREE.Vector3(fig.root.position.x, 0.5, fig.root.position.z);
}

function buildGeometry(line: BrettLine): THREE.BufferGeometry | null {
  const from = getFigPos(line.fromId);
  const to = getFigPos(line.toId);
  if (!from || !to) return null;
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.25, 0));
  const curve = new THREE.CatmullRomCurve3([from, mid, to]);
  const points = curve.getPoints(40);
  return new THREE.BufferGeometry().setFromPoints(points);
}

/**
 * Aktualisiert die Positionen eines bestehenden THREE.Line-Objekts in-place.
 * Setzt positions-Attribute via setXYZ + needsUpdate = true.
 * KEINE neue Geometrie, KEIN dispose — Objekt-Identität bleibt erhalten.
 * Vorbedingung: Die Geometrie muss mit getPoints(40) (= 41 Punkte) erstellt worden sein.
 */
function updateGeometryInPlace(mesh: THREE.Line, line: BrettLine): boolean {
  const from = getFigPos(line.fromId);
  const to = getFigPos(line.toId);
  if (!from || !to) return false;
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.25, 0));
  const curve = new THREE.CatmullRomCurve3([from, mid, to]);
  const points = curve.getPoints(40); // immer 41 Punkte
  const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < points.length; i++) {
    posAttr.setXYZ(i, points[i].x, points[i].y, points[i].z);
  }
  posAttr.needsUpdate = true;
  if (line.lineType === 'tension') {
    mesh.computeLineDistances();
  }
  return true;
}

/** Rendert eine neue Linie in die Szene. No-op außerhalb des Feature-Flags. */
export function renderLine(line: BrettLine): void {
  if (!isFeatureActive()) return;
  // Stammbaum-Linien (Genogramm: Paar/Eltern-Kind) gehören nicht aufs Brett.
  if (line.struktur) return;
  removeLineFromScene(line.id); // idempotent — ggf. alte Version entfernen
  const geometry = buildGeometry(line);
  if (!geometry) return;
  let mesh: THREE.Line;
  if (line.lineType === 'tension') {
    const mat = new THREE.LineDashedMaterial({ color: LINE_COLORS[line.lineType], dashSize: 0.15, gapSize: 0.1 });
    mesh = new THREE.Line(geometry, mat);
    mesh.computeLineDistances();
  } else {
    const mat = new THREE.LineBasicMaterial({ color: LINE_COLORS[line.lineType] });
    mesh = new THREE.Line(geometry, mat);
  }
  mesh.visible = beziehungenSichtbar;
  getScene().scene.add(mesh);
  lineObjects.set(line.id, mesh);
  const text = labelText(line);
  const pos = text ? labelPosition(line) : null;
  if (text && pos) {
    const sprite = makeLineLabel(text);
    sprite.position.copy(pos);
    sprite.visible = beziehungenSichtbar;
    getScene().scene.add(sprite);
    labelObjects.set(line.id, sprite);
  }
}

/** Entfernt eine Linie aus der Szene und gibt Ressourcen frei. */
export function removeLineFromScene(lineId: string): void {
  const label = labelObjects.get(lineId);
  if (label) {
    getScene().scene.remove(label);
    label.material.map?.dispose();
    label.material.dispose();
    labelObjects.delete(lineId);
  }
  const mesh = lineObjects.get(lineId);
  if (!mesh) return;
  getScene().scene.remove(mesh);
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach(m => m.dispose());
  } else {
    (mesh.material as THREE.Material).dispose();
  }
  lineObjects.delete(lineId);
}

/** Alle Linien aus der Szene entfernen (beim snapshot-Reset). */
export function clearAllLines(): void {
  for (const id of [...lineObjects.keys()]) {
    removeLineFromScene(id);
  }
  lineObjects.clear();
  lastPositions.clear();
}

/** Re-rendert eine Linie mit neuer Geometrie (nach figure move oder type change). */
export function rerenderLine(lineId: string): void {
  if (!isFeatureActive()) return;
  const line = STATE.lines.find(l => l.id === lineId);
  if (!line) { removeLineFromScene(lineId); return; }
  renderLine(line);
}

/**
 * Frame-Loop Update: Aktualisiert Linienpositionen wenn sich Figuren bewegt haben.
 * Sollte einmal pro Frame nach dem mannequin-Update aufgerufen werden.
 * Dirty-Check: vergleicht aktuelle Position mit lastPositions um unnötige Rebuilds zu vermeiden.
 */
export function updateLinePositions(): void {
  if (!isFeatureActive()) return;
  if (lineObjects.size === 0) return;

  // Prüfe ob relevante Figuren bewegt wurden
  const affectedFigIds = new Set<string>();
  for (const line of STATE.lines) {
    const fromFig = STATE.figures.find((f: any) => f.id === line.fromId);
    const toFig = STATE.figures.find((f: any) => f.id === line.toId);
    if (!fromFig || !toFig) continue;
    const fromPos = lastPositions.get(line.fromId);
    const toPos = lastPositions.get(line.toId);
    const fromMoved = !fromPos || fromPos.x !== fromFig.root.position.x || fromPos.z !== fromFig.root.position.z;
    const toMoved = !toPos || toPos.x !== toFig.root.position.x || toPos.z !== toFig.root.position.z;
    if (fromMoved || toMoved) {
      affectedFigIds.add(line.fromId);
      affectedFigIds.add(line.toId);
    }
  }

  if (affectedFigIds.size === 0) return;

  // Update lastPositions
  for (const figId of affectedFigIds) {
    const fig = STATE.figures.find((f: any) => f.id === figId);
    if (fig) lastPositions.set(figId, { x: fig.root.position.x, z: fig.root.position.z });
  }

  // In-Place-Update der betroffenen Linien (kein dispose/rebuild).
  // renderLine wird nur aufgerufen wenn die Linie noch nicht in lineObjects existiert
  // (sollte nicht vorkommen, aber als Fallback für Konsistenz).
  for (const line of STATE.lines) {
    if (affectedFigIds.has(line.fromId) || affectedFigIds.has(line.toId)) {
      const existing = lineObjects.get(line.id);
      if (existing) {
        updateGeometryInPlace(existing, line);
        const label = labelObjects.get(line.id);
        const pos = label ? labelPosition(line) : null;
        if (label && pos) label.position.copy(pos);
      } else {
        renderLine(line);
      }
    }
  }
}

/** Snapshot-Reset: Linien aus Join-Snapshot initialisieren. */
export function initLinesFromSnapshot(lines: BrettLine[]): void {
  clearAllLines();
  STATE.lines.length = 0;
  for (const line of lines) {
    STATE.lines.push(line);
    renderLine(line);
  }
}

/** Verarbeitet eingehende line_*-Nachrichten vom Server (T000467). */
export function applyLineMessage(msg: { type: string; line?: BrettLine; lineId?: string; lineType?: LineType }): void {
  if (msg.type === 'line_created' && msg.line) {
    STATE.lines.push(msg.line);
    renderLine(msg.line);
  } else if (msg.type === 'line_deleted' && msg.lineId) {
    const idx = STATE.lines.findIndex(l => l.id === msg.lineId);
    if (idx !== -1) STATE.lines.splice(idx, 1);
    removeLineFromScene(msg.lineId);
  } else if (msg.type === 'line_type_changed' && msg.lineId && msg.lineType) {
    const l = STATE.lines.find(l => l.id === msg.lineId);
    if (l) { l.lineType = msg.lineType; rerenderLine(msg.lineId); }
  }
}
