// Brett — floating "edit appearance" badge that hovers over the selected figure.
// The pure helper functions (ndcToScreen, badgeVisible) have NO Three.js or DOM
// dependencies so they are importable under node:test.

export interface ScreenPoint { x: number; y: number; }

/** Map normalized device coords (x,y in [-1,1]) to pixel coords (y flipped). */
export function ndcToScreen(ndcX: number, ndcY: number, width: number, height: number): ScreenPoint {
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (1 - (ndcY * 0.5 + 0.5)) * height,
  };
}

/** Badge shows only for a selection in front of the camera and within the viewport frustum. */
export function badgeVisible(selectedId: string | null, ndcZ: number, ndcX = 0, ndcY = 0): boolean {
  if (!selectedId) return false;
  if (ndcZ >= 1) return false; // at/behind far plane
  return Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1;
}

import * as _stateModule from '../state';
import { t } from '../i18n';

// ── DOM-dependent section (lazy access — not evaluated at import time) ────────

let badgeEl: HTMLDivElement | null = null;

function ensureBadge(): HTMLDivElement {
  if (badgeEl) return badgeEl;
  // Bedienkonzept 16.10.2026: Schwebemenü unter den Füßen der ausgewählten
  // Figur (vorher 🙂✏️ über dem Kopf, verdeckte das Namensschild):
  // ⟲ drehen · ✎ bearbeiten · ⟳ drehen.
  const el = document.createElement('div');
  el.id = 'appearance-badge';
  el.setAttribute('role', 'toolbar');
  Object.assign(el.style, {
    position: 'fixed',
    transform: 'translate(-50%, 40%)',
    padding: '2px 4px',
    borderRadius: '999px',
    background: 'rgba(20,22,18,0.88)',
    color: '#e7ead0',
    fontSize: '15px',
    zIndex: '40',
    pointerEvents: 'auto',
    userSelect: 'none',
    display: 'none',
    gap: '2px',
  } as CSSStyleDeclaration);
  const knopf = (zeichen: string, key: string, aktion: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = zeichen;
    b.title = t(key);
    b.setAttribute('aria-label', t(key));
    Object.assign(b.style, {
      background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer',
      fontSize: 'inherit', padding: '3px 8px', borderRadius: '999px',
    } as CSSStyleDeclaration);
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); aktion(); });
    el.appendChild(b);
  };
  // Lazy imports: vermeidet Zyklen und frühes Laden von THREE.
  knopf('⟲', 'tool.rotateLeft', () => { import('./fig-panel').then(m => m.rotateSelected(45)); });
  knopf('✎', 'tool.edit', () => { import('./fig-panel').then(m => m.openFigPanel()); });
  knopf('⟳', 'tool.rotateRight', () => { import('./fig-panel').then(m => m.rotateSelected(-45)); });
  document.body.appendChild(el);
  badgeEl = el;
  return el;
}

export function hideBadge(): void {
  if (badgeEl) badgeEl.style.display = 'none';
}

/**
 * Reposition (or hide) the badge each frame. Call from the render loop.
 * `getAnchor` resolves the selected figure's world anchor (e.g. head position).
 *
 * THREE types are dynamically required at call time to avoid top-level THREE
 * imports (preserves the no-eager-three contract).
 */
export function updateBadge(
  camera: import('three').Camera,
  renderer: { domElement: HTMLCanvasElement },
  getAnchor: (figId: string) => import('three').Vector3 | null,
): void {
  const { STATE } = _stateModule;
  const el = ensureBadge();
  const id = STATE.selectedId;
  const drawerOpen = document.getElementById('appearance-drawer')?.classList.contains('open');
  if (!id || drawerOpen) { el.style.display = 'none'; return; }
  const anchor = getAnchor(id);
  if (!anchor) { el.style.display = 'none'; return; }
  const v = anchor.clone().project(camera);
  if (!badgeVisible(id, v.z, v.x, v.y)) { el.style.display = 'none'; return; }
  const rect = renderer.domElement.getBoundingClientRect();
  const p = ndcToScreen(v.x, v.y, rect.width, rect.height);
  el.style.left = `${rect.left + p.x}px`;
  el.style.top = `${rect.top + p.y}px`;
  el.style.display = 'flex';
}
