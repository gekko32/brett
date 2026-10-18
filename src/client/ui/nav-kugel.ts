// brett/src/client/ui/nav-kugel.ts
// Navigationskugel + Schieberegler fürs Steuerpult (Gerald 16.10.2026:
// „Kugel kombiniert mit Scrollbalken“ wie in 3D-Programmen). Ziehen auf der
// Kugel dreht/kippt die Ansicht des Bretts; die Kugel dreht sich mit, sodass
// man sieht, aus welcher Richtung man schaut. Regler: Drehung, Neigung,
// Abstand, Helligkeit. Ohne THREE – reines Canvas, weil das Pult kein 3D lädt.

export interface KameraStand { theta: number; phi: number; dist: number }

export interface NavKugelOptionen {
  /** Neue absolute Kamerawerte ans Brett schicken. */
  setze: (w: Partial<KameraStand>) => void;
  /** Helligkeit (0,4–2,5) ans Brett schicken. */
  helligkeit: (wert: number) => void;
  texte: { drehung: string; neigung: string; abstand: string; helligkeit: string; hinweis: string };
  startHelligkeit: number;
}

const PHI_MIN = 0.05;   // knapp über dem Boden
const PHI_MAX = 1.2;    // fast senkrecht von oben (Grenze aus scene.ts)
const DIST_MIN = 2;
const DIST_MAX = 40;

export function baueNavKugel(o: NavKugelOptionen): { el: HTMLElement; aktualisiere: (s: KameraStand) => void } {
  let stand: KameraStand = { theta: 0.6, phi: 0.6, dist: 8 };
  let ziehen: { x: number; y: number; theta: number; phi: number } | null = null;

  const el = document.createElement('div');
  el.className = 'navkugel';
  const groesse = 150;
  const canvas = document.createElement('canvas');
  canvas.width = groesse * 2; canvas.height = groesse * 2;   // scharf auf HiDPI
  canvas.style.width = canvas.style.height = `${groesse}px`;
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';
  canvas.title = o.texte.hinweis;

  const regler = (label: string, min: number, max: number, step: number, wert: number, onInput: (v: number) => void) => {
    const l = document.createElement('label');
    l.className = 'navregler';
    const span = document.createElement('span');
    span.textContent = label;
    const r = document.createElement('input');
    r.type = 'range'; r.min = String(min); r.max = String(max); r.step = String(step); r.value = String(wert);
    r.addEventListener('input', () => onInput(parseFloat(r.value)));
    l.append(span, r);
    return { l, r };
  };
  // Drehung in Grad (0–360), Neigung in Grad (3–69), Abstand logarithmisch (0–100).
  const grad = (rad: number) => ((rad * 180 / Math.PI) % 360 + 360) % 360;
  const distZuRegler = (d: number) => 100 * Math.log(d / DIST_MIN) / Math.log(DIST_MAX / DIST_MIN);
  const reglerZuDist = (v: number) => DIST_MIN * Math.pow(DIST_MAX / DIST_MIN, v / 100);
  const rDreh = regler(o.texte.drehung, 0, 360, 1, grad(stand.theta), v => { stand.theta = v * Math.PI / 180; o.setze({ theta: stand.theta }); zeichne(); });
  const rNeig = regler(o.texte.neigung, PHI_MIN * 180 / Math.PI, PHI_MAX * 180 / Math.PI, 1, stand.phi * 180 / Math.PI,
    v => { stand.phi = v * Math.PI / 180; o.setze({ phi: stand.phi }); zeichne(); });
  // Abstand: rechts = näher (wie ein Zoom-Regler)
  const rAbst = regler(o.texte.abstand, 0, 100, 1, 100 - distZuRegler(stand.dist), v => { stand.dist = reglerZuDist(100 - v); o.setze({ dist: stand.dist }); });
  const rHell = regler(o.texte.helligkeit, 0.4, 2.5, 0.05, o.startHelligkeit, v => o.helligkeit(v));

  const zeile = document.createElement('div');
  zeile.className = 'navzeile';
  const spalte = document.createElement('div');
  spalte.className = 'navspalte';
  spalte.append(rDreh.l, rNeig.l, rAbst.l, rHell.l);
  zeile.append(canvas, spalte);
  el.append(zeile);

  function zeichne(): void {
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, R = W * 0.42, c = W / 2;
    ctx.clearRect(0, 0, W, W);
    // Kugel mit Licht von oben links
    const g = ctx.createRadialGradient(c - R * 0.35, c - R * 0.4, R * 0.1, c, c, R);
    g.addColorStop(0, '#5d7591'); g.addColorStop(1, '#1b2431');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
    // Punkt auf der Kugel → Bildschirm (Kamera dreht um Y = theta, kippt um X = phi)
    const proj = (lon: number, lat: number) => {
      let x = Math.cos(lat) * Math.sin(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon);
      const ct = Math.cos(-stand.theta), st = Math.sin(-stand.theta);
      [x, z] = [x * ct + z * st, -x * st + z * ct];
      const cp = Math.cos(stand.phi), sp = Math.sin(stand.phi);
      [y, z] = [y * cp - z * sp, y * sp + z * cp];
      return { x: c + x * R, y: c - y * R, vorn: z > 0 };
    };
    const linie = (punkte: Array<{ x: number; y: number; vorn: boolean }>, farbe: string, breite: number) => {
      ctx.strokeStyle = farbe; ctx.lineWidth = breite;
      for (let i = 1; i < punkte.length; i++) {
        if (!punkte[i].vorn || !punkte[i - 1].vorn) continue;
        ctx.beginPath(); ctx.moveTo(punkte[i - 1].x, punkte[i - 1].y); ctx.lineTo(punkte[i].x, punkte[i].y); ctx.stroke();
      }
    };
    const N = 48;
    // Längenkreise
    for (let k = 0; k < 6; k++) {
      const lon = (k / 6) * Math.PI;
      linie(Array.from({ length: N + 1 }, (_, i) => proj(lon, -Math.PI / 2 + (i / N) * Math.PI)), 'rgba(230,237,243,0.22)', 2);
      linie(Array.from({ length: N + 1 }, (_, i) => proj(lon + Math.PI, -Math.PI / 2 + (i / N) * Math.PI)), 'rgba(230,237,243,0.22)', 2);
    }
    // Breitenkreise, Äquator = Brett (Boden) hervorgehoben
    for (const lat of [-0.6, 0.6]) linie(Array.from({ length: N + 1 }, (_, i) => proj((i / N) * Math.PI * 2, lat)), 'rgba(230,237,243,0.22)', 2);
    linie(Array.from({ length: N + 1 }, (_, i) => proj((i / N) * Math.PI * 2, 0)), '#c8a96e', 5);
    // Markierung „vorn“ (Startblickrichtung)
    const m = proj(0, 0);
    if (m.vorn) { ctx.fillStyle = '#c8a96e'; ctx.beginPath(); ctx.arc(m.x, m.y, 9, 0, Math.PI * 2); ctx.fill(); }
    // Rand
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.stroke();
  }

  canvas.addEventListener('pointerdown', (e) => {
    ziehen = { x: e.clientX, y: e.clientY, theta: stand.theta, phi: stand.phi };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!ziehen) return;
    // Wie das Brett selbst „anfassen“: nach rechts ziehen dreht nach rechts.
    stand.theta = ziehen.theta - (e.clientX - ziehen.x) * 0.012;
    stand.phi = Math.max(PHI_MIN, Math.min(PHI_MAX, ziehen.phi + (e.clientY - ziehen.y) * 0.01));
    o.setze({ theta: stand.theta, phi: stand.phi });
    rDreh.r.value = String(grad(stand.theta));
    rNeig.r.value = String(stand.phi * 180 / Math.PI);
    zeichne();
  });
  const los = () => { ziehen = null; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', los);
  canvas.addEventListener('pointercancel', los);

  zeichne();

  return {
    el,
    aktualisiere(s: KameraStand) {
      if (ziehen) return; // während des Ziehens nicht zurückspringen
      stand = { ...s };
      if (document.activeElement !== rDreh.r) rDreh.r.value = String(grad(s.theta));
      if (document.activeElement !== rNeig.r) rNeig.r.value = String(s.phi * 180 / Math.PI);
      if (document.activeElement !== rAbst.r) rAbst.r.value = String(100 - distZuRegler(s.dist));
      zeichne();
    },
  };
}
