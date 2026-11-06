// brett/src/client/vergleich.ts
// Vergleichsfenster (Baustein 4, Gerald 06.11.2026): zwei gespeicherte
// Aufstellungen desselben Klienten nebeneinander als Draufsicht, gleicher
// Maßstab. Keine Bewertung, keine Deutung (siehe vergleich-modell.ts).
// Aufruf aus dem Steuerpult: /vergleich.html?klient=<id>&a=<snapshotId>

import { t, initLang, applyTranslations } from './i18n';
import { planAusState, gemeinsamerRahmen, blick, nurInEinem, type Plan, type Rahmen } from './vergleich-modell';

const param = new URLSearchParams(location.search);
const klientId = param.get('klient');
const SVG = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...kinder: Array<Node | string>): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v; else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, String(v));
  }
  e.append(...kinder);
  return e;
}
function s(tag: string, attrs: Record<string, string | number>, ...kinder: Node[]): SVGElement {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...kinder);
  return e;
}
function svgText(x: number, y: number, inhalt: string, groesse: number, farbe = 'currentColor'): SVGElement {
  const tx = s('text', { x, y, 'font-size': groesse, 'text-anchor': 'middle', fill: farbe, 'paint-order': 'stroke',
    stroke: 'var(--bg)', 'stroke-width': groesse * 0.25 });
  tx.textContent = inhalt;
  return tx;
}

/** Plan als SVG. Koordinaten: Brett-Meter, x nach rechts, z nach unten. */
export function zeichnePlan(plan: Plan, r: Rahmen): SVGSVGElement {
  const w = r.maxX - r.minX, hgt = r.maxZ - r.minZ;
  const svg = s('svg', { viewBox: `${r.minX} ${r.minZ} ${w} ${hgt}`, class: 'plan', role: 'img' }) as SVGSVGElement;
  // Meterraster als Orientierung
  const raster = s('g', { stroke: 'var(--line)', 'stroke-width': 0.01 });
  for (let x = Math.ceil(r.minX); x <= r.maxX; x++) raster.append(s('line', { x1: x, y1: r.minZ, x2: x, y2: r.maxZ }));
  for (let z = Math.ceil(r.minZ); z <= r.maxZ; z++) raster.append(s('line', { x1: r.minX, y1: z, x2: r.maxX, y2: z }));
  svg.append(raster);

  for (const z of plan.zonen) {
    const stil = { fill: z.frame ? 'none' : z.color, 'fill-opacity': z.frame ? 0 : z.opacity, stroke: z.color, 'stroke-width': 0.04 };
    svg.append(z.shape === 'circle'
      ? s('circle', { cx: z.x, cy: z.z, r: z.radius, ...stil })
      : s('rect', { x: z.x - z.width / 2, y: z.z - z.height / 2, width: z.width, height: z.height, ...stil }));
    if (z.label) svg.append(svgText(z.x, z.z, z.label, 0.18, z.color));
  }
  for (const m of plan.moebel) {
    const g = s('g', { transform: `translate(${m.x} ${m.z}) rotate(${-m.facingY * 180 / Math.PI})` });
    const fuellung = m.art === 'wand' ? '#cfc8bb' : m.art === 'tuer' ? 'none' : 'var(--moebel)';
    g.append(m.art === 'rundtisch'
      ? s('circle', { r: m.breite / 2, fill: fuellung, stroke: 'var(--muted)', 'stroke-width': 0.02 })
      : s('rect', { x: -m.breite / 2, y: -m.tiefe / 2, width: m.breite, height: m.tiefe, rx: 0.04,
          fill: fuellung, stroke: m.art === 'tuer' ? '#c8a96e' : 'var(--muted)', 'stroke-width': m.art === 'tuer' ? 0.05 : 0.02 }));
    svg.append(g);
  }
  for (const a of plan.anker) {
    svg.append(s('circle', { cx: a.x, cy: a.z, r: 0.07, fill: a.color }));
    if (a.label) svg.append(svgText(a.x, a.z - 0.14, a.label, 0.15, a.color));
  }
  const pos = new Map(plan.figuren.map(f => [f.id, f]));
  for (const l of plan.linien) {
    const a = pos.get(l.fromId)!, b = pos.get(l.toId)!;
    svg.append(s('line', { x1: a.x, y1: a.z, x2: b.x, y2: b.z, stroke: l.color, 'stroke-width': 0.03, 'stroke-opacity': 0.8 }));
    if (l.label) svg.append(svgText((a.x + b.x) / 2, (a.z + b.z) / 2 - 0.06, l.label, 0.13, l.color));
  }
  for (const f of plan.figuren) {
    const rad = 0.2 * Math.max(0.5, f.scale);
    const { dx, dz } = blick(f.facingY);
    const g = s('g', { opacity: f.opacity });
    g.append(s('circle', { cx: f.x, cy: f.z, r: rad, fill: f.color, stroke: 'var(--fg)', 'stroke-width': 0.02 }));
    // Blickrichtung: Nase am Kreisrand
    g.append(s('line', { x1: f.x, y1: f.z, x2: f.x + dx * rad * 1.6, y2: f.z + dz * rad * 1.6, stroke: 'var(--fg)', 'stroke-width': 0.04, 'stroke-linecap': 'round' }));
    if (f.label) g.append(svgText(f.x, f.z + rad + 0.2, f.label, 0.16));
    svg.append(g);
  }
  return svg;
}

interface Eintrag { id: string; name: string; created_at: string }
let eintraege: Eintrag[] = [];
const staende = new Map<string, Plan>();

async function holePlan(id: string): Promise<Plan | null> {
  if (staende.has(id)) return staende.get(id)!;
  const r = await fetch('/api/snapshots/' + encodeURIComponent(id), { cache: 'no-store' });
  if (!r.ok) return null;
  const row = await r.json();
  const p = planAusState(row.state);
  staende.set(id, p);
  return p;
}

function auswahl(vorwahl: string | null): HTMLSelectElement {
  const sel = el('select', {}, el('option', { value: '' }, t('cmp.choose'))) as HTMLSelectElement;
  for (const e of eintraege) {
    const o = el('option', { value: e.id }, `${e.name} (${new Date(e.created_at).toLocaleDateString('de-DE')})`);
    if (e.id === vorwahl) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener('change', () => { void zeichnen(); });
  return sel;
}

let links: HTMLSelectElement, rechts: HTMLSelectElement;

async function zeichnen(): Promise<void> {
  const flaeche = document.getElementById('flaeche')!;
  const fakten = document.getElementById('fakten')!;
  const [pa, pb] = await Promise.all([
    links.value ? holePlan(links.value) : Promise.resolve(null),
    rechts.value ? holePlan(rechts.value) : Promise.resolve(null),
  ]);
  const rahmen = gemeinsamerRahmen([pa, pb].filter(Boolean) as Plan[]);
  const spalte = (sel: HTMLSelectElement, p: Plan | null) => el('section', { class: 'spalte' },
    sel, p ? zeichnePlan(p, rahmen) : el('div', { class: 'leer' }, t('cmp.empty')),
    ...(p?.notiz ? [el('div', { class: 'notiz' }, '📝 ' + p.notiz)] : []));
  flaeche.replaceChildren(spalte(links, pa), spalte(rechts, pb));
  fakten.textContent = '';
  if (pa && pb) {
    const { nurA, nurB } = nurInEinem(pa, pb);
    const teile: string[] = [];
    if (nurA.length) teile.push(t('cmp.onlyLeft') + ': ' + nurA.join(', '));
    if (nurB.length) teile.push(t('cmp.onlyRight') + ': ' + nurB.join(', '));
    fakten.textContent = teile.join(' · ');
  }
}

async function start(): Promise<void> {
  initLang();
  applyTranslations();
  document.title = t('cmp.title') + ' · Systembrett';
  const url = klientId
    ? '/api/snapshots?customer_id=' + encodeURIComponent(klientId)
    : '/api/snapshots?gespeichert=true&ohne_klient=true';
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    eintraege = await r.json();
  } catch {
    document.getElementById('fakten')!.textContent = '⚠ ' + t('cmp.loadFailed');
    return;
  }
  const a = param.get('a');
  links = auswahl(a);
  // Rechts: nächstjüngere Fassung vorschlagen (Liste ist neueste zuerst).
  const i = eintraege.findIndex(e => e.id === a);
  const vorschlagB = i > 0 ? eintraege[i - 1].id : (eintraege.find(e => e.id !== a)?.id ?? null);
  rechts = auswahl(vorschlagB);
  await zeichnen();
}

void start();
