// brett/src/client/mannequin-visuals.ts
// Possession- und Moderation-Visuals für Figuren.
import * as THREE from 'three';
import { jahreText } from './person-catalog';

export { updateModerationVisuals, clearModerationVisuals, type ModerationVisualState } from './mannequin-moderation';

// E9: zusätzliche Abdunklung für hidden-Figuren (nur beim Leiter sichtbar).
const HIDDEN_DIM = 0.35;

/** Update all figure possession rings + floating labels based on _serverPossessor. */
export function updatePossessionVisuals(figures: any[], currentUserId: string): void {
  const now = performance.now();
  for (const fig of figures) {
    updateNameLabel(fig);
    const possessor: string | null = fig._serverPossessor ?? null;
    const isMine = possessor === currentUserId;
    const isOthers = possessor && possessor !== currentUserId;

    if (!possessor) {
      // Free figure — dashed brass ring (pulsing)
      fig.possessionRing.visible = true;
      fig.possessionRing.material.opacity = 0.3 + Math.sin(now * 0.003) * 0.12;
      fig.possessionRing.material.color.set(0xc8a96e); // brass
      fig.labelSprite.visible = false;
    } else if (isMine) {
      // Own possession — solid brass ring + label
      fig.possessionRing.visible = true;
      fig.possessionRing.material.opacity = 0.75;
      fig.possessionRing.material.color.set(0xc8a96e); // brass
      updatePossessorLabel(fig, 'ICH', '#c8a96e');
    } else if (isOthers) {
      // Foreign possession — sage ring + name label
      fig.possessionRing.visible = true;
      fig.possessionRing.material.opacity = 0.5;
      fig.possessionRing.material.color.set(0x7fa37a); // sage
      const name = possessor.length > 12 ? possessor.slice(0, 12) + '…' : possessor;
      updatePossessorLabel(fig, name, '#7fa37a');
    }
  }
}

// Höhen über dem Boden (relativ zur Figur; Kopf endet bei ≈2,0).
// Reihenfolge von unten: Name → Verkörperung („ICH“) → Notiz-Sprechblase.
export const NAME_LABEL_Y = 2.2;

/**
 * Namensschild über dem Kopf (fig.label). Wird jede Frame aufgerufen, zeichnet
 * aber nur bei Textänderung neu. Immer über den Figuren (depthTest aus,
 * hoher renderOrder), damit kein Kopf/Körper den Namen verdeckt.
 */
function updateNameLabel(fig: any): void {
  const text = typeof fig.label === 'string' ? fig.label.trim() : '';
  if (!text || text === 'Figur') {
    if (fig._nameSprite) fig._nameSprite.visible = false;
    return;
  }
  if (!fig._nameSprite) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const mat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.2, 0.3, 1);
    sprite.position.set(0, NAME_LABEL_Y, 0);
    sprite.renderOrder = 20;
    fig.root.add(sprite);
    fig._nameSprite = sprite;
  }
  fig._nameSprite.visible = true;
  // Lebensjahre aus den Personenangaben (Genogramm-Stil) mit anzeigen.
  const jahre = jahreText(fig.person);
  const cacheKey = text + '|' + jahre;
  if (fig._lastNameText === cacheKey) return;
  fig._lastNameText = cacheKey;
  const canvas = fig._nameSprite.material.map.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = 'rgba(10,14,24,0.78)';
  ctx.beginPath();
  if ((ctx as any).roundRect) (ctx as any).roundRect(4, 8, 248, 48, 12); else ctx.rect(4, 8, 248, 48);
  ctx.fill();
  ctx.fillStyle = '#f3f0e6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const max = jahre ? 13 : 18;
  const shown = (text.length > max ? text.slice(0, max - 1) + '…' : text) + (jahre ? ' · ' + jahre : '');
  ctx.font = `600 ${jahre ? 20 : 24}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(shown, 128, 33);
  fig._nameSprite.material.map.needsUpdate = true;
}

function updatePossessorLabel(fig: any, text: string, hexColor: string): void {
  const upperText = text.toUpperCase();
  // Cache: Bei unverändertem Text kein Canvas-Redraw und kein needsUpdate.
  if (fig._lastLabelText === upperText) {
    fig.labelSprite.visible = true;
    return;
  }
  fig._lastLabelText = upperText;
  const canvas = fig.labelSprite.material.map.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 18px "Geist Mono", monospace';
  ctx.fillStyle = hexColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(upperText, 128, 32);
  fig.labelSprite.material.map.needsUpdate = true;
  fig.labelSprite.visible = true;
}

/**
 * E2 — Nutzersteuerbare Figuren-Transparenz. Effektive Opacity komponiert
 * multiplikativ: base (`fig.opacity ?? 1`, geklemmt 0.2–1.0) × `dimFactor`
 * (Selektions-/Moderation-Dim). So bleibt Moderation weiterhin dominant.
 * Setzt `transparent`/`opacity` auf allen sichtbaren Figuren-Materialien
 * (Kontakt-Spheres und Ringe ausgenommen).
 */
export function applyFigureOpacity(fig: any, dimFactor = 1): void {
  const raw = typeof fig.opacity === 'number' ? fig.opacity : 1;
  const base = Math.max(0.2, Math.min(1, raw));
  // E9: hidden-Figuren (nur der Leiter rendert sie) werden zusätzlich abgedunkelt.
  const hiddenDim = fig.hidden ? HIDDEN_DIM : 1;
  // Personenkatalog/Genogramm: im System erfasst, aber nicht in der Aufstellung →
  // auf dem Brett ganz ausgeblendet (sonst wird es mit drei Generationen voll).
  fig.root.visible = fig.person?.inAufstellung !== false;
  const nichtAufgestellt = 1;
  const eff = Math.max(0, Math.min(1, base * dimFactor * hiddenDim * nichtAufgestellt));
  fig.root.traverse((o: any) => {
    if (o.isMesh && !o.userData?.isContact && o !== fig.ring && o !== fig.possessionRing &&
        o.material && 'opacity' in o.material) {
      o.material.transparent = eff < 1 ? true : o.material.transparent;
      o.material.opacity = eff;
    }
  });
}

/**
 * E9 — Zeigt/versteckt das 🕶-Badge an einer hidden-Figur (Leiter-Ansicht) und
 * dunkelt sie via applyFigureOpacity ab. Nur der Leiter erhält hidden-Figuren
 * überhaupt — Nicht-Leiter sehen sie serverseitig gar nicht.
 */
export function updateHiddenBadge(fig: any): void {
  if (fig.hidden) {
    if (!fig._hiddenSprite) {
      fig._hiddenSprite = makeHiddenSprite();
      fig.root.add(fig._hiddenSprite);
    }
    fig._hiddenSprite.visible = true;
  } else if (fig._hiddenSprite) {
    fig._hiddenSprite.visible = false;
  }
}

function makeHiddenSprite(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '44px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🕶', 32, 34);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.5, 0.5, 1);
  sprite.position.set(0, 2.2, 0);
  return sprite;
}

export function clearPossessionVisuals(fig: any): void {
  fig.possessionRing.visible = false;
  fig.labelSprite.visible = false;
  fig._lastLabelText = undefined;  // Cache invalidieren
}
