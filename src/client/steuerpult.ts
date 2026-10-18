// brett/src/client/steuerpult.ts
// Steuerpult als eigenes Fenster (Gerald 16.10.2026). Ohne 3D: eigene
// WebSocket-Verbindung zum selben Raum (wie ein weiterer Teilnehmer, ohne
// playerId → kein 409 „Reconnect“), eigener Figuren-Stand aus snapshot/add/
// update/move/delete. Auswahl wird per BroadcastChannel mit dem Spielfeld
// abgeglichen; der Herzschlag schaltet das Spielfeld in die Präsentationsansicht.
//
// Der Server schickt Änderungen nicht an den Absender zurück → alles, was das
// Pult sendet, wird hier sofort auch lokal angewendet.

import { t, initLang, applyTranslations } from './i18n';
import {
  PERSONEN_KATALOG, KOERPER_GROESSE, KOERPER_APPEARANCE, BLASS_OPACITY, EREIGNISSE,
  freierPlatz, eindeutigerName, findeRolle, jahreText, type PersonAngaben,
  BEZIEHUNGSARTEN, BOEDEN,
} from './person-catalog';
import type { PultNachricht, KameraAktion } from './steuerpult-sync';
import { baueNavKugel } from './ui/nav-kugel';
import { naechsteHaltung } from './presets-logik';
import { ebeneText, ebeneHinweis, rolleText, ereignisText, artText, bodenText } from './katalog-texte';

type Fig = {
  id: string; x: number; z: number; facingY?: number; label?: string; color?: string;
  scale?: number; role?: string; opacity?: number; preset?: string; person?: PersonAngaben;
  appearance?: any; hidden?: boolean;
};

const room = new URLSearchParams(location.search).get('room') || '';
const figuren = new Map<string, Fig>();
let ausgewaehlt: string | null = null;
let sessionCode: string | null = null;
let optik: { sky?: string; lightMood?: string; floor?: string; figuren?: string } = {};
type Linie = { id: string; fromId: string; toId: string; lineType: string; art?: string; label?: string };
const linien = new Map<string, Linie>();
let beziehungenSichtbar = (() => { try { return localStorage.getItem('pult_beziehungen') !== 'aus'; } catch { return true; } })();
let ws: WebSocket | null = null;
const kanal = room && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`brett-${room}`) : null;

// Aussehen (Bilder aus public/assets/figure-pack). Porträtfotos bewusst nicht im Pult.
const AUSDRUECKE = ['neutral', 'observing', 'present', 'curious', 'protective', 'yearning', 'resolved', 'relieved',
  'distant', 'withdrawn', 'blocked', 'defiant', 'fearful', 'overwhelmed', 'mourning'];
const ZUBEHOER: Record<'head' | 'upper' | 'feet', string[]> = {
  head: ['hair-short', 'hair-long', 'hair-bun', 'hair-braid', 'hair-curls', 'cap', 'spectacles', 'veil', 'crown', 'blindfold'],
  upper: ['coat', 'vest', 'tunic', 'apron', 'robe', 'shawl', 'scarf', 'swaddle', 'satchel', 'cane'],
  feet: ['shoes-dress', 'boots-work', 'sandals', 'barefoot'],
};
type Reiter = 'allgemein' | 'person' | 'aussehen' | 'beziehungen';
let reiter: Reiter = 'allgemein';

const FARBEN = ['#4f7cac', '#c0607a', '#8a7fa8', '#6fb38a', '#e0b04a', '#b05a3c', '#6b6f78', '#b8c0a8'];
const HALTUNGEN: Array<[string, string]> = [
  ['stand', 'pose.stand'], ['kneel', 'pose.kneel'], ['prone', 'pose.prone'],
  ['crawl', 'pose.crawl'], ['slump', 'pose.slump'], ['tpose', 'pose.tpose'], ['armsForward', 'pose.armsForward'],
];

// ── kleine DOM-Helfer ────────────────────────────────────────────────────────
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...kinder: Array<Node | string | null | undefined>): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kinder) if (c !== null && c !== undefined) e.append(c);
  return e;
}
const knopf = (text: string, onclick: () => void, cls = '') => h('button', { type: 'button', class: cls, onclick }, text);

const startHelligkeit = (() => { try { return parseFloat(localStorage.getItem('pult_helligkeit') || '1') || 1; } catch { return 1; } })();
let navKugel: ReturnType<typeof baueNavKugel> | null = null;
function holeNavKugel(): ReturnType<typeof baueNavKugel> {
  if (!navKugel) {
    navKugel = baueNavKugel({
      setze: (w) => kanal?.postMessage({ type: 'kamera-setzen', ...w } satisfies PultNachricht),
      helligkeit: (wert) => {
        try { localStorage.setItem('pult_helligkeit', String(wert)); } catch { /* egal */ }
        kanal?.postMessage({ type: 'helligkeit', wert } satisfies PultNachricht);
      },
      texte: { drehung: t('pult.navTurn'), neigung: t('pult.navTilt'), abstand: t('pult.navZoom'),
        helligkeit: t('pult.navBright'), hinweis: t('pult.navHint') },
      startHelligkeit,
    });
  }
  return navKugel;
}

// ── Verbindung ───────────────────────────────────────────────────────────────
function senden(m: any): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

async function verbinden(): Promise<void> {
  // Ohne gültige Anmeldung ignoriert der Server alle Leiter-Befehle still
  // (z. B. nach einem Server-Neustart). Dann deutlich melden und warten, bis
  // im Spielfeld neu angemeldet wurde.
  try {
    const me = await fetch('/auth/me', { cache: 'no-store' }).then(r => r.json());
    if (!me?.authenticated) {
      setStatus('⚠ ' + t('pult.notLoggedIn'));
      document.getElementById('pult-status')?.classList.add('warnung');
      setTimeout(verbinden, 3000);
      return;
    }
    document.getElementById('pult-status')?.classList.remove('warnung');
  } catch { setTimeout(verbinden, 3000); return; }
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${scheme}//${location.host}/sync?room=${encodeURIComponent(room)}`);
  setStatus(t('pult.connecting'));
  ws.addEventListener('open', () => { senden({ type: 'join', room }); setStatus(t('pult.connected')); });
  ws.addEventListener('close', () => { setStatus(t('pult.disconnected')); setTimeout(verbinden, 2000); });
  ws.addEventListener('message', (e) => { try { empfangen(JSON.parse(e.data)); } catch { /* ignorieren */ } });
}

function empfangen(m: any): void {
  switch (m.type) {
    case 'snapshot':
      figuren.clear();
      for (const f of m.figures || []) figuren.set(f.id, { ...f });
      if (m.sessionCode) sessionCode = m.sessionCode;
      if (m.optik) optik = { ...optik, ...m.optik };
      linien.clear();
      for (const l of m.lines || []) linien.set(l.id, { ...l });
      break;
    case 'line_created':
      if (m.line?.id) linien.set(m.line.id, { ...m.line });
      break;
    case 'line_deleted':
      linien.delete(m.lineId);
      break;
    case 'line_type_changed': {
      const l = linien.get(m.lineId);
      if (l) linien.set(m.lineId, { ...l, lineType: m.lineType });
      break;
    }
    case 'lobby_settings_change':
      if (m.optik) optik = { ...m.optik };
      break;
    case 'add':
      if (m.figure?.id) figuren.set(m.figure.id, { ...m.figure });
      break;
    case 'update': {
      const f = figuren.get(m.id);
      if (f) figuren.set(m.id, { ...f, ...(m.changes || {}) });
      break;
    }
    case 'move': {
      const f = figuren.get(m.id);
      if (f) figuren.set(m.id, { ...f, x: m.x, z: m.z, ...(typeof m.facingY === 'number' ? { facingY: m.facingY } : {}) });
      break;
    }
    case 'delete':
      figuren.delete(m.id);
      for (const [lid, l] of linien) if (l.fromId === m.id || l.toId === m.id) linien.delete(lid);
      if (ausgewaehlt === m.id) ausgewaehlt = null;
      break;
    case 'session_created':
      sessionCode = m.code ?? sessionCode;
      break;
    default:
      return; // andere Nachrichten ändern die Ansicht nicht
  }
  zeichnen();
}

// ── Aktionen (senden + sofort lokal anwenden) ────────────────────────────────
function aendern(id: string, changes: Partial<Fig>): void {
  const f = figuren.get(id);
  if (!f) return;
  figuren.set(id, { ...f, ...changes });
  senden({ type: 'update', id, changes });
}

function drehen(id: string, grad: number): void {
  const f = figuren.get(id);
  if (!f) return;
  const facingY = (f.facingY || 0) + (grad * Math.PI) / 180;
  figuren.set(id, { ...f, facingY });
  senden({ type: 'move', id, x: f.x, z: f.z, facingY });
}

function waehlen(id: string | null, melden = true): void {
  ausgewaehlt = id;
  if (melden) kanal?.postMessage({ type: 'select', id, von: 'pult' } satisfies PultNachricht);
  zeichnen(true);
}

function personHinzufuegen(ebeneKey: string, rolleKey: string): void {
  const ebene = PERSONEN_KATALOG.find(e => e.key === ebeneKey)!;
  const rolle = ebene.rollen.find(r => r.key === rolleKey)!;
  const alle = [...figuren.values()];
  const platz = freierPlatz(alle.map(f => ({ x: f.x, z: f.z })));
  const id = crypto.randomUUID();
  const fig: Fig = {
    id, x: platz.x, z: platz.z, facingY: 0, // zum Betrachter gewandt (vorn = +Z)
    label: eindeutigerName(rolleText(rolle), alle.map(f => f.label || '')),
    color: ebene.farbe, scale: KOERPER_GROESSE[rolle.koerper], role: rolle.key,
    appearance: { body: KOERPER_APPEARANCE[rolle.koerper] },
    ...(rolle.blass ? { opacity: BLASS_OPACITY } : {}),
  };
  figuren.set(id, fig);
  senden({ type: 'add', figure: fig });
  waehlen(id);
}

// ── Darstellung ──────────────────────────────────────────────────────────────
function setStatus(text: string): void {
  const s = document.getElementById('pult-status');
  if (s) s.textContent = text;
}

const offen: Record<string, boolean> = { sitzung: true, ansicht: false, personen: true, katalog: false, figur: true, angaben: false, beziehungen: true };
function block(key: string, titel: string, ...inhalt: Node[]): HTMLDetailsElement {
  const d = h('details', { class: 'block', open: offen[key] }, h('summary', {}, titel), ...inhalt);
  d.addEventListener('toggle', () => { offen[key] = d.open; });
  return d;
}

function sitzungBlock(): HTMLElement {
  const tpl = h('select', {}, h('option', { value: '' }, t('session.choose')));
  fetch(`/api/board-templates?brand=mentolder`).then(r => r.ok ? r.json() : []).then((list: any[]) => {
    const gruppen = new Map<string, any[]>();
    for (const v of list) { const k = v.category || '—'; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k)!.push(v); }
    for (const k of [...gruppen.keys()].sort((a, b) => a.localeCompare(b, 'de'))) {
      const og = h('optgroup', { label: k });
      for (const v of gruppen.get(k)!.sort((a, b) => a.name.localeCompare(b.name, 'de'))) og.append(h('option', { value: v.id }, v.name));
      tpl.append(og);
    }
  }).catch(() => { /* leer lassen */ });
  let bestaetigt = false;
  const laden = knopf(t('session.templateLoad'), () => {
    if (!tpl.value) return;
    if (!bestaetigt) { bestaetigt = true; laden.textContent = t('session.templateConfirm'); laden.classList.add('warn'); return; }
    senden({ type: 'admin_set_board_template', boardTemplateId: tpl.value });
    bestaetigt = false; laden.textContent = t('session.templateLoad'); laden.classList.remove('warn');
  });
  tpl.addEventListener('change', () => { bestaetigt = false; laden.textContent = t('session.templateLoad'); laden.classList.remove('warn'); });
  // ── Aufstellung speichern / laden (brett_snapshots) ──
  const jetzt = new Date();
  const vorschlag = t('pult.saveDefault') + ' ' + jetzt.toLocaleDateString('de-DE') + ' ' +
    jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const name = h('input', { type: 'text', maxlength: '200', value: vorschlag }) as HTMLInputElement;
  const meldung = h('div', { class: 'klein' });
  const speichern = knopf('💾 ' + t('pult.saveBtn'), async () => {
    const titel = name.value.trim();
    if (!titel) return;
    speichern.disabled = true;
    try {
      // Grundlage: gespeicherter Raumzustand (Zonen, Marken …), darüber der Live-Stand.
      const basis = await fetch('/api/state?room=' + encodeURIComponent(room)).then(r => r.ok ? r.json() : {}).catch(() => ({}));
      const state = { ...basis, figures: [...figuren.values()], lines: [...linien.values()], optik };
      const r = await fetch('/api/snapshots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: titel, room_token: room, state }),
      });
      meldung.textContent = r.ok ? '✓ ' + t('pult.saved') : '⚠ ' + t('pult.saveFailed');
      if (r.ok) ladeListe();
    } catch { meldung.textContent = '⚠ ' + t('pult.saveFailed'); }
    speichern.disabled = false;
  }, 'primaer');

  const liste = h('select', {}, h('option', { value: '' }, t('pult.savedChoose')));
  const ladeListe = () => {
    fetch('/api/snapshots?gespeichert=true').then(r => r.ok ? r.json() : []).then((rows: any[]) => {
      liste.innerHTML = '';
      liste.append(h('option', { value: '' }, rows.length ? t('pult.savedChoose') : t('pult.noSaved')));
      for (const row of rows) {
        const d = new Date(row.created_at);
        liste.append(h('option', { value: row.id }, row.name + ' (' + d.toLocaleDateString('de-DE') + ')'));
      }
    }).catch(() => { /* leer lassen */ });
  };
  ladeListe();
  let ladenBereit = false;
  const oeffnen = knopf(t('session.templateLoad'), () => {
    if (!liste.value) return;
    if (!ladenBereit) { ladenBereit = true; oeffnen.textContent = t('session.templateConfirm'); oeffnen.classList.add('warn'); return; }
    // admin_set_template lädt einen gespeicherten Stand (brett_snapshots) in den Raum.
    senden({ type: 'admin_set_template', templateId: liste.value });
    ladenBereit = false; oeffnen.textContent = t('session.templateLoad'); oeffnen.classList.remove('warn');
  });
  liste.addEventListener('change', () => { ladenBereit = false; oeffnen.textContent = t('session.templateLoad'); oeffnen.classList.remove('warn'); });

  return block('sitzung', t('session.button'),
    h('label', { class: 'feld' }, t('pult.saveTitle'), h('div', { class: 'reihe', style: { flexWrap: 'nowrap' } }, name, speichern)),
    meldung,
    h('label', { class: 'feld' }, t('pult.savedList'), h('div', { class: 'reihe', style: { flexWrap: 'nowrap' } }, liste, oeffnen)),
    h('hr', { style: { border: '0', borderTop: '1px solid var(--line)', margin: '8px 0' } }),
    h('label', { class: 'feld' }, t('session.template'), h('div', { class: 'reihe', style: { flexWrap: 'nowrap' } }, tpl, laden)),
    h('div', { class: 'klein' }, t('session.templateHint')),
  );
}

function ansichtBlock(): HTMLElement {
  const optWahl = (werte: Array<[string, string]>, aktuell: string | undefined, key: 'sky' | 'lightMood' | 'floor' | 'figuren', direkt = false) => {
    const s = h('select', {}, ...werte.map(([v, k]) => h('option', { value: v, selected: v === aktuell }, direkt ? k : t(k))));
    // optik_set ersetzt alle Werte → immer Boden, Himmel und Licht zusammen senden.
    s.addEventListener('change', () => { optik = { ...optik, [key]: s.value }; senden({ type: 'admin_set_optik', settings: { ...optik } }); });
    return s;
  };
  const kam = (zeichen: string, titel: string, aktion: KameraAktion) => h('button', { type: 'button', title: titel,
    onclick: () => kanal?.postMessage({ type: 'kamera', aktion } satisfies PultNachricht) }, zeichen);
  const bz = h('input', { type: 'checkbox', checked: beziehungenSichtbar }) as HTMLInputElement;
  bz.addEventListener('change', () => {
    beziehungenSichtbar = bz.checked;
    try { localStorage.setItem('pult_beziehungen', bz.checked ? 'an' : 'aus'); } catch { /* egal */ }
    kanal?.postMessage({ type: 'beziehungen', sichtbar: bz.checked } satisfies PultNachricht);
  });
  return block('ansicht', t('pult.view'),
    holeNavKugel().el,
    h('div', { class: 'klein' }, t('pult.cameraHint')),
    h('div', { class: 'reihe', style: { marginTop: '4px' } },
      kam('⌂ ' + t('pult.camReset'), t('pult.camReset'), 'zurueck'), kam('⬒ ' + t('pult.camTop'), t('pult.camTop'), 'draufsicht')),
    h('label', { class: 'feld', style: { flexDirection: 'row', alignItems: 'center', gap: '6px' } }, bz, t('pult.showRelations')),
    h('label', { class: 'feld' }, t('pult.figures'), optWahl([['klassisch', 'figures.klassisch'], ['verfeinert', 'figures.verfeinert'], ['mannequin', 'figures.mannequin']], optik.figuren || 'klassisch', 'figuren')),
    h('label', { class: 'feld' }, t('pult.floor'), optWahl(BOEDEN.map(([k, l]) => [k, bodenText(k, l)] as [string, string]), optik.floor, 'floor', true)),
    h('label', { class: 'feld' }, t('session.sky'), optWahl([['day', 'optik.day'], ['dusk', 'optik.dusk'], ['calm', 'optik.calm']], optik.sky, 'sky')),
    h('label', { class: 'feld' }, t('session.light'), optWahl([['neutral', 'optik.neutral'], ['warm', 'optik.warm'], ['cool', 'optik.cool']], optik.lightMood, 'lightMood')),
  );
}

function personenBlock(): HTMLElement {
  // Katalog zum Hinzufügen
  const katalog = h('div', { class: 'katalog' }, ...PERSONEN_KATALOG.map(eb => {
    const d = h('details', {}, h('summary', { style: { borderLeftColor: eb.farbe }, title: ebeneHinweis(eb) }, ebeneText(eb)),
      h('div', { class: 'raster2' }, ...eb.rollen.map(r =>
        h('button', { type: 'button', style: { borderLeftColor: eb.farbe, opacity: r.blass ? '0.75' : '1' },
          onclick: () => personHinzufuegen(eb.key, r.key) }, rolleText(r)))));
    return d;
  }));
  const katalogBlock = h('details', { open: offen.katalog }, h('summary', { style: { fontWeight: '600' } }, '＋ ' + t('pult.addPerson')), katalog);
  katalogBlock.addEventListener('toggle', () => { offen.katalog = katalogBlock.open; });

  // Liste nach Ebenen
  const liste = h('div');
  const nachEbene = new Map<string, Fig[]>();
  for (const f of figuren.values()) {
    const k = (f.role && findeRolle(f.role)?.ebene.key) || 'sonstige';
    if (!nachEbene.has(k)) nachEbene.set(k, []);
    nachEbene.get(k)!.push(f);
  }
  const reihenfolge = [...PERSONEN_KATALOG.map(e => e.key), 'sonstige'];
  for (const k of reihenfolge) {
    const figs = nachEbene.get(k);
    if (!figs?.length) continue;
    const eb = PERSONEN_KATALOG.find(e => e.key === k);
    liste.append(h('div', { class: 'ebene-titel', style: { borderLeftColor: eb?.farbe || 'transparent' } }, (eb ? ebeneText(eb) : t('pult.otherFigures'))));
    for (const f of figs.sort((a, b) => (a.label || '').localeCompare(b.label || '', 'de'))) {
      const drin = f.person?.inAufstellung !== false;
      const punkt = h('span', { class: 'punkt', title: drin ? t('pult.inSetup') : t('pult.notInSetup') }, drin ? '●' : '○');
      punkt.addEventListener('click', (e) => {
        e.stopPropagation();
        aendern(f.id, { person: { ...(f.person || {}), inAufstellung: !drin } });
        zeichnen();
      });
      liste.append(h('button', {
        type: 'button', class: 'person' + (f.id === ausgewaehlt ? ' ausgewaehlt' : ''),
        style: { borderLeftColor: f.color || 'transparent' }, onclick: () => waehlen(f.id),
      }, punkt, h('span', {}, f.label || '—'), h('span', { class: 'jahre' }, jahreText(f.person))));
    }
  }
  if (!figuren.size) liste.append(h('div', { class: 'leer' }, t('pult.empty')));
  return block('personen', `${t('pult.persons')} (${figuren.size})`, katalogBlock, liste);
}

function figurBlock(): HTMLElement | null {
  const f = ausgewaehlt ? figuren.get(ausgewaehlt) : null;
  if (!f) return null;
  const id = f.id;
  const name = h('input', { type: 'text', value: f.label || '', maxlength: '40' }) as HTMLInputElement;
  name.addEventListener('input', () => aendern(id, { label: name.value }));
  name.addEventListener('change', () => zeichnen());

  const blick = h('input', { type: 'range', min: '0', max: '360', step: '5',
    value: String((((f.facingY || 0) * 180 / Math.PI) % 360 + 360) % 360), style: { flex: '1' } }) as HTMLInputElement;
  blick.addEventListener('input', () => {
    const akt = figuren.get(id); if (!akt) return;
    const facingY = parseFloat(blick.value) * Math.PI / 180;
    figuren.set(id, { ...akt, facingY });
    senden({ type: 'move', id, x: akt.x, z: akt.z, facingY });
  });
  const drehReihe = h('div', { class: 'reihe', style: { alignItems: 'center', flexWrap: 'nowrap' } },
    knopf('⟲', () => { drehen(id, 45); zeichnen(true); }, 'dreh'), blick, knopf('⟳', () => { drehen(id, -45); zeichnen(true); }, 'dreh'));

  const haltung = h('div', { class: 'raster3' }, ...HALTUNGEN.map(([p, k]) =>
    knopf(t(k), () => { aendern(id, { preset: naechsteHaltung(f.preset, p) }); zeichnen(); }, f.preset === p ? 'aktiv' : '')));

  const farben = h('div', { class: 'farben' }, ...FARBEN.map(c =>
    h('button', { type: 'button', class: 'farbe' + (f.color === c ? ' aktiv' : ''), style: { background: c }, title: c,
      onclick: () => { aendern(id, { color: c }); zeichnen(); } })));

  // Größe: S/M/L als Schnellwahl, dazu stufenloser Regler (Gerald 18.10.2026).
  const skala = h('input', { type: 'range', min: '0.4', max: '1.8', step: '0.05', value: String(f.scale ?? 1), style: { flex: '1' } }) as HTMLInputElement;
  const skalaWert = h('span', { class: 'klein', style: { minWidth: '44px', textAlign: 'right' } }, Math.round((f.scale ?? 1) * 100) + ' %');
  skala.addEventListener('input', () => {
    const s = parseFloat(skala.value);
    skalaWert.textContent = Math.round(s * 100) + ' %';
    aendern(id, { scale: s });
  });
  skala.addEventListener('change', () => zeichnen(true));
  const groessen = h('div', {},
    h('div', { class: 'reihe' }, ...([['S', 0.7], ['M', 1.0], ['L', 1.3]] as Array<[string, number]>).map(([lbl, s]) =>
      knopf(lbl, () => { aendern(id, { scale: s }); zeichnen(); }, Math.abs((f.scale ?? 1) - s) < 0.01 ? 'aktiv' : ''))),
    h('div', { class: 'reihe', style: { alignItems: 'center', flexWrap: 'nowrap', marginTop: '4px' } }, skala, skalaWert));

  // Angaben zur Person
  const p: PersonAngaben = f.person || {};
  const setzeP = (neu: Partial<PersonAngaben>) => { const akt = figuren.get(id)?.person || {}; aendern(id, { person: { ...akt, ...neu } }); };
  const jahrFeld = (key: 'geburtsjahr' | 'todesjahr', ph: string) => {
    const i = h('input', { type: 'number', value: p[key] ?? '', placeholder: ph, min: '1800', max: '2100' }) as HTMLInputElement;
    i.addEventListener('change', () => { const n = parseInt(i.value, 10); setzeP({ [key]: Number.isFinite(n) ? n : undefined } as any); zeichnen(); });
    return i;
  };
  const ursache = h('input', { type: 'text', value: p.todesursache || '', maxlength: '120', placeholder: t('person.causeHint') }) as HTMLInputElement;
  ursache.addEventListener('change', () => setzeP({ todesursache: ursache.value.trim() || undefined }));
  const sonst = h('input', { type: 'text', value: p.sonstiges || '', maxlength: '300' }) as HTMLInputElement;
  sonst.addEventListener('change', () => setzeP({ sonstiges: sonst.value.trim() || undefined }));
  const aktivE = new Set(p.ereignisse || []);
  const chips = h('div', { class: 'chips' }, ...EREIGNISSE.map(e => knopf(ereignisText(e), () => {
    aktivE.has(e) ? aktivE.delete(e) : aktivE.add(e);
    setzeP({ ereignisse: [...aktivE] }); zeichnen();
  }, aktivE.has(e) ? 'aktiv' : '')));
  const inAuf = h('input', { type: 'checkbox', checked: p.inAufstellung !== false }) as HTMLInputElement;
  inAuf.addEventListener('change', () => { setzeP({ inAufstellung: inAuf.checked }); zeichnen(); });
  const angaben = h('div', {},
    h('label', { class: 'feld', style: { flexDirection: 'row', alignItems: 'center', gap: '6px' } }, inAuf, t('pult.inSetup')),
    h('div', { class: 'raster2' },
      h('label', { class: 'feld' }, t('person.born'), jahrFeld('geburtsjahr', 'z. B. 1952')),
      h('label', { class: 'feld' }, t('person.died'), jahrFeld('todesjahr', '—'))),
    h('label', { class: 'feld' }, t('person.cause'), ursache),
    h('div', { class: 'klein' }, t('person.events')), chips,
    h('label', { class: 'feld' }, t('person.other'), sonst));

  // Beziehungen dieser Person
  const andere = [...figuren.values()].filter(x => x.id !== id).sort((a, b) => (a.label || '').localeCompare(b.label || '', 'de'));
  const meine = [...linien.values()].filter(l => l.fromId === id || l.toId === id);
  const nameVon = (fid: string) => figuren.get(fid)?.label || '—';
  const liste = h('div', {}, ...meine.map(l => h('div', { class: 'reihe', style: { alignItems: 'center', margin: '2px 0', flexWrap: 'nowrap' } },
    h('span', { style: { flex: '1' } }, (l.label || artText(l.art) || l.lineType) + ' → ' + nameVon(l.fromId === id ? l.toId : l.fromId)),
    knopf('✕', () => { linien.delete(l.id); senden({ type: 'line_delete', lineId: l.id }); zeichnen(true); }))));
  if (!meine.length) liste.append(h('div', { class: 'leer' }, t('pult.noRelations')));
  const zu = h('select', {}, h('option', { value: '' }, t('pult.relTo')), ...andere.map(x => h('option', { value: x.id }, x.label || '—')));
  const art = h('select', {}, ...BEZIEHUNGSARTEN.map(b => h('option', { value: b.art }, artText(b.art))));
  const bez = h('input', { type: 'text', maxlength: '60', placeholder: t('pult.relLabel') }) as HTMLInputElement;
  const neu = knopf('＋ ' + t('pult.relAdd'), () => {
    if (!zu.value) return;
    const b = BEZIEHUNGSARTEN.find(x => x.art === art.value)!;
    senden({ type: 'line_create', fromId: id, toId: zu.value, lineType: b.linie, art: b.art, ...(bez.value.trim() ? { label: bez.value.trim() } : {}) });
  }, 'primaer');
  const beziehungen = h('div', {},
    liste,
    h('div', { class: 'raster2', style: { marginTop: '6px' } }, zu, art),
    h('div', { class: 'reihe', style: { marginTop: '4px', flexWrap: 'nowrap' } }, bez, neu));

  let loeschBereit = false;
  const loeschen = knopf('🗑 ' + t('pult.delete'), () => {
    if (!loeschBereit) { loeschBereit = true; loeschen.textContent = t('pult.deleteConfirm'); loeschen.classList.add('warn'); return; }
    figuren.delete(id);
    senden({ type: 'delete', id });
    waehlen(null);
  });

  // Aussehen: Gesichtsausdruck + Zubehör (Server führt appearance zusammen)
  const app = f.appearance || {};
  const setzeA = (neu: { face?: string | null; accessories?: Record<string, string | null> }) => {
    const akt = figuren.get(id)?.appearance || {};
    aendern(id, { appearance: { ...akt, ...neu, accessories: { ...(akt.accessories || {}), ...(neu.accessories || {}) } } });
    zeichnen(true);
  };
  const bildKnopf = (src: string | null, text: string, aktiv: boolean, aktion: () => void) =>
    h('button', { type: 'button', class: 'bild' + (aktiv ? ' aktiv' : ''), title: text, onclick: aktion },
      src ? h('img', { src, alt: '', loading: 'lazy' }) : h('span', { class: 'ohne' }, '∅'), h('span', {}, text));
  const gesichter = h('div', { class: 'bilder' },
    bildKnopf(null, t('looks.none'), !app.face, () => setzeA({ face: null })),
    ...AUSDRUECKE.map(x => bildKnopf('/assets/figure-pack/faces/' + x + '.png', t('face.' + x), app.face === x, () => setzeA({ face: x }))));
  const zubehoer = (slot: 'head' | 'upper' | 'feet') => {
    const s = h('select', {}, h('option', { value: '' }, t('looks.none')),
      ...ZUBEHOER[slot].map(x => h('option', { value: x, selected: app.accessories?.[slot] === x }, t('acc.' + x))));
    s.addEventListener('change', () => setzeA({ accessories: { [slot]: s.value || null } }));
    return h('label', { class: 'feld' }, t('looks.' + slot), s);
  };
  const aussehen = h('div', {},
    h('div', { class: 'klein' }, t('looks.face')), gesichter,
    zubehoer('head'), zubehoer('upper'), zubehoer('feet'));

  const allgemein = h('div', {},
    h('label', { class: 'feld' }, t('pult.name'), name),
    h('label', { class: 'feld' }, t('pult.rotate'), drehReihe),
    h('label', { class: 'feld' }, t('pose.label'), haltung),
    h('label', { class: 'feld' }, t('pult.color'), farben),
    h('label', { class: 'feld' }, t('pult.size'), groessen),
    h('div', { class: 'reihe', style: { marginTop: '8px' } }, loeschen));

  // Reiter (Bedienkonzept Schritt 2)
  const inhalte: Record<Reiter, HTMLElement> = { allgemein, person: angaben, aussehen, beziehungen };
  const titel: Record<Reiter, string> = {
    allgemein: t('tab.general'), person: t('tab.person'), aussehen: t('tab.looks'),
    beziehungen: t('pult.relations') + (meine.length ? ' (' + meine.length + ')' : ''),
  };
  const leiste = h('div', { class: 'reiter', role: 'tablist' }, ...(Object.keys(inhalte) as Reiter[]).map(k =>
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === reiter), class: k === reiter ? 'aktiv' : '',
      onclick: () => { reiter = k; zeichnen(true); } }, titel[k])));
  return block('figur', f.label || t('pult.figure'), leiste, inhalte[reiter]);
}

/** Neu zeichnen. Während im Figurenblock getippt wird, diesen nicht ersetzen. */
function zeichnen(erzwingen = false): void {
  const main = document.getElementById('pult-main')!;
  const code = document.getElementById('pult-code');
  if (code) code.textContent = sessionCode || '—';
  const fokusImFormular = !erzwingen && document.activeElement && main.contains(document.activeElement)
    && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (fokusImFormular) {
    // Nur die Personenliste erneuern, Formular stehen lassen.
    const alt = main.querySelector('[data-block=personen]');
    const neu = personenBlock(); neu.dataset.block = 'personen';
    if (alt) alt.replaceWith(neu);
    return;
  }
  main.innerHTML = '';
  const s = sitzungBlock(); s.dataset.block = 'sitzung';
  const a = ansichtBlock(); a.dataset.block = 'ansicht';
  const p = personenBlock(); p.dataset.block = 'personen';
  const f = figurBlock();
  main.append(s, a, p);
  if (f) { f.dataset.block = 'figur'; main.append(f); }
  else main.append(h('div', { class: 'klein', style: { padding: '0 4px' } }, t('pult.selectHint')));
}

// ── Start ────────────────────────────────────────────────────────────────────
/** Genogramm-Fenster öffnen (links neben dem Pult, über dem Spielfeld). */
function oeffneGenogramm(): void {
  const sc = screen as any;
  const breite = Math.min(1100, screen.availWidth - 480);
  const w = window.open('/genogramm.html?room=' + encodeURIComponent(room), 'brett-genogramm-' + room,
    'popup,width=' + breite + ',height=' + Math.round(screen.availHeight * 0.7) +
    ',left=' + ((sc.availLeft ?? 0) + screen.availWidth - 460 - breite) + ',top=' + (sc.availTop ?? 0));
  w?.focus();
}

/** Pult-Fenster an den rechten Bildschirmrand (volle Höhe). Nur als Popup möglich. */
function anDenRand(): void {
  const sc = screen as any;
  const breite = 460;
  try {
    window.resizeTo(breite, screen.availHeight);
    window.moveTo((sc.availLeft ?? 0) + screen.availWidth - breite, sc.availTop ?? 0);
  } catch { /* nicht erlaubt (z. B. Tab statt Popup) */ }
}

function start(): void {
  initLang();
  const istPopup = !!window.opener && window.top === window;
  if (istPopup) anDenRand();
  const kopf = document.querySelector('header');
  // Drittes Fenster: Genogramm (gleiche Personen und Beziehungen, als Stammbaum).
  kopf?.querySelector('.zeile')?.append(h('button', { type: 'button', onclick: oeffneGenogramm }, '🧬 ' + t('geno.title')));
  if (kopf && window.top === window) {
    // Tipp: Spielfeld links daneben legen, dann verschwindet nichts dahinter.
    kopf.append(h('div', { class: 'tipp' }, t('pult.snapHint'), ' ',
      h('button', { type: 'button', class: 'mini', onclick: anDenRand }, t('pult.toEdge'))));
  }
  applyTranslations();
  document.title = `${t('pult.title')} · Systembrett`;
  if (!room) { setStatus(t('pult.noRoom')); return; }
  document.getElementById('pult-link')?.addEventListener('click', (e) => {
    if (!sessionCode) return;
    try { navigator.clipboard?.writeText(`${location.origin}/api/join?code=${encodeURIComponent(sessionCode)}`); } catch { /* noop */ }
    (e.target as HTMLElement).textContent = t('session.copied');
    setTimeout(() => { (e.target as HTMLElement).textContent = t('session.copyLink'); }, 1500);
  });
  if (kanal) {
    kanal.onmessage = (e: MessageEvent<PultNachricht>) => {
      if (e.data.type === 'select' && e.data.von === 'brett') waehlen(e.data.id, false);
      if (e.data.type === 'kamera-stand') holeNavKugel().aktualisiere(e.data);
    };
    // Herzschlag: Spielfeld zeigt nur das Brett, solange das Pult offen ist.
    const ping = () => kanal.postMessage({ type: 'ping' } satisfies PultNachricht);
    ping(); setInterval(ping, 2000);
    kanal.postMessage({ type: 'beziehungen', sichtbar: beziehungenSichtbar } satisfies PultNachricht);
    if (startHelligkeit !== 1) kanal.postMessage({ type: 'helligkeit', wert: startHelligkeit } satisfies PultNachricht);
    window.addEventListener('pagehide', () => kanal.postMessage({ type: 'bye' } satisfies PultNachricht));
  }
  zeichnen(true);
  verbinden();
}

start();
