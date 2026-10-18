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
  | { type: 'helligkeit'; wert: number }
  // ☰ Menü im Steuerpult (Gerald 18.10.2026): Aufträge, die das Spielfeld ausführt
  // (Bild/PDF/Datei entstehen aus dem Spielfeld), Datei-Import, Sprachwechsel.
  | { type: 'menue'; aktion: MenueAktion }
  | { type: 'import'; text: string }
  | { type: 'sprache' };

export type MenueAktion = 'png' | 'pdf' | 'json' | 'blickwinkel' | 'magnet';
const MENUE_KNOPF: Record<MenueAktion, string> = {
  png: 'btn-export-png', pdf: 'btn-export-pdf', json: 'btn-export-json',
  blickwinkel: 'btn-view-cone', magnet: 'btn-magnet',
};

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
    if (m.type === 'menue') {
      // Die Knöpfe liegen ausgeblendet im ☰ Menü des Spielfelds – Klick löst sie aus.
      (document.getElementById(MENUE_KNOPF[m.aktion]) as HTMLButtonElement | null)?.click();
      return;
    }
    if (m.type === 'import') {
      import('./ui/import').then(async (imp) => {
        try { await imp.applyImportedSnapshot(imp.validateSnapshot(JSON.parse(m.text))); }
        catch (err) { console.warn('[brett] Import aus dem Steuerpult fehlgeschlagen', err); }
      });
      return;
    }
    if (m.type === 'sprache') { location.reload(); return; }
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

/** Tablet oder schmaler Bildschirm: Steuerpult als Seitenleiste statt eigenem Fenster. */
export function pultAlsLeiste(): boolean {
  const grob = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return grob || window.innerWidth < 1100;
}

/**
 * Steuerpult als Seitenleiste im Spielfeld (Gerald 18.10.2026: auf dem Tablet
 * nicht zwischen Spielfeld und Pult hin- und herschalten müssen). Das Pult läuft
 * in einem eingebetteten Rahmen (`eingebettet=1`: kein Herzschlag, also keine
 * Präsentationsansicht). Zweiter Klick schließt die Leiste.
 */
export function schalteSeitenleiste(): void {
  if (!room) return;
  const alt = document.getElementById('pult-leiste');
  if (alt) { alt.remove(); window.dispatchEvent(new Event('resize')); return; }
  const leiste = document.createElement('div');
  leiste.id = 'pult-leiste';
  Object.assign(leiste.style, {
    position: 'fixed', top: '0', right: '0', bottom: '0', width: 'min(420px, 92vw)', zIndex: '400',
    display: 'flex', flexDirection: 'column', background: 'var(--brett-bg, #0e1116)',
    borderLeft: '1px solid rgba(231,234,208,0.15)', boxShadow: '-8px 0 24px rgba(0,0,0,0.35)',
  } as CSSStyleDeclaration);
  const kopf = document.createElement('div');
  Object.assign(kopf.style, { display: 'flex', gap: '6px', justifyContent: 'flex-end', padding: '6px' } as CSSStyleDeclaration);
  const knopf = (text: string, titel: string, aktion: () => void) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = text; b.title = titel;
    Object.assign(b.style, { minWidth: '44px', minHeight: '40px', fontSize: '16px', cursor: 'pointer' } as CSSStyleDeclaration);
    b.addEventListener('click', aktion);
    kopf.append(b);
  };
  knopf('↗', 'Als eigenes Fenster', () => { leiste.remove(); window.dispatchEvent(new Event('resize')); void oeffneFenster(); });
  knopf('✕', 'Schließen', () => { leiste.remove(); window.dispatchEvent(new Event('resize')); });
  const rahmen = document.createElement('iframe');
  rahmen.src = `/steuerpult.html?room=${encodeURIComponent(room)}&eingebettet=1`;
  Object.assign(rahmen.style, { flex: '1', border: '0', width: '100%' } as CSSStyleDeclaration);
  leiste.append(kopf, rahmen);
  // Tipps/Klicks in der Leiste nicht ans Brett durchreichen.
  for (const ev of ['mousedown', 'pointerdown', 'touchstart']) leiste.addEventListener(ev, e => e.stopPropagation());
  document.body.append(leiste);
}

/**
 * Steuerpult öffnen. Bevorzugt als „Bild-im-Bild“-Fenster (Document
 * Picture-in-Picture, Chromium/Vivaldi): bleibt immer im Vordergrund, auch
 * wenn man ins Spielfeld klickt (Gerald: Menü verschwand dahinter). Beim
 * Teilen des Spielfeld-Fensters ist es nicht zu sehen. Sonst normales Popup.
 */
export async function oeffneSteuerpult(): Promise<void> {
  if (!room) return;
  if (pultAlsLeiste()) { schalteSeitenleiste(); return; }
  await oeffneFenster();
}

async function oeffneFenster(): Promise<void> {
  if (!room) return;
  const url = `/steuerpult.html?room=${encodeURIComponent(room)}`;
  const dpip = (window as any).documentPictureInPicture;
  if (dpip?.requestWindow) {
    if (pipFenster && !pipFenster.closed) { pipFenster.focus(); return; }
    try {
      const w: Window = await dpip.requestWindow({ width: 440, height: Math.min(900, screen.availHeight - 80) });
      pipFenster = w;
      w.document.title = 'Steuerpult';
      // B16 (Gerald 18.10.2026): Im Bild-im-Bild-Fenster lässt sich der Scrollbalken
      // des Browsers nicht ziehen → das Pult zeichnet einen eigenen (pip=1).
      w.document.body.style.cssText = 'margin:0;background:#0e1116;overflow:hidden;';
      const f = w.document.createElement('iframe');
      f.src = url + '&pip=1';
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
