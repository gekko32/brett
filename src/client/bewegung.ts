// brett/src/client/bewegung.ts
// Einfache Animationen (Gerald 18.10.2026, Figuren Stufe 4): sanftes Hinwenden
// statt Springen, Gehbewegung beim Verschieben, weiches Gleiten bei Bewegungen
// anderer Teilnehmer. Ohne Animationsdateien: Die Bewegung entsteht über die 14
// Gelenke und wirkt deshalb für alle Figurenarten (klassisch, verfeinert, Mannequin).

import { STATE } from './state';

const DREH_TEMPO = 6;      // rad/s für das Hinwenden
const GLEIT_FAKTOR = 12;   // je höher, desto schneller folgt die Figur dem Ziel
const SPRUNG_AB = 6;       // weiter entfernt → sofort umsetzen (z. B. Vorlage geladen)
const GEH_AB = 0.25;       // Mindesttempo (Einheiten/s) für die Gehbewegung

/** Drehung mit Hinwenden (die Figur dreht sich in den nächsten Bildern dorthin). */
export function drehenSanft(fig: any, facingY: number): void {
  fig.facingY = facingY;
  fig._zielDrehung = facingY;
}

/** Position eines anderen Teilnehmers übernehmen (gleitet statt springt). */
export function zielSetzen(fig: any, x: number, z: number, facingY?: number): void {
  const dx = x - fig.root.position.x, dz = z - fig.root.position.z;
  if (Math.hypot(dx, dz) > SPRUNG_AB) { fig.root.position.x = x; fig.root.position.z = z; fig._zielOrt = null; }
  else fig._zielOrt = { x, z };
  if (typeof facingY === 'number') drehenSanft(fig, facingY);
}

/** Kürzester Winkelabstand (−π … π). */
export function winkelAbstand(von: number, nach: number): number {
  let d = (nach - von) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const BEIN_GELENKE = ['lHip', 'rHip', 'lKnee', 'rKnee'];

/** Im Bildtakt nach tickSpring (überschreibt die Gelenkdrehung jedes Bild neu). */
export function tickBewegung(dt: number): void {
  if (dt <= 0) return;
  for (const fig of STATE.figures as any[]) {
    if (!fig?.root || !fig.bones) continue;
    const r = fig.root;

    // Hinwenden
    if (typeof fig._zielDrehung === 'number') {
      const d = winkelAbstand(r.rotation.y, fig._zielDrehung);
      const schritt = DREH_TEMPO * dt;
      if (Math.abs(d) <= schritt) { r.rotation.y = fig._zielDrehung; fig._zielDrehung = undefined; }
      else r.rotation.y += Math.sign(d) * schritt;
    }

    // Gleiten zum Ziel (Bewegungen anderer Teilnehmer)
    if (fig._zielOrt) {
      const k = Math.min(1, dt * GLEIT_FAKTOR);
      r.position.x += (fig._zielOrt.x - r.position.x) * k;
      r.position.z += (fig._zielOrt.z - r.position.z) * k;
      if (Math.hypot(fig._zielOrt.x - r.position.x, fig._zielOrt.z - r.position.z) < 0.005) {
        r.position.x = fig._zielOrt.x; r.position.z = fig._zielOrt.z; fig._zielOrt = null;
      }
    }

    // Gehbewegung aus dem tatsächlichen Tempo (eigenes Ziehen wie fremde Bewegung)
    const vorher = fig._letzterOrt ?? { x: r.position.x, z: r.position.z };
    const tempo = Math.hypot(r.position.x - vorher.x, r.position.z - vorher.z) / dt;
    fig._letzterOrt = { x: r.position.x, z: r.position.z };
    const darfGehen = (!fig.preset || fig.preset === 'stand')
      && !BEIN_GELENKE.some(g => fig.boneOverrides?.[g]) && !fig.jumping;
    const zielAmp = darfGehen && tempo > GEH_AB ? Math.min(1, tempo / 1.6) : 0;
    fig._gehAmp = (fig._gehAmp ?? 0) + (zielAmp - (fig._gehAmp ?? 0)) * Math.min(1, dt * 8);
    if (fig._gehAmp > 0.01) {
      fig._gehPhase = ((fig._gehPhase ?? 0) + dt * (5 + 6 * fig._gehAmp)) % (Math.PI * 2);
      const s = Math.sin(fig._gehPhase), a = fig._gehAmp;
      const b = fig.bones;
      b.lHip.rotation.x += s * 0.5 * a;
      b.rHip.rotation.x -= s * 0.5 * a;
      b.lKnee.rotation.x += Math.max(0, -s) * 0.7 * a;
      b.rKnee.rotation.x += Math.max(0, s) * 0.7 * a;
      if (!fig.boneOverrides?.lShoulder) b.lShoulder.rotation.x -= s * 0.35 * a;
      if (!fig.boneOverrides?.rShoulder) b.rShoulder.rotation.x += s * 0.35 * a;
    } else {
      fig._gehAmp = 0;
    }
  }
}
