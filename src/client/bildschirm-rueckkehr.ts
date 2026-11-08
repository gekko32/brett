// brett/src/client/bildschirm-rueckkehr.ts
// Rückkehr auf das Brett (Gerald 08.11.2026): Wechselt man am Handy in eine
// andere App, nimmt das System dem Browser die 3D-Grafik weg; zurück im Brett
// blieb der Bildschirm schwarz. Der Stand liegt auf dem Server, also lädt die
// Seite in diesem Fall einfach neu und ist in Sekunden wieder da.

const KEY = 'brett_letzter_neustart';
export const MIN_ABSTAND_MS = 15_000;
export const WS_WARTEZEIT_MS = 2_500;

/** Reine Entscheidung (test/moebel.test.ts). */
export function sollNeuLaden(z: {
  sichtbar: boolean;
  grafikVerloren: boolean;
  /** Verbindung zum Server nach der Rückkehr noch nicht wieder da. */
  verbindungWeg: boolean;
  /** So lange war die Seite im Hintergrund. */
  wegMs: number;
  /** Seit dem letzten automatischen Neuladen (Schutz vor Endlosschleife). */
  seitNeustartMs: number;
}): boolean {
  if (!z.sichtbar || z.seitNeustartMs < MIN_ABSTAND_MS) return false;
  if (z.grafikVerloren) return true;
  return z.verbindungWeg && z.wegMs > 20_000;
}

function seitNeustart(): number {
  try { return Date.now() - Number(sessionStorage.getItem(KEY) || 0); } catch { return Infinity; }
}

function neuLaden(): void {
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* privat: egal */ }
  location.reload();
}

export function initBildschirmRueckkehr(canvas: HTMLCanvasElement, gl: { isContextLost(): boolean }, wsBereit: () => boolean): void {
  let verloren = false;
  let wegSeit = document.hidden ? Date.now() : 0;

  const pruefe = () => {
    if (sollNeuLaden({
      sichtbar: !document.hidden,
      grafikVerloren: verloren || gl.isContextLost(),
      verbindungWeg: !wsBereit(),
      wegMs: wegSeit ? Date.now() - wegSeit : 0,
      seitNeustartMs: seitNeustart(),
    })) neuLaden();
  };

  canvas.addEventListener('webglcontextlost', () => {
    verloren = true;
    if (!document.hidden) pruefe();
  });

  const rueckkehr = () => {
    if (document.hidden) { wegSeit = Date.now(); return; }
    pruefe();
    // Manche Browser melden den Verlust erst kurz nach der Rückkehr.
    setTimeout(() => { pruefe(); wegSeit = 0; }, WS_WARTEZEIT_MS);
  };
  document.addEventListener('visibilitychange', rueckkehr);
  window.addEventListener('pageshow', rueckkehr);
}
