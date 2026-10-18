// brett/src/client/genogramm.ts
// Genogramm-Fenster (Gerald 16.10.2026, Basisversion). Drittes Fenster neben
// Spielfeld und Steuerpult. Eigene WebSocket-Verbindung zum Raum (wie das
// Pult), dieselben Figuren und Linien – gespeichert auf dem Server mit der
// Aufstellung. Zeichnung als SVG: Personen als Quadrat/Kreis/Raute, Paar- und
// Eltern-Kind-Linien als Stammbaum, übrige Beziehungen als gerade Linien.
// Auswahl wird per BroadcastChannel mit Spielfeld und Pult abgeglichen.

import { t, initLang, applyTranslations } from './i18n';
import { PERSONEN_KATALOG, KOERPER_GROESSE, KOERPER_APPEARANCE, BLASS_OPACITY, BEZIEHUNGSARTEN,
  freierPlatz, eindeutigerName } from './person-catalog';
import {
  type GenoPerson, type GenoLinie, type Geschlecht, STRUKTUR_ARTEN,
  geschlechtVon, positionen, elternGruppen, waereZirkulaer, lebensjahre, ABSTAND_X, ABSTAND_Y,
  PAAR_ARTEN, linienStil, zickzack, markerVon, KIND_ARTEN, zwillingsPaare, type EigenerMarker,
} from './genogramm-modell';
import { EREIGNISSE } from './person-catalog';
import { ebeneText, rolleText, ereignisText, artText } from './katalog-texte';
import type { PultNachricht } from './steuerpult-sync';

type Fig = GenoPerson & { x: number; z: number; color?: string; [k: string]: any };

const SVGNS = 'http://www.w3.org/2000/svg';
const room = new URLSearchParams(location.search).get('room') || '';
const figuren = new Map<string, Fig>();
const linien = new Map<string, GenoLinie>();
let ausgewaehlt: string | null = null;
let ws: WebSocket | null = null;
const kanal = room && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`brett-${room}`) : null;

// Ansicht (Verschieben/Zoomen der Fläche)
let ansicht = { x: 80, y: 60, s: 1 };
// Verbinden-Modus: erster angeklickter Partner/Elternteil
let verbinden: { art: string; erster: string | null } | null = null;

const svg = document.getElementById('flaeche') as unknown as SVGSVGElement;
const welt = document.getElementById('welt') as unknown as SVGGElement;

// ── Verbindung ───────────────────────────────────────────────────────────────
function status(text: string, warnung = false): void {
  const s = document.getElementById('g-status')!;
  s.textContent = text;
  s.classList.toggle('warnung', warnung);
}
function senden(m: any): void { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }

async function verbindenServer(): Promise<void> {
  try {
    const me = await fetch('/auth/me', { cache: 'no-store' }).then(r => r.json());
    if (!me?.authenticated) { status('⚠ ' + t('pult.notLoggedIn'), true); setTimeout(verbindenServer, 3000); return; }
  } catch { setTimeout(verbindenServer, 3000); return; }
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${scheme}//${location.host}/sync?room=${encodeURIComponent(room)}`);
  status(t('pult.connecting'));
  ws.addEventListener('open', () => { senden({ type: 'join', room }); status(t('geno.connected')); });
  ws.addEventListener('close', () => { status(t('pult.disconnected'), true); setTimeout(verbindenServer, 2000); });
  ws.addEventListener('message', (e) => { try { empfangen(JSON.parse(e.data)); } catch { /* ignorieren */ } });
}

function empfangen(m: any): void {
  switch (m.type) {
    case 'snapshot':
      figuren.clear(); for (const f of m.figures || []) figuren.set(f.id, { ...f });
      linien.clear(); for (const l of m.lines || []) linien.set(l.id, { ...l });
      break;
    case 'add': if (m.figure?.id) figuren.set(m.figure.id, { ...m.figure }); break;
    case 'update': { const f = figuren.get(m.id); if (f) figuren.set(m.id, { ...f, ...(m.changes || {}) }); break; }
    case 'delete':
      figuren.delete(m.id);
      for (const [k, l] of linien) if (l.fromId === m.id || l.toId === m.id) linien.delete(k);
      break;
    case 'line_created': if (m.line?.id) linien.set(m.line.id, { ...m.line }); break;
    case 'line_deleted': linien.delete(m.lineId); break;
    default: return;
  }
  zeichne();
  if (m.type !== 'update' || m.id === ausgewaehlt) panel();
}

function aendernRoh(id: string, changes: Record<string, any>): void {
  const f = figuren.get(id);
  if (!f) return;
  figuren.set(id, { ...f, ...changes });
  senden({ type: 'update', id, changes });
}

// ── Rückgängig / Wiederholen (eigener Verlauf: der Server-Verlauf kennt keine
// Linien). Jede Aktion merkt ihr Gegenstück; zusammengesetzte Aktionen
// („＋ Eltern“) sind ein Schritt. Bis zu 50 Schritte.
type Schritt = { rueck: () => void; vor: () => void };
const verlauf: Schritt[][] = [];
const wieder: Schritt[][] = [];
let gruppe: Schritt[] | null = null;
function merke(sch: Schritt): void {
  if (gruppe) { gruppe.push(sch); return; }
  verlauf.push([sch]); if (verlauf.length > 50) verlauf.shift();
  wieder.length = 0;
}
function gruppiert(fn: () => void): void {
  const aussen = gruppe;
  if (aussen) { fn(); return; }
  gruppe = [];
  try { fn(); } finally {
    const g = gruppe; gruppe = null;
    if (g.length) { verlauf.push(g); if (verlauf.length > 50) verlauf.shift(); wieder.length = 0; }
  }
}
function rueckgaengig(): void {
  const g = verlauf.pop(); if (!g) return;
  for (const sch of [...g].reverse()) sch.rueck();
  wieder.push(g); zeichne(); panel();
}
function wiederholen(): void {
  const g = wieder.pop(); if (!g) return;
  for (const sch of g) sch.vor();
  verlauf.push(g); zeichne(); panel();
}

/** Ändern mit Rückgängig. vorher: Werte vor der Änderung (sonst aus dem Stand). */
function aendern(id: string, changes: Record<string, any>, vorherGegeben?: Record<string, any>): void {
  const f = figuren.get(id);
  if (!f) return;
  const vorher: Record<string, any> = vorherGegeben ?? {};
  if (!vorherGegeben) for (const k of Object.keys(changes)) vorher[k] = (f as any)[k] ?? null;
  aendernRoh(id, changes);
  merke({ rueck: () => aendernRoh(id, vorher), vor: () => aendernRoh(id, changes) });
}

function figurAdd(fig: Fig): void { figuren.set(fig.id, { ...fig }); senden({ type: 'add', figure: fig }); }
function figurDel(id: string): void {
  figuren.delete(id);
  // Der Server löscht die Linien mit; der Absender bekommt das nicht zurück.
  for (const [k, l] of linien) if (l.fromId === id || l.toId === id) linien.delete(k);
  senden({ type: 'delete', id });
}
function figurNeuMitVerlauf(fig: Fig): void {
  figurAdd(fig);
  merke({ rueck: () => figurDel(fig.id), vor: () => figurAdd(fig) });
}
function linieMeldung(von: string, zu: string, art: string, label?: string): any {
  const b = BEZIEHUNGSARTEN.find(x => x.art === art);
  const struktur = (STRUKTUR_ARTEN as readonly string[]).includes(art);
  return { type: 'line_create', fromId: von, toId: zu, lineType: b?.linie ?? 'relationship', art,
    ...(struktur ? { struktur: true } : {}), ...(label ? { label } : {}) };
}
/** Linie anlegen mit Rückgängig (Linien-ID kennt erst der Server → beim Zurücknehmen suchen). */
function linieNeu(von: string, zu: string, art: string, label?: string): void {
  const m = linieMeldung(von, zu, art, label);
  senden(m);
  merke({
    rueck: () => {
      const l = [...linien.values()].find(x => x.fromId === von && x.toId === zu && x.art === art);
      if (l) senden({ type: 'line_delete', lineId: l.id });
    },
    vor: () => senden(m),
  });
}

function waehlen(id: string | null, melden = true): void {
  ausgewaehlt = id;
  if (melden) kanal?.postMessage({ type: 'select', id, von: 'pult' } satisfies PultNachricht);
  zeichne(); panel();
}

// ── Zeichnen ─────────────────────────────────────────────────────────────────
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, String(v));
  if (text) e.textContent = text;
  return e;
}

const R = 25; // halbe Symbolgröße

function symbol(p: Fig, x: number, y: number): SVGGElement {
  const g = el('g', { 'data-id': p.id, class: 'person' + (p.id === ausgewaehlt ? ' gewaehlt' : '')
    + (p.person?.inAufstellung === false ? ' nicht-aufgestellt' : ''), transform: `translate(${x},${y})`, style: 'cursor:pointer' });
  const fuellung = (p.color || '#b8c0a8') + '55';
  const ges: Geschlecht = geschlechtVon(p);
  // Schwangerschaft / ungeborenes Kind: Dreieck; Fehlgeburt/Abbruch zusätzlich mit X
  const ungeboren = p.role === 'ungeboren';
  const fehlgeburt = ungeboren && ((p.person as any)?.ereignisse || []).includes('Fehlgeburt/Abbruch');
  const form = ungeboren ? el('polygon', { points: `0,${-R + 4} ${R - 6},${R - 8} ${-R + 6},${R - 8}`, class: 'p-form', fill: fuellung })
    : ges === 'm' ? el('rect', { x: -R, y: -R, width: 2 * R, height: 2 * R, class: 'p-form', fill: fuellung })
    : ges === 'w' ? el('circle', { r: R, class: 'p-form', fill: fuellung })
    : el('polygon', { points: `0,${-R - 4} ${R + 4},0 0,${R + 4} ${-R - 4},0`, class: 'p-form', fill: fuellung });
  g.append(form);
  // Indexperson („Ich“): doppelter Rand (Genogramm-Konvention)
  if (p.role === 'ich') {
    const innen = form.cloneNode() as SVGElement;
    if (ges === 'm') { innen.setAttribute('x', String(-R + 5)); innen.setAttribute('y', String(-R + 5)); innen.setAttribute('width', String(2 * R - 10)); innen.setAttribute('height', String(2 * R - 10)); }
    else if (ges === 'w') innen.setAttribute('r', String(R - 5));
    else innen.setAttribute('points', `0,${-R + 3} ${R - 3},0 0,${R - 3} ${-R + 3},0`);
    innen.setAttribute('fill', 'none');
    g.append(innen);
  }
  // Verstorben (oder Fehlgeburt): X im Symbol
  if (p.person?.todesjahr || fehlgeburt) {
    g.append(el('line', { x1: -R + 6, y1: -R + 6, x2: R - 6, y2: R - 6, class: 'linie' }));
    g.append(el('line', { x1: R - 6, y1: -R + 6, x2: -R + 6, y2: R - 6, class: 'linie' }));
  }
  // Name und Jahre RECHTS neben dem Symbol – oben und unten laufen die Linien.
  // Lange Namen gekürzt, voller Name als Tooltip.
  const j = lebensjahre(p);
  const name = p.label || '—';
  const kurz = name.length > 16 ? name.slice(0, 15) + '…' : name;
  const t1 = el('text', { x: R + 8, y: j ? -3 : 5, class: 'p-name' }, kurz);
  t1.append(el('title', {}, name));
  g.append(t1);
  if (j) g.append(el('text', { x: R + 8, y: 13, class: 'p-jahre' }, j));
  // Marker (Ereignisse) als Reihe kleiner Farbkreise rechts unter dem Namen –
  // unter dem Symbol verlaufen Paar- und Kinderlinien.
  const marker = markerVon(p as any);
  const breite = 19;
  marker.forEach((m, i) => {
    const mg = el('g', { transform: `translate(${R + 17 + i * breite},${j ? 29 : 19})` });
    mg.append(el('circle', { r: 9, fill: m.farbe }));
    mg.append(el('text', { y: 3.5, 'text-anchor': 'middle', fill: '#ffffff',
      style: `font: 700 ${m.kuerzel.length > 2 ? 7 : 9}px sans-serif` }, m.kuerzel));
    mg.append(el('title', {}, ereignisText(m.ereignis)));
    g.append(mg);
  });
  return g;
}

/** Emotionale Beziehung zeichnen (Genogramm-Standard), Enden außerhalb der Symbole. */
function zeichneBeziehung(ziel: SVGGElement, a0: { x: number; y: number }, b0: { x: number; y: number }, stil: string, farbe: string): void {
  const dx = b0.x - a0.x, dy = b0.y - a0.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const kurz = R + 6;
  const a = { x: a0.x + ux * kurz, y: a0.y + uy * kurz }, b = { x: b0.x - ux * kurz, y: b0.y - uy * kurz };
  const linie = (o: number, extra: Record<string, any> = {}) => ziel.append(el('line', {
    x1: a.x + nx * o, y1: a.y + ny * o, x2: b.x + nx * o, y2: b.y + ny * o, stroke: farbe, 'stroke-width': 2, ...extra }));
  switch (stil) {
    case 'doppelt': linie(-3); linie(3); break;
    case 'dreifach': linie(-5); linie(0); linie(5); break;
    case 'gestrichelt': linie(0, { 'stroke-dasharray': '7 6' }); break;
    case 'abbruch': {
      linie(0, { 'stroke-dasharray': '7 6' });
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // zwei Querstriche = Kontakt abgebrochen
      for (const o of [-5, 5]) ziel.append(el('line', { x1: m.x + ux * o - nx * 9, y1: m.y + uy * o - ny * 9,
        x2: m.x + ux * o + nx * 9, y2: m.y + uy * o + ny * 9, stroke: farbe, 'stroke-width': 2.5 }));
      break;
    }
    case 'zickzack':
      ziel.append(el('polyline', { points: zickzack(a, b).map(p => `${p.x},${p.y}`).join(' '), fill: 'none', stroke: farbe, 'stroke-width': 2 }));
      break;
    case 'pfeil': linie(0, { 'marker-end': `url(#pfeil-${farbe.slice(1)})` }); break;
    default: linie(0);
  }
}

const verwendeteStile = new Set<string>();

function zeichne(): void {
  verwendeteStile.clear();
  welt.setAttribute('transform', `translate(${ansicht.x},${ansicht.y}) scale(${ansicht.s})`);
  welt.innerHTML = '';
  const personen = [...figuren.values()];
  const pos = positionen(personen);
  // Gerald: „Abstände ändern sich, sobald man an einem anderen arbeitet“ – Personen
  // ohne gespeicherten Platz wurden bei jedem Zeichnen neu angeordnet. Jetzt
  // bekommt jede Person beim ersten Erscheinen einen festen Platz.
  if (ws && ws.readyState === WebSocket.OPEN) {
    for (const p of personen) {
      if (p.geno) continue;
      const q = pos.get(p.id)!;
      figuren.set(p.id, { ...p, geno: { x: q.x, y: q.y } });
      senden({ type: 'update', id: p.id, changes: { geno: { x: q.x, y: q.y } } });
    }
  }
  const P = (id: string) => pos.get(id);
  const ebeneLinien = el('g');
  const ebenePersonen = el('g');
  welt.append(ebeneLinien, ebenePersonen);
  const alleLinien = [...linien.values()];

  // Paarlinien (U-Form unter beiden Symbolen), Trennung „/“, Scheidung „//“
  const paarY = new Map<string, number>();
  for (const l of alleLinien) {
    if (!PAAR_ARTEN.includes(l.art || '')) continue;
    const a = P(l.fromId), b = P(l.toId);
    if (!a || !b) continue;
    const y = Math.max(a.y, b.y) + R + 12;
    paarY.set([l.fromId, l.toId].sort().join('+'), y);
    ebeneLinien.append(el('path', { d: `M${a.x},${a.y + R} V${y} H${b.x} V${b.y + R}`, class: 'linie',
      'stroke-dasharray': l.art === 'Verlobung/lockere Beziehung' ? '7 5' : undefined }));
    const mx = (a.x + b.x) / 2;
    const striche = l.art === 'Trennung' ? 1 : l.art === 'Scheidung' ? 2 : 0;
    for (let i = 0; i < striche; i++) {
      const dx = i * 8 - (striche - 1) * 4;
      ebeneLinien.append(el('line', { x1: mx + dx - 5, y1: y + 9, x2: mx + dx + 5, y2: y - 9, class: 'linie' }));
    }
  }
  // Eltern-Kind: vom Paar (oder Elternteil) nach unten, Geschwisterbalken, zu den Kindern
  for (const gr of elternGruppen(alleLinien)) {
    const e = gr.eltern.map(P).filter(Boolean) as Array<{ x: number; y: number }>;
    const k = gr.kinder.map(P).filter(Boolean) as Array<{ x: number; y: number }>;
    if (!e.length || !k.length) continue;
    const startX = e.reduce((s, p) => s + p.x, 0) / e.length;
    const startY = paarY.get(gr.eltern.slice().sort().join('+')) ?? Math.max(...e.map(p => p.y)) + R;
    const kinderOben = Math.min(...k.map(p => p.y)) - R;
    const balkenY = Math.max(startY + 10, kinderOben - 22);
    const xs = k.map(p => p.x);
    ebeneLinien.append(el('path', { d: `M${startX},${startY} V${balkenY} M${Math.min(startX, ...xs)},${balkenY} H${Math.max(startX, ...xs)}`, class: 'linie' }));
    // Zwillinge: beide Kind-Linien starten an einem gemeinsamen Punkt
    const startVon = new Map<string, number>();
    const zwillinge = zwillingsPaare(alleLinien).filter(z => gr.kinder.includes(z.a) && gr.kinder.includes(z.b));
    for (const z of zwillinge) {
      const pa = P(z.a), pb = P(z.b);
      if (!pa || !pb) continue;
      const mx = (pa.x + pb.x) / 2;
      startVon.set(z.a, mx); startVon.set(z.b, mx);
      if (z.eineiig) {
        // eineiig: Querstrich zwischen den beiden Linien auf halber Höhe
        const yq = balkenY + (Math.min(pa.y, pb.y) - R - balkenY) / 2;
        const xa = mx + (pa.x - mx) / 2, xb = mx + (pb.x - mx) / 2;
        ebeneLinien.append(el('line', { x1: xa, y1: yq, x2: xb, y2: yq, class: 'linie' }));
      }
    }
    for (const kid of gr.kinder) {
      const q = P(kid); if (!q) continue;
      const sx = startVon.get(kid) ?? q.x;
      const adopt = gr.adoptiert.includes(kid);
      ebeneLinien.append(el('path', { d: `M${sx},${balkenY} L${q.x},${q.y - R}`, class: 'linie',
        'stroke-dasharray': adopt ? '6 4' : undefined }));
      if (adopt) ebeneLinien.append(el('text', { x: q.x + 6, y: (balkenY + q.y - R) / 2 + 4, class: 'p-jahre' }, t('geno.adoptedLabel')));
    }
  }
  // Übrige (emotionale) Beziehungen: gerade Linie, Farbe nach Typ, Beschriftung
  for (const l of alleLinien) {
    if ((STRUKTUR_ARTEN as readonly string[]).includes(l.art || '')) continue;
    const a = P(l.fromId), b = P(l.toId);
    if (!a || !b) continue;
    const { stil, farbe } = linienStil(l.art, l.lineType);
    verwendeteStile.add(l.art || l.lineType || '');
    zeichneBeziehung(ebeneLinien, a, b, stil, farbe);
    // Nur eigene Bezeichnung zeigen – die Art erklärt die Legende.
    const text = l.label;
    if (text) ebeneLinien.append(el('text', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 6, 'text-anchor': 'middle',
      class: 'p-jahre', fill: farbe }, text));
  }
  for (const p of personen) {
    const q = P(p.id)!;
    ebenePersonen.append(symbol(p, q.x, q.y));
  }
  zeichneLegende(personen, alleLinien);
}

// ── Legende ──────────────────────────────────────────────────────────────────
let legendeAn = (() => { try { return localStorage.getItem('geno_legende') !== 'aus'; } catch { return true; } })();

function pfeilDefs(): void {
  if (svg.querySelector('defs#geno-defs')) return;
  const defs = el('defs', { id: 'geno-defs' });
  for (const farbe of ['#c0392b', '#2e8b57', '#2f6fb0']) {
    const m = el('marker', { id: 'pfeil-' + farbe.slice(1), viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse' });
    m.append(el('path', { d: 'M0,0 L10,5 L0,10 z', fill: farbe }));
    defs.append(m);
  }
  svg.prepend(defs);
}

/** Legende: nur was im Genogramm vorkommt (Prompt: automatisch generiert). */
function zeichneLegende(personen: Fig[], alleLinien: GenoLinie[]): void {
  svg.querySelector('#legende')?.remove();
  if (!legendeAn || !personen.length) return;
  const g = el('g', { id: 'legende', transform: 'translate(12,12)' });
  const zeilen: Array<(z: SVGGElement) => void> = [];
  const symbolZeile = (form: string) => (z: SVGGElement) => {
    const s = 8;
    if (form === 'm') z.append(el('rect', { x: 2, y: -s, width: 2 * s, height: 2 * s, fill: 'none', stroke: '#1f2630', 'stroke-width': 1.5 }));
    else if (form === 'w') z.append(el('circle', { cx: 10, cy: 0, r: s, fill: 'none', stroke: '#1f2630', 'stroke-width': 1.5 }));
    else if (form === 'd') z.append(el('polygon', { points: `10,${-s - 2} ${s + 12},0 10,${s + 2} ${-s + 8},0`, fill: 'none', stroke: '#1f2630', 'stroke-width': 1.5 }));
    else if (form === 'tri') z.append(el('polygon', { points: `10,-8 18,7 2,7`, fill: 'none', stroke: '#1f2630', 'stroke-width': 1.5 }));
    else if (form === 'x') { z.append(el('rect', { x: 2, y: -s, width: 2 * s, height: 2 * s, fill: 'none', stroke: '#1f2630', 'stroke-width': 1.5 }));
      z.append(el('path', { d: 'M4,-6 L16,6 M16,-6 L4,6', stroke: '#1f2630', 'stroke-width': 1.5 })); }
    else if (form === 'ich') { z.append(el('rect', { x: 2, y: -s, width: 2 * s, height: 2 * s, fill: 'none', stroke: '#1f2630', 'stroke-width': 1.5 }));
      z.append(el('rect', { x: 5, y: -s + 3, width: 2 * s - 6, height: 2 * s - 6, fill: 'none', stroke: '#1f2630', 'stroke-width': 1.5 })); }
    else if (form === 'aus') z.append(el('rect', { x: 2, y: -s, width: 2 * s, height: 2 * s, fill: 'none', stroke: '#1f2630', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', opacity: 0.6 }));
  };
  const linienZeile = (stil: string, farbe: string) => (z: SVGGElement) => zeichneBeziehung(z, { x: -R - 6 + 0, y: 0 }, { x: 22 + R + 6, y: 0 }, stil, farbe);
  const add = (zeichner: (z: SVGGElement) => void, text: string) => zeilen.push((z) => { zeichner(z); z.append(el('text', { x: 30, y: 4, class: 'p-jahre' }, text)); });
  const ges = new Set(personen.filter(p => p.role !== 'ungeboren').map(p => geschlechtVon(p)));
  if (ges.has('m')) add(symbolZeile('m'), t('geno.legMale'));
  if (ges.has('w')) add(symbolZeile('w'), t('geno.legFemale'));
  if (ges.has('d')) add(symbolZeile('d'), t('geno.legUnknown'));
  if (personen.some(p => p.role === 'ich')) add(symbolZeile('ich'), t('geno.legIndex'));
  if (personen.some(p => p.person?.todesjahr)) add(symbolZeile('x'), t('geno.legDeceased'));
  if (personen.some(p => p.role === 'ungeboren')) add(symbolZeile('tri'), t('geno.legUnborn'));
  if (personen.some(p => p.person?.inAufstellung === false)) add(symbolZeile('aus'), t('geno.legNotOnBoard'));
  const arten = new Set(alleLinien.map(l => l.art || ''));
  const paar = (art: string, d: string, extra: Record<string, any> = {}) => add((z) => z.append(el('path', { d, fill: 'none', stroke: '#1f2630', 'stroke-width': 2, ...extra })), artText(art));
  if (arten.has('Ehe/Partnerschaft')) paar('Ehe/Partnerschaft', 'M2,-6 V4 H20 V-6');
  if (arten.has('Verlobung/lockere Beziehung')) paar('Verlobung/lockere Beziehung', 'M2,-6 V4 H20 V-6', { 'stroke-dasharray': '4 3' });
  if (arten.has('Trennung')) paar('Trennung', 'M2,-6 V4 H20 V-6 M8,9 L14,-1');
  if (arten.has('Scheidung')) paar('Scheidung', 'M2,-6 V4 H20 V-6 M5,9 L11,-1 M11,9 L17,-1');
  if (arten.has('Eltern–Kind')) paar('Eltern–Kind', 'M11,-8 V0 M2,0 H20 M2,0 V8 M20,0 V8');
  if (arten.has('Adoptiv-/Pflege-/Stiefkind')) paar('Adoptiv-/Pflege-/Stiefkind', 'M11,-8 V8', { 'stroke-dasharray': '4 3' });
  if (arten.has('Zwillinge')) paar('Zwillinge', 'M11,-6 L3,8 M11,-6 L19,8');
  if (arten.has('Zwillinge (eineiig)')) paar('Zwillinge (eineiig)', 'M11,-6 L3,8 M11,-6 L19,8 M7,1 H15');
  // verwendete Marker (Ereignisse)
  const gesehen = new Map<string, { kuerzel: string; farbe: string }>();
  for (const p of personen) for (const m of markerVon(p as any)) if (!gesehen.has(m.ereignis)) gesehen.set(m.ereignis, m);
  for (const [ereignis, m] of gesehen) {
    zeilen.push((z) => {
      z.append(el('circle', { cx: 11, cy: 0, r: 8, fill: m.farbe }));
      z.append(el('text', { x: 11, y: 3, 'text-anchor': 'middle', fill: '#ffffff', style: `font: 700 ${m.kuerzel.length > 2 ? 6 : 8}px sans-serif` }, m.kuerzel));
      z.append(el('text', { x: 30, y: 4, class: 'p-jahre' }, (ereignisText(ereignis).length > 30 ? ereignisText(ereignis).slice(0, 29) + '…' : ereignisText(ereignis))));
    });
  }
  for (const art of verwendeteStile) {
    if (!art) continue;
    const l = alleLinien.find(x => (x.art || x.lineType) === art);
    const st = linienStil(l?.art, l?.lineType);
    zeilen.push((z) => { zeichneBeziehung(z, { x: -R - 6 + 2, y: 0 }, { x: 20 + R + 6, y: 0 }, st.stil, st.farbe); z.append(el('text', { x: 30, y: 4, class: 'p-jahre' }, artText(art))); });
  }
  void linienZeile;
  const hoehe = zeilen.length * 22 + 30;
  g.append(el('rect', { x: 0, y: 0, width: 240, height: hoehe, rx: 8, fill: '#ffffff', 'fill-opacity': 0.92, stroke: '#c9c3b6' }));
  g.append(el('text', { x: 10, y: 18, class: 'p-name' }, t('geno.legend')));
  zeilen.forEach((f, i) => { const z = el('g', { transform: `translate(10,${38 + i * 22})` }); f(z); g.append(z); });
  svg.append(g);
}

function legendeUmschalten(): void {
  legendeAn = !legendeAn;
  try { localStorage.setItem('geno_legende', legendeAn ? 'an' : 'aus'); } catch { /* egal */ }
  einpassen();
}

/** Zeichnung als PNG-Daten (doppelte Auflösung) – für PNG- und PDF-Export. */
function bildErzeugen(): Promise<{ daten: string; w: number; h: number }> {
  return new Promise((ok, fehler) => {
    const r = svg.getBoundingClientRect();
    const kopie = svg.cloneNode(true) as SVGSVGElement;
    kopie.setAttribute('width', String(r.width)); kopie.setAttribute('height', String(r.height));
    const stil = document.createElementNS(SVGNS, 'style'); stil.textContent = SVG_STIL; kopie.prepend(stil);
    const bild = new Image();
    bild.onload = () => {
      const c = document.createElement('canvas'); c.width = r.width * 2; c.height = r.height * 2;
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#f4f1ea'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bild, 0, 0, c.width, c.height);
      ok({ daten: c.toDataURL('image/png'), w: c.width, h: c.height });
    };
    bild.onerror = () => fehler(new Error('Bild konnte nicht erzeugt werden'));
    bild.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(kopie));
  });
}

async function pdfSpeichern(): Promise<void> {
  const format = (document.getElementById('g-pdf-format') as HTMLSelectElement).value as 'a4' | 'a3';
  try {
    const { daten, w, h } = await bildErzeugen();
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format });
    const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
    doc.setFontSize(14); doc.text(t('geno.title') + ' – ' + new Date().toLocaleDateString('de-DE'), 10, 12);
    const rand = 10, oben = 18;
    const f = Math.min((pw - 2 * rand) / w, (ph - oben - rand) / h);
    doc.addImage(daten, 'PNG', rand + ((pw - 2 * rand) - w * f) / 2, oben, w * f, h * f);
    doc.save(`genogramm-${new Date().toISOString().slice(0, 10)}-${format}.pdf`);
  } catch { status('⚠ ' + t('geno.exportFailed'), true); }
}

function pngSpeichern(): void {
  const r = svg.getBoundingClientRect();
  const kopie = svg.cloneNode(true) as SVGSVGElement;
  kopie.setAttribute('width', String(r.width)); kopie.setAttribute('height', String(r.height));
  const stil = document.createElementNS(SVGNS, 'style');
  stil.textContent = SVG_STIL;
  kopie.prepend(stil);
  const daten = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(kopie));
  const bild = new Image();
  bild.onload = () => {
    const faktor = 2; // doppelte Auflösung für Druck
    const c = document.createElement('canvas');
    c.width = r.width * faktor; c.height = r.height * faktor;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f4f1ea'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bild, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `genogramm-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  };
  bild.src = daten;
}

const SVG_STIL = '.p-form{stroke:#1f2630;stroke-width:2}.p-name{font:600 13px sans-serif;fill:#1f2630}'
  + '.p-jahre{font:12px sans-serif;fill:#5a6270}.linie{stroke:#1f2630;stroke-width:2;fill:none}'
  + '.nicht-aufgestellt{opacity:.55}.nicht-aufgestellt .p-form{stroke-dasharray:5 4}';

// ── Seitenleiste: ausgewählte Person ─────────────────────────────────────────
function panel(): void {
  const a = document.getElementById('g-panel')!;
  if (a.contains(document.activeElement) && ['INPUT', 'SELECT'].includes(document.activeElement!.tagName)) return;
  a.innerHTML = '';
  const f = ausgewaehlt ? figuren.get(ausgewaehlt) : null;
  if (!f) {
    a.append(Object.assign(document.createElement('div'), { className: 'klein', textContent: t('geno.selectHint') }));
    return;
  }
  const h2 = document.createElement('h2'); h2.textContent = f.label || '—'; a.append(h2);
  const feld = (label: string, inhalt: HTMLElement) => {
    const l = document.createElement('label'); l.className = 'feld'; l.append(label, inhalt); a.append(l);
  };
  const name = Object.assign(document.createElement('input'), { type: 'text', value: f.label || '', maxLength: 40 });
  name.addEventListener('change', () => { aendern(f.id, { label: name.value }); zeichne(); });
  feld(t('pult.name'), name);
  const ges = document.createElement('select');
  for (const [v, k] of [['', 'geno.genderAuto'], ['m', 'geno.male'], ['w', 'geno.female'], ['d', 'geno.unknown']]) {
    const o = document.createElement('option'); o.value = v; o.textContent = t(k); if ((f.geschlecht || '') === v) o.selected = true; ges.append(o);
  }
  ges.addEventListener('change', () => { aendern(f.id, { geschlecht: ges.value || undefined }); zeichne(); });
  feld(t('geno.gender'), ges);
  const jahr = (key: 'geburtsjahr' | 'todesjahr', label: string) => {
    const i = Object.assign(document.createElement('input'), { type: 'number', value: f.person?.[key] ?? '', min: '1800', max: '2100' });
    i.addEventListener('change', () => {
      const n = parseInt(i.value, 10);
      const person = { ...(figuren.get(f.id)?.person || {}), [key]: Number.isFinite(n) ? n : undefined };
      if (person.geburtsjahr && person.todesjahr && person.geburtsjahr > person.todesjahr) {
        status('⚠ ' + t('geno.yearsInvalid'), true); return;
      }
      aendern(f.id, { person }); zeichne();
    });
    feld(label, i);
  };
  jahr('geburtsjahr', t('person.born'));
  jahr('todesjahr', t('person.died'));
  // Ereignisse (= Marker) direkt hier umschalten
  const ev = document.createElement('div'); ev.className = 'klein'; ev.textContent = t('person.events'); ev.style.marginTop = '8px'; a.append(ev);
  const chips = document.createElement('div'); chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:4px 0';
  const aktiv = new Set(f.person?.ereignisse ?? []);
  for (const e of EREIGNISSE) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = ereignisText(e);
    b.style.cssText = 'font-size:11px;padding:2px 7px;border-radius:10px';
    if (aktiv.has(e)) { b.style.background = 'var(--accent)'; b.style.color = 'var(--bg)'; }
    b.addEventListener('click', () => {
      aktiv.has(e) ? aktiv.delete(e) : aktiv.add(e);
      aendern(f.id, { person: { ...(figuren.get(f.id)?.person || {}), ereignisse: [...aktiv] } });
      zeichne(); panel();
    });
    chips.append(b);
  }
  a.append(chips);
  const sonst = Object.assign(document.createElement('input'), { type: 'text', value: (f.person as any)?.sonstiges ?? '', maxLength: 300, placeholder: t('person.other') });
  sonst.addEventListener('change', () => { aendern(f.id, { person: { ...(figuren.get(f.id)?.person || {}), sonstiges: sonst.value.trim() || undefined } }); zeichne(); });
  feld(t('person.other'), sonst);
  // Eigene Marker: im Raum schon verwendete zum Umschalten + neuen anlegen
  const meine: EigenerMarker[] = (f.person as any)?.marker ?? [];
  const bekannt = new Map<string, EigenerMarker>();
  for (const x of figuren.values()) for (const m of ((x.person as any)?.marker ?? []) as EigenerMarker[]) bekannt.set(m.name, m);
  const em = document.createElement('div'); em.className = 'klein'; em.textContent = t('geno.ownMarkers'); em.style.marginTop = '8px'; a.append(em);
  const emChips = document.createElement('div'); emChips.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:4px 0';
  const setzeMarker = (liste: EigenerMarker[]) => { aendern(f.id, { person: { ...(figuren.get(f.id)?.person || {}), marker: liste } }); zeichne(); panel(); };
  for (const m of bekannt.values()) {
    const an = meine.some(x => x.name === m.name);
    const b = document.createElement('button'); b.type = 'button'; b.textContent = m.kuerzel + ' · ' + m.name;
    b.style.cssText = 'font-size:11px;padding:2px 7px;border-radius:10px;border-left:4px solid ' + m.farbe + (an ? ';background:var(--accent);color:var(--bg)' : '');
    b.addEventListener('click', () => setzeMarker(an ? meine.filter(x => x.name !== m.name) : [...meine, m]));
    emChips.append(b);
  }
  a.append(emChips);
  const neuName = Object.assign(document.createElement('input'), { type: 'text', maxLength: 40, placeholder: t('geno.markerName') });
  const neuKurz = Object.assign(document.createElement('input'), { type: 'text', maxLength: 3, placeholder: t('geno.markerCode') });
  neuKurz.style.width = '64px';
  const farben = ['#6b6f78', '#c0392b', '#d9822b', '#2f6fb0', '#7b4fa0', '#2e8b57', '#b0892f'];
  let farbe = farben[0];
  const farbReihe = document.createElement('div'); farbReihe.style.cssText = 'display:flex;gap:4px;margin:4px 0';
  for (const c of farben) {
    const b = document.createElement('button'); b.type = 'button'; b.title = c;
    b.style.cssText = 'width:20px;height:20px;padding:0;border-radius:50%;background:' + c + ';border:2px solid ' + (c === farbe ? 'var(--fg)' : 'transparent');
    b.addEventListener('click', () => { farbe = c; farbReihe.querySelectorAll('button').forEach(x => ((x as HTMLElement).style.borderColor = 'transparent')); b.style.borderColor = 'var(--fg)'; });
    farbReihe.append(b);
  }
  const anlegen = document.createElement('button'); anlegen.type = 'button'; anlegen.textContent = '＋ ' + t('geno.markerAdd');
  anlegen.addEventListener('click', () => {
    const name = neuName.value.trim(); const kurz = neuKurz.value.trim() || name.slice(0, 2);
    if (!name) return;
    setzeMarker([...meine.filter(x => x.name !== name), { name, kuerzel: kurz, farbe }]);
  });
  const zeileM = document.createElement('div'); zeileM.className = 'reihe'; zeileM.append(neuName, neuKurz);
  a.append(zeileM, farbReihe, anlegen);
  const auf = Object.assign(document.createElement('input'), { type: 'checkbox', checked: f.person?.inAufstellung !== false });
  auf.addEventListener('change', () => { aendern(f.id, { person: { ...(f.person || {}), inAufstellung: auf.checked } }); zeichne(); panel(); });
  const lab = document.createElement('label'); lab.className = 'feld'; lab.style.flexDirection = 'row'; lab.style.alignItems = 'center'; lab.style.gap = '6px';
  lab.append(auf, t('geno.onBoard')); a.append(lab);
  // Familie erweitern: neue Person an der richtigen Stelle, gleich verbunden.
  const h3 = document.createElement('h2'); h3.textContent = t('geno.extend'); h3.style.marginTop = '14px'; a.append(h3);
  const raster = document.createElement('div'); raster.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px';
  for (const [key, fn] of [['geno.addPartner', () => partnerHinzu(f.id)], ['geno.addChild', () => kindHinzu(f.id)],
    ['geno.addParents', () => elternHinzu(f.id)], ['geno.addSibling', () => geschwisterHinzu(f.id)],
    ['geno.addAdopted', () => adoptivkindHinzu(f.id)], ['geno.addTwin', () => zwillingHinzu(f.id)]] as Array<[string, () => void]>) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = '＋ ' + t(key); b.addEventListener('click', fn); raster.append(b);
  }
  a.append(raster);
  // Löschen (zweistufig)
  const loeschen = document.createElement('button'); loeschen.type = 'button'; loeschen.textContent = '🗑 ' + t('pult.delete');
  loeschen.style.marginTop = '14px';
  let bereit = false;
  loeschen.addEventListener('click', () => {
    if (!bereit) { bereit = true; loeschen.textContent = t('pult.deleteConfirm'); loeschen.style.background = 'var(--danger)'; return; }
    // Löschen mit Rückgängig: Person und ihre Linien merken
    const fig = { ...figuren.get(f.id)! };
    const ihre = [...linien.values()].filter(l => l.fromId === f.id || l.toId === f.id).map(l => ({ ...l }));
    figurDel(f.id);
    merke({
      rueck: () => { figurAdd(fig); for (const l of ihre) senden(linieMeldung(l.fromId, l.toId, l.art || '', l.label)); },
      vor: () => figurDel(fig.id),
    });
    waehlen(null);
  });
  a.append(loeschen);
  a.append(Object.assign(document.createElement('div'), { className: 'klein', textContent: t('geno.moreInPult'), style: 'margin-top:10px' }));
}

// ── Familie erweitern ────────────────────────────────────────────────────────
function posVon(id: string): { x: number; y: number } {
  return figuren.get(id)?.geno ?? positionen([...figuren.values()]).get(id) ?? { x: 0, y: 0 };
}
function frei(x: number, y: number): { x: number; y: number } {
  // nach rechts ausweichen, bis der Platz frei ist
  const belegt = [...figuren.values()].map(f => posVon(f.id));
  let px = x;
  while (belegt.some(b => Math.abs(b.y - y) < ABSTAND_Y / 2 && Math.abs(b.x - px) < ABSTAND_X * 0.8)) px += ABSTAND_X;
  return { x: px, y };
}
function partnerVon(id: string): string | null {
  for (const l of linien.values()) {
    if (!PAAR_ARTEN.includes(l.art || '')) continue;
    if (l.fromId === id) return l.toId;
    if (l.toId === id) return l.fromId;
  }
  return null;
}
function elternVon(id: string): string[] {
  return [...linien.values()].filter(l => KIND_ARTEN.includes(l.art || '') && l.toId === id).map(l => l.fromId);
}
const istIch = (id: string) => figuren.get(id)?.role === 'ich';
const nameVon = (id: string) => figuren.get(id)?.label || '—';

/** Neue Person anlegen (Brett-Platz frei, Genogramm-Platz fest). */
function neuePerson(label: string, geno: { x: number; y: number }, extra: Partial<Fig> = {}, aufBrett = true): string {
  const alle = [...figuren.values()];
  const platz = freierPlatz(alle.map(f => ({ x: f.x, z: f.z })));
  const id = crypto.randomUUID();
  const fig: Fig = {
    id, x: platz.x, z: platz.z, facingY: 0, label: eindeutigerName(label, alle.map(f => f.label || '')),
    color: '#b8c0a8', scale: 1, geno, person: { inAufstellung: aufBrett }, ...extra,
  };
  figurNeuMitVerlauf(fig);
  return id;
}
function linie(von: string, zu: string, art: string): void {
  linieNeu(von, zu, art);
}
const gegen = (g: Geschlecht): Geschlecht => g === 'm' ? 'w' : g === 'w' ? 'm' : 'd';

function partnerHinzu(id: string): void { gruppiert(() => partnerHinzuInnen(id)); }
function partnerHinzuInnen(id: string): void {
  const p = posVon(id);
  const f = figuren.get(id)!;
  const neu = neuePerson(istIch(id) ? 'Partner/in' : 'Partner/in von ' + nameVon(id), frei(p.x + ABSTAND_X, p.y),
    { geschlecht: gegen(geschlechtVon(f)), ...(istIch(id) ? { role: 'partner', color: '#4f7cac' } : {}) });
  linie(id, neu, 'Ehe/Partnerschaft');
  waehlen(neu);
}
function kindHinzu(id: string): void { gruppiert(() => kindHinzuInnen(id)); }
function kindHinzuInnen(id: string): void {
  const p = posVon(id);
  const partner = partnerVon(id);
  const mitte = partner ? (p.x + posVon(partner).x) / 2 : p.x;
  const ich = istIch(id) || (partner !== null && istIch(partner));
  const neu = neuePerson(ich ? 'Kind' : 'Kind von ' + nameVon(id), frei(mitte, p.y + ABSTAND_Y),
    { ...(ich ? { role: 'kind', color: '#4f7cac', scale: 0.7 } : { scale: 0.7 }) });
  linie(id, neu, 'Eltern–Kind');
  if (partner) linie(partner, neu, 'Eltern–Kind');
  waehlen(neu);
}
function elternHinzu(id: string): void { gruppiert(() => elternHinzuInnen(id)); }
function elternHinzuInnen(id: string): void {
  if (elternVon(id).length) { status('⚠ ' + t('geno.hasParents'), true); return; }
  const p = posVon(id);
  const ich = istIch(id);
  // Eltern von Vater/Mutter des „Ich“ = Großeltern väter-/mütterlicherseits (Katalog-Rollen).
  const rolle = figuren.get(id)?.role;
  const seite = rolle === 'vater' ? 'vater' : rolle === 'mutter' ? 'mutter' : null;
  const gross = seite ? (seite === 'vater' ? 'väterlicherseits' : 'mütterlicherseits') : '';
  const vName = ich ? 'Vater' : seite ? 'Großvater ' + gross : 'Vater von ' + nameVon(id);
  const mName = ich ? 'Mutter' : seite ? 'Großmutter ' + gross : 'Mutter von ' + nameVon(id);
  const vater = neuePerson(vName, frei(p.x - ABSTAND_X / 2, p.y - ABSTAND_Y),
    { geschlecht: 'm', ...(ich ? { role: 'vater', color: '#c0607a' } : seite ? { role: 'gv-' + seite, color: '#8a7fa8', scale: 0.95 } : {}) });
  const mutter = neuePerson(mName, frei(p.x + ABSTAND_X / 2, p.y - ABSTAND_Y),
    { geschlecht: 'w', ...(ich ? { role: 'mutter', color: '#c0607a' } : seite ? { role: 'gm-' + seite, color: '#8a7fa8', scale: 0.95 } : {}) });
  linie(vater, mutter, 'Ehe/Partnerschaft');
  linie(vater, id, 'Eltern–Kind');
  linie(mutter, id, 'Eltern–Kind');
  waehlen(id);
}
function geschwisterHinzu(id: string): void { gruppiert(() => geschwisterHinzuInnen(id)); }
function geschwisterHinzuInnen(id: string): void {
  const eltern = elternVon(id);
  if (!eltern.length) { status('⚠ ' + t('geno.needParents'), true); return; }
  const p = posVon(id);
  const neu = neuePerson(istIch(id) ? 'Geschwister' : 'Geschwister von ' + nameVon(id), frei(p.x + ABSTAND_X, p.y), {}, false);
  for (const e of eltern) linie(e, neu, 'Eltern–Kind');
  waehlen(neu);
}

function adoptivkindHinzu(id: string): void {
  gruppiert(() => {
    const p = posVon(id);
    const partner = partnerVon(id);
    const mitte = partner ? (p.x + posVon(partner).x) / 2 : p.x;
    const neu = neuePerson(istIch(id) ? 'Adoptiv-/Pflegekind' : 'Adoptiv-/Pflegekind von ' + nameVon(id),
      frei(mitte, p.y + ABSTAND_Y), { scale: 0.7 });
    linie(id, neu, 'Adoptiv-/Pflege-/Stiefkind');
    if (partner) linie(partner, neu, 'Adoptiv-/Pflege-/Stiefkind');
    waehlen(neu);
  });
}
function zwillingHinzu(id: string): void {
  const eltern = elternVon(id);
  if (!eltern.length) { status('⚠ ' + t('geno.needParents'), true); return; }
  gruppiert(() => {
    const p = posVon(id);
    const art = [...linien.values()].find(l => KIND_ARTEN.includes(l.art || '') && l.toId === id)?.art ?? 'Eltern–Kind';
    const neu = neuePerson('Zwilling von ' + nameVon(id), frei(p.x + ABSTAND_X, p.y),
      { scale: figuren.get(id)?.scale ?? 1 }, figuren.get(id)?.person?.inAufstellung !== false);
    for (const e of eltern) linie(e, neu, art);
    linie(id, neu, 'Zwillinge');
    waehlen(neu);
  });
}

// ── Personen hinzufügen (Katalog) ────────────────────────────────────────────
function personHinzufuegen(ebeneKey: string, rolleKey: string): void {
  const eb = PERSONEN_KATALOG.find(e => e.key === ebeneKey)!;
  const r = eb.rollen.find(x => x.key === rolleKey)!;
  const alle = [...figuren.values()];
  const platz = freierPlatz(alle.map(f => ({ x: f.x, z: f.z })));
  const id = crypto.randomUUID();
  // „In der Aufstellung“ nach Geralds Tabelle: ja/meist → auf dem Brett, sonst nur erfasst.
  const aufBrett = r.inAufstellung === 'ja' || r.inAufstellung === 'meist';
  const fig: Fig = {
    id, x: platz.x, z: platz.z, facingY: 0,
    label: eindeutigerName(rolleText(r), alle.map(f => f.label || '')),
    color: eb.farbe, scale: KOERPER_GROESSE[r.koerper], role: r.key,
    appearance: { body: KOERPER_APPEARANCE[r.koerper] },
    person: { inAufstellung: aufBrett },
    ...(r.blass ? { opacity: BLASS_OPACITY } : {}),
  };
  figurNeuMitVerlauf(fig);
  document.querySelector('.katalog')?.remove();
  waehlen(id);
}

function katalogZeigen(): void {
  const alt = document.querySelector('.katalog');
  if (alt) { alt.remove(); return; }
  const k = document.createElement('div'); k.className = 'katalog';
  for (const eb of PERSONEN_KATALOG) {
    const d = document.createElement('details');
    const s = document.createElement('summary'); s.textContent = ebeneText(eb); s.style.borderLeftColor = eb.farbe; d.append(s);
    const r = document.createElement('div'); r.className = 'raster';
    for (const rolle of eb.rollen) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = rolleText(rolle);
      b.addEventListener('click', () => personHinzufuegen(eb.key, rolle.key));
      r.append(b);
    }
    d.append(r); k.append(d);
  }
  document.body.append(k);
}

// ── Verbinden ────────────────────────────────────────────────────────────────
function hinweis(text: string | null): void {
  document.querySelector('.hinweis')?.remove();
  if (!text) return;
  const h = document.createElement('div'); h.className = 'hinweis'; h.textContent = text; document.body.append(h);
}

function verbindenKlick(id: string): void {
  if (!verbinden) return;
  if (!verbinden.erster) {
    verbinden.erster = id;
    hinweis(verbinden.art === 'Eltern–Kind' ? t('geno.pickChild') : t('geno.pickSecond'));
    return;
  }
  const von = verbinden.erster, zu = id;
  if (von === zu) return;
  if (KIND_ARTEN.includes(verbinden.art) && waereZirkulaer([...linien.values()], von, zu)) {
    status('⚠ ' + t('geno.circular'), true); return;
  }
  linieNeu(von, zu, verbinden.art);
  verbinden.erster = null;
  hinweis(verbinden.art === 'Eltern–Kind' ? t('geno.pickParent') : t('geno.pickFirst'));
}

function verbindenUmschalten(): void {
  const btn = document.getElementById('g-verbinden')!;
  if (verbinden) { verbinden = null; btn.classList.remove('aktiv'); btn.textContent = t('geno.connectStart'); hinweis(null); return; }
  const art = (document.getElementById('g-art') as HTMLSelectElement).value;
  verbinden = { art, erster: null };
  btn.classList.add('aktiv'); btn.textContent = t('geno.connectStop');
  hinweis(art === 'Eltern–Kind' ? t('geno.pickParent') : t('geno.pickFirst'));
}

// ── Maus: Personen ziehen, Fläche verschieben, zoomen ────────────────────────
function weltPunkt(e: PointerEvent | WheelEvent): { x: number; y: number } {
  const r = svg.getBoundingClientRect();
  return { x: (e.clientX - r.left - ansicht.x) / ansicht.s, y: (e.clientY - r.top - ansicht.y) / ansicht.s };
}

let zug: { art: 'person'; id: string; dx: number; dy: number; bewegt: boolean; start: { x: number; y: number } } | { art: 'flaeche'; x: number; y: number; ax: number; ay: number } | null = null;

svg.addEventListener('pointerdown', (e) => {
  const g = (e.target as Element).closest('g.person') as SVGGElement | null;
  svg.setPointerCapture(e.pointerId);
  if (g) {
    const id = g.dataset.id!;
    const p = positionen([...figuren.values()]).get(id)!;
    const w = weltPunkt(e);
    zug = { art: 'person', id, dx: w.x - p.x, dy: w.y - p.y, bewegt: false, start: { ...p } };
  } else {
    zug = { art: 'flaeche', x: e.clientX, y: e.clientY, ax: ansicht.x, ay: ansicht.y };
    svg.classList.add('ziehen');
  }
});
svg.addEventListener('pointermove', (e) => {
  if (!zug) return;
  if (zug.art === 'flaeche') {
    ansicht.x = zug.ax + (e.clientX - zug.x); ansicht.y = zug.ay + (e.clientY - zug.y);
    welt.setAttribute('transform', `translate(${ansicht.x},${ansicht.y}) scale(${ansicht.s})`);
    return;
  }
  const w = weltPunkt(e);
  const f = figuren.get(zug.id);
  if (!f) return;
  // Einrasten auf 10er-Raster
  const geno = { x: Math.round((w.x - zug.dx) / 10) * 10, y: Math.round((w.y - zug.dy) / 10) * 10 };
  if (!zug.bewegt && f.geno && Math.hypot(geno.x - f.geno.x, geno.y - f.geno.y) < 6) return;
  zug.bewegt = true;
  figuren.set(zug.id, { ...f, geno });
  zeichne();
});
svg.addEventListener('pointerup', () => {
  svg.classList.remove('ziehen');
  if (zug?.art === 'person') {
    const id = zug.id;
    if (zug.bewegt) aendern(id, { geno: figuren.get(id)!.geno }, { geno: zug.start });
    else if (verbinden) verbindenKlick(id);
    else waehlen(id);
  }
  zug = null;
});
svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const w = weltPunkt(e);
  const s = Math.max(0.25, Math.min(3, ansicht.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
  ansicht.x -= w.x * (s - ansicht.s); ansicht.y -= w.y * (s - ansicht.s); ansicht.s = s;
  welt.setAttribute('transform', `translate(${ansicht.x},${ansicht.y}) scale(${ansicht.s})`);
}, { passive: false });

function einpassen(): void {
  const pos = [...positionen([...figuren.values()]).values()];
  if (!pos.length) return;
  // rechts Platz für Namen neben dem Symbol
  const minX = Math.min(...pos.map(p => p.x)) - 60, maxX = Math.max(...pos.map(p => p.x)) + 170;
  const minY = Math.min(...pos.map(p => p.y)) - 60, maxY = Math.max(...pos.map(p => p.y)) + 90;
  const r = svg.getBoundingClientRect();
  // Platz für die Legende links oben lassen
  const links = legendeAn ? 260 : 0;
  const breite = r.width - links;
  const s = Math.max(0.25, Math.min(2, Math.min(breite / (maxX - minX), r.height / (maxY - minY))));
  ansicht = { s, x: links + (breite - (maxX - minX) * s) / 2 - minX * s, y: (r.height - (maxY - minY) * s) / 2 - minY * s };
  zeichne();
}

function svgSpeichern(): void {
  const kopie = svg.cloneNode(true) as SVGSVGElement;
  const r = svg.getBoundingClientRect();
  kopie.setAttribute('width', String(r.width)); kopie.setAttribute('height', String(r.height));
  kopie.setAttribute('style', 'background:#f4f1ea');
  // Stile einbetten, damit die Datei allein lesbar ist
  const stil = document.createElementNS(SVGNS, 'style');
  stil.textContent = SVG_STIL;
  kopie.prepend(stil);
  const blob = new Blob([new XMLSerializer().serializeToString(kopie)], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `genogramm-${new Date().toISOString().slice(0, 10)}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ── Start ────────────────────────────────────────────────────────────────────
function start(): void {
  initLang();
  applyTranslations();
  document.title = `${t('geno.title')} · Systembrett`;
  if (!room) { status(t('pult.noRoom'), true); return; }
  const artWahl = document.getElementById('g-art') as HTMLSelectElement;
  for (const b of BEZIEHUNGSARTEN) {
    const o = document.createElement('option'); o.value = b.art; o.textContent = artText(b.art); artWahl.append(o);
  }
  artWahl.addEventListener('change', () => { if (verbinden) { verbinden = { art: artWahl.value, erster: null }; hinweis(artWahl.value === 'Eltern–Kind' ? t('geno.pickParent') : t('geno.pickFirst')); } });
  document.getElementById('g-person')!.textContent = '＋ ' + t('pult.addPerson');
  document.getElementById('g-person')!.addEventListener('click', katalogZeigen);
  document.getElementById('g-verbinden')!.addEventListener('click', verbindenUmschalten);
  document.getElementById('g-einpassen')!.addEventListener('click', einpassen);
  document.getElementById('g-svg')!.addEventListener('click', svgSpeichern);
  document.getElementById('g-png')!.addEventListener('click', pngSpeichern);
  document.getElementById('g-legende')!.addEventListener('click', legendeUmschalten);
  document.getElementById('g-pdf')!.addEventListener('click', () => { void pdfSpeichern(); });
  document.getElementById('g-undo')!.addEventListener('click', rueckgaengig);
  document.getElementById('g-redo')!.addEventListener('click', wiederholen);
  document.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); rueckgaengig(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); wiederholen(); }
  });
  pfeilDefs();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && verbinden) verbindenUmschalten(); });
  kanal?.addEventListener('message', (e: MessageEvent<PultNachricht>) => {
    if (e.data.type === 'select' && e.data.id !== ausgewaehlt) waehlen(e.data.id, false);
    if (e.data.type === 'sprache') location.reload();
  });
  zeichne(); panel();
  verbindenServer();
  setTimeout(einpassen, 800);
}

start();
