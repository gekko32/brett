// brett/src/client/steuerpult-sync.ts
// Brett-Seite der Verbindung zum Steuerpult-Fenster (Gerald 16.10.2026: Menü
// als eigenes Fenster, damit beim Bildschirmteilen nur das Spielfeld zu sehen
// ist). Abgleich der Auswahl über BroadcastChannel (gleicher Browser, gleiche
// Herkunft). Solange das Steuerpult lebt (Herzschlag), zeigt das Brett nur das
// Spielfeld (Klasse `praesentation` am body). Außerdem: Kamera und
// Beziehungs-Ebene vom Pult aus steuern.

export type KameraAktion = 'links' | 'rechts' | 'hoch' | 'runter' | 'naeher' | 'weiter' | 'zurueck' | 'draufsicht';

export type PultNachricht =
  | { type: 'select'; id: string | null; von: 'brett' | 'pult' }
  | { type: 'ping' }
  | { type: 'bye' }
  | { type: 'kamera'; aktion: KameraAktion }
  | { type: 'beziehungen'; sichtbar: boolean }
  // Navigationskugel + Schieberegler (Gerald 16.10.2026): absolute Kamerawerte.
  | { type: 'kamera-setzen'; theta?: number; phi?: number; dist?: number }
  // Brett meldet seine Ansicht, damit Kugel und Regler mitlaufen.
  | { type: 'kamera-stand'; theta: number; phi: number; dist: number }
  | { type: 'helligkeit'; wert: number };

const room = new URLSearchParams(location.search).get('room');
const kanal: BroadcastChannel | null =
  room && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`brett-${room}`) : null;

let empfangeGerade = false;
let letzterPing = 0;

function setPraesentation(an: boolean): void {
  if (document.body.classList.contains('praesentation') === an) return;
  document.body.classList.toggle('praesentation', an);
  // Brett auf volle Höhe (ohne Leiste) bzw. zurück: Größe neu berechnen.
  window.dispatchEvent(new Event('resize'));
}

function kamera(aktion: KameraAktion): void {
  const s = (window as any).__brettScene;
  if (!s) return;
  const SCHRITT = Math.PI / 12; // 15°
  switch (aktion) {
    case 'links': s.applyOrbitDelta(SCHRITT, 0); break;
    case 'rechts': s.applyOrbitDelta(-SCHRITT, 0); break;
    case 'hoch': s.applyOrbitDelta(0, 0.12); break;
    case 'runter': s.applyOrbitDelta(0, -0.12); break;
    case 'naeher': s.setOrbitDist(s.getOrbitState().dist * 0.8); break;
    case 'weiter': s.setOrbitDist(s.getOrbitState().dist * 1.25); break;
    case 'zurueck': s.resetOrbit?.(); break;
    case 'draufsicht': (document.getElementById('btn-view-2d') as HTMLButtonElement | null)?.click(); break;
  }
}

/** Vom Brett aufrufen, wenn sich die Auswahl ändert. */
export function meldeAuswahl(id: string | null): void {
  if (!kanal || empfangeGerade) return;
  kanal.postMessage({ type: 'select', id, von: 'brett' } satisfies PultNachricht);
}

export function initSteuerpultSync(): void {
  if (!kanal) return;
  kanal.onmessage = (e: MessageEvent<PultNachricht>) => {
    const m = e.data;
    if (m.type === 'ping') { letzterPing = Date.now(); setPraesentation(true); return; }
    if (m.type === 'bye') { letzterPing = 0; setPraesentation(false); return; }
    if (m.type === 'kamera') { kamera(m.aktion); return; }
    if (m.type === 'kamera-setzen') {
      const s = (window as any).__brettScene;
      if (!s) return;
      const cur = s.getOrbitState();
      if (typeof m.theta === 'number' || typeof m.phi === 'number') {
        s.applyOrbitDelta(
          typeof m.theta === 'number' ? m.theta - cur.theta : 0,
          typeof m.phi === 'number' ? m.phi - cur.phi : 0);
      }
      if (typeof m.dist === 'number') s.setOrbitDist(m.dist);
      return;
    }
    if (m.type === 'helligkeit') {
      const s = (window as any).__brettScene;
      // Belichtung des ganzen Bildes (Ausgang 1,05 in scene.ts).
      if (s?.renderer) s.renderer.toneMappingExposure = 1.05 * Math.max(0.4, Math.min(2.5, m.wert));
      return;
    }
    if (m.type === 'beziehungen') {
      import('./scene-lines').then(l => l.setBeziehungenSichtbar(m.sichtbar));
      return;
    }
    if (m.type === 'select' && m.von === 'pult') {
      empfangeGerade = true;
      try { (window as any).selectFigure?.(m.id); } finally { empfangeGerade = false; }
    }
  };
  // Pult abgestürzt/geschlossen ohne „bye“ → nach 5 s Menüs wieder zeigen.
  setInterval(() => {
    if (letzterPing && Date.now() - letzterPing > 5000) { letzterPing = 0; setPraesentation(false); }
  }, 2000);
  // Ansicht ans Pult melden (nur bei Änderung, nur wenn ein Pult lebt).
  let zuletzt = '';
  setInterval(() => {
    if (!letzterPing) return;
    const s = (window as any).__brettScene;
    if (!s) return;
    const o = s.getOrbitState();
    const key = `${o.theta.toFixed(3)}|${o.phi.toFixed(3)}|${o.dist.toFixed(2)}`;
    if (key === zuletzt) return;
    zuletzt = key;
    kanal.postMessage({ type: 'kamera-stand', theta: o.theta, phi: o.phi, dist: o.dist } satisfies PultNachricht);
  }, 150);
}

let pipFenster: Window | null = null;

/**
 * Steuerpult öffnen. Bevorzugt als „Bild-im-Bild“-Fenster (Document
 * Picture-in-Picture, Chromium/Vivaldi): bleibt immer im Vordergrund, auch
 * wenn man ins Spielfeld klickt (Gerald: Menü verschwand dahinter). Beim
 * Teilen des Spielfeld-Fensters ist es nicht zu sehen. Sonst normales Popup.
 */
export async function oeffneSteuerpult(): Promise<void> {
  if (!room) return;
  const url = `/steuerpult.html?room=${encodeURIComponent(room)}`;
  const dpip = (window as any).documentPictureInPicture;
  if (dpip?.requestWindow) {
    if (pipFenster && !pipFenster.closed) { pipFenster.focus(); return; }
    try {
      const w: Window = await dpip.requestWindow({ width: 440, height: Math.min(900, screen.availHeight - 80) });
      pipFenster = w;
      w.document.title = 'Steuerpult';
      w.document.body.style.cssText = 'margin:0;background:#0e1116;';
      const f = w.document.createElement('iframe');
      f.src = url;
      f.style.cssText = 'border:0;width:100vw;height:100vh;display:block;';
      w.document.body.appendChild(f);
      return;
    } catch { /* z. B. nicht erlaubt → Popup */ }
  }
  // Rechts an den Bildschirmrand, volle Höhe – so überlappt es das Spielfeld
  // nicht und verschwindet nicht dahinter, wenn man ins Brett klickt.
  const sc = screen as any;
  const breite = 460;
  const links = (sc.availLeft ?? 0) + screen.availWidth - breite;
  const w = window.open(url, `brett-steuerpult-${room}`,
    `popup,width=${breite},height=${screen.availHeight},left=${links},top=${sc.availTop ?? 0}`);
  w?.focus();
}
