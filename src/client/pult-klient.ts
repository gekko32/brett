// brett/src/client/pult-klient.ts
// Klient im Steuerpult (Gerald 06.11.2026, BRETT-ABGLEICH-1A.md, Bausteine 1+2).
// - Wer ist Klient dieser Sitzung? Auswahl nur aus den Coaching-Klienten.
// - Coaching-Klienten aufnehmen (aus der Kundentabelle der Website).
// - Begleitung beendet → Erinnerung, Daten zu löschen oder später erinnern.
// - Alle Brett-Daten eines Klienten löschen.
// Die DOM-Helfer kommen aus steuerpult.ts (gleiche Optik).

import { t } from './i18n';

export interface KlientKurz { id: string; name: string; nummer?: string | null }
export interface KlientEintrag extends KlientKurz {
  begleitung_ende: string | null;
  erinnerung_ab: string | null;
  aufstellungen: number;
  sitzungen: number;
  erinnern: boolean;
}

type H = <K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, any>, ...kinder: Array<Node | string | null | undefined>) => HTMLElementTagNameMap[K];
export interface PultHelfer {
  h: H;
  knopf: (text: string, onclick: () => void, cls?: string) => HTMLButtonElement;
  block: (key: string, titel: string, ...inhalt: Node[]) => HTMLDetailsElement;
  neuZeichnen: () => void;
}

/** Zustand für das ganze Pult (überlebt das Neuzeichnen). */
export const klient = {
  room: '',
  /** Klient dieser Sitzung; null = ohne Klient (Übung, Vorführung). */
  aktuell: null as KlientKurz | null,
  geladen: false,
  liste: [] as KlientEintrag[],
  kandidaten: [] as KlientKurz[],
  meldung: '',
  /** Persönlicher Link der Sitzung (08.11.2026). */
  link: null as { url: string; ablauf: string } | null,
};

export function klientName(k: KlientKurz): string {
  return k.nummer ? `${k.name} (${k.nummer})` : k.name;
}

/** Datum YYYY-MM-DD → TT.MM.JJJJ */
export function datumDe(iso: string | null): string {
  if (!iso) return '';
  const [j, m, d] = iso.split('-');
  return `${d}.${m}.${j}`;
}

async function json(url: string, init?: RequestInit): Promise<any> {
  const r = await fetch(url, { cache: 'no-store', ...init });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
const sendeJson = (url: string, method: string, body?: unknown) => json(url, {
  method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});

export async function ladeKlienten(): Promise<void> {
  try { klient.liste = await json('/api/klienten'); } catch { klient.liste = []; }
}

/** Beim Start: Klient der Sitzung und Klientenliste holen. */
export async function starteKlient(room: string, neuZeichnen: () => void): Promise<void> {
  klient.room = room;
  try {
    const r = await json('/api/rooms/' + encodeURIComponent(room) + '/klient');
    klient.aktuell = r?.id ? { id: r.id, name: r.name } : null;
  } catch { klient.aktuell = null; }
  await ladeKlienten();
  if (klient.aktuell) {
    const e = klient.liste.find(k => k.id === klient.aktuell!.id);
    if (e) klient.aktuell = { id: e.id, name: e.name, nummer: e.nummer };
  }
  await ladeLink();
  klient.geladen = true;
  neuZeichnen();
}

async function ladeLink(): Promise<void> {
  try {
    const r = await json('/api/rooms/' + encodeURIComponent(klient.room) + '/klient-link');
    klient.link = r?.url ? { url: r.url, ablauf: r.ablauf } : null;
  } catch { klient.link = null; }
}

async function setzeSitzungsKlient(id: string | null, hf: PultHelfer): Promise<void> {
  try {
    await sendeJson('/api/rooms/' + encodeURIComponent(klient.room) + '/klient', 'POST', { customer_id: id });
    const e = id ? klient.liste.find(k => k.id === id) : null;
    klient.aktuell = e ? { id: e.id, name: e.name, nummer: e.nummer } : null;
    klient.meldung = '✓ ' + t('kl.set');
    await ladeLink();
  } catch { klient.meldung = '⚠ ' + t('kl.failed'); }
  hf.neuZeichnen();
}

/** Knopf mit zweitem Klick zur Bestätigung (wie „Vorlage laden“). */
function mitBestaetigung(hf: PultHelfer, text: string, frage: string, aktion: () => void): HTMLButtonElement {
  let bereit = false;
  const k = hf.knopf(text, () => {
    if (!bereit) { bereit = true; k.textContent = frage; k.classList.add('warn'); return; }
    bereit = false; k.textContent = text; k.classList.remove('warn');
    aktion();
  });
  return k;
}

async function loescheDaten(id: string, auchKlient: boolean, hf: PultHelfer): Promise<void> {
  try {
    const r = await fetch('/api/klienten/' + id + '/daten' + (auchKlient ? '?auch_klient=true' : ''), { method: 'DELETE' });
    if (r.status === 409) { klient.meldung = '⚠ ' + t('kl.deleteRunning'); hf.neuZeichnen(); return; }
    if (!r.ok) throw new Error();
    const z = await r.json();
    klient.meldung = '✓ ' + t('kl.deleted').replace('{a}', String(z.aufstellungen)).replace('{s}', String(z.sitzungen));
    if (auchKlient && klient.aktuell?.id === id) klient.aktuell = null;
  } catch { klient.meldung = '⚠ ' + t('kl.failed'); }
  await ladeKlienten();
  hf.neuZeichnen();
}

function erinnerungen(hf: PultHelfer): Node[] {
  const { h } = hf;
  return klient.liste.filter(k => k.erinnern).map(k => h('div', { class: 'hinweis-box' },
    h('div', {}, t('kl.reminder')
      .replace('{name}', klientName(k)).replace('{datum}', datumDe(k.begleitung_ende))
      .replace('{a}', String(k.aufstellungen)).replace('{s}', String(k.sitzungen))),
    h('div', { class: 'reihe', style: { marginTop: '4px' } },
      mitBestaetigung(hf, '🗑 ' + t('kl.deleteAll'), t('kl.deleteConfirm'), () => { void loescheDaten(k.id, false, hf); }),
      hf.knopf('⏰ ' + t('kl.later'), async () => {
        try { await sendeJson('/api/klienten/' + k.id, 'PATCH', { spaeter: true }); } catch { /* unten neu laden */ }
        await ladeKlienten(); hf.neuZeichnen();
      })),
  ));
}

let verwaltenOffen = false;

function linkBereich(hf: PultHelfer): Node[] {
  const { h, knopf } = hf;
  if (!klient.aktuell) return [];
  const pfad = '/api/rooms/' + encodeURIComponent(klient.room) + '/klient-link';
  const erzeugen = async () => {
    try { const r = await sendeJson(pfad, 'POST'); klient.link = { url: r.url, ablauf: r.ablauf }; klient.meldung = '✓ Link erstellt'; }
    catch { klient.meldung = '⚠ ' + t('kl.failed'); }
    hf.neuZeichnen();
  };
  if (!klient.link) {
    return [h('div', { class: 'reihe', style: { marginTop: '4px' } }, knopf('🔗 Link für den Klienten erstellen', () => { void erzeugen(); }))];
  }
  const feld = h('input', { type: 'text', readonly: true }) as HTMLInputElement;
  feld.value = klient.link.url;
  feld.addEventListener('focus', () => feld.select());
  const bis = new Date(klient.link.ablauf).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  const kopieren = knopf('Kopieren', async () => {
    try { await navigator.clipboard.writeText(feld.value); klient.meldung = '✓ Link kopiert'; }
    catch { feld.select(); klient.meldung = 'Bitte den markierten Link von Hand kopieren'; }
    hf.neuZeichnen();
  });
  return [
    h('label', { class: 'feld' }, 'Link für den Klienten (ohne Konto; kann Figuren bewegen, drehen und setzen)', feld),
    h('div', { class: 'klein' }, 'Gültig bis ' + bis + '. Wer den Link hat, sieht das Brett – nur an den Klienten geben.'),
    h('div', { class: 'reihe', style: { marginTop: '4px' } }, kopieren,
      mitBestaetigung(hf, '⛔ Link sperren', 'Wirklich sperren?', async () => {
        try { await json(pfad, { method: 'DELETE' }); klient.link = null; klient.meldung = '✓ Link gesperrt'; }
        catch { klient.meldung = '⚠ ' + t('kl.failed'); }
        hf.neuZeichnen();
      })),
  ];
}

export function klientBlock(hf: PultHelfer): HTMLElement {
  const { h, knopf } = hf;
  if (!klient.geladen) return hf.block('klient', t('kl.title'), h('div', { class: 'klein' }, t('pult.connecting')));

  // Klient dieser Sitzung
  const wahl = h('select', {},
    h('option', { value: '' }, t('kl.none')),
    ...klient.liste.map(k => h('option', { value: k.id, selected: k.id === klient.aktuell?.id }, klientName(k))));
  const uebernehmen = knopf(t('kl.apply'), () => { void setzeSitzungsKlient(wahl.value || null, hf); }, 'primaer');
  const aktuell = h('div', { class: 'klient-aktuell' },
    klient.aktuell ? '👤 ' + klientName(klient.aktuell) : t('kl.noneActive'));

  // Verwaltung (zugeklappt)
  const kandidat = h('select', {});
  const fuelleKandidaten = () => {
    kandidat.innerHTML = '';
    kandidat.append(h('option', { value: '' }, klient.kandidaten.length ? t('kl.candChoose') : t('kl.candNone')));
    for (const k of klient.kandidaten) kandidat.append(h('option', { value: k.id }, klientName(k)));
  };
  const ladeKandidaten = async () => {
    try { klient.kandidaten = await json('/api/klienten/kandidaten'); } catch { klient.kandidaten = []; }
    fuelleKandidaten();
  };
  fuelleKandidaten();
  const aufnehmen = knopf('＋ ' + t('kl.add'), async () => {
    const neuId = kandidat.value;
    if (!neuId) return;
    let ok = false;
    try { await sendeJson('/api/klienten', 'POST', { customer_id: neuId }); ok = true; klient.meldung = '✓ ' + t('kl.added'); }
    catch { klient.meldung = '⚠ ' + t('kl.failed'); }
    klient.kandidaten = klient.kandidaten.filter(k => k.id !== neuId);
    await ladeKlienten();
    // Gerald 06.11.2026: Hat die Sitzung noch keinen Klienten, gleich zuordnen (kein Umweg über „Übernehmen“).
    if (ok && !klient.aktuell) { await setzeSitzungsKlient(neuId, hf); klient.meldung = '✓ ' + t('kl.addedAssigned'); hf.neuZeichnen(); return; }
    hf.neuZeichnen();
  });

  const verwaltung: Node[] = [
    h('label', { class: 'feld' }, t('kl.addTitle'), h('div', { class: 'reihe', style: { flexWrap: 'nowrap' } }, kandidat, aufnehmen)),
    h('div', { class: 'klein' }, t('kl.addHint')),
  ];
  const e = klient.aktuell ? klient.liste.find(k => k.id === klient.aktuell!.id) : null;
  if (e) {
    const ende = h('input', { type: 'date', value: e.begleitung_ende || '' }) as HTMLInputElement;
    const endeSpeichern = knopf(t('kl.endSave'), async () => {
      try { await sendeJson('/api/klienten/' + e.id, 'PATCH', { begleitung_ende: ende.value || null }); klient.meldung = '✓ ' + t('kl.set'); }
      catch { klient.meldung = '⚠ ' + t('kl.failed'); }
      await ladeKlienten(); hf.neuZeichnen();
    });
    verwaltung.push(
      h('hr', { style: { border: '0', borderTop: '1px solid var(--line)', margin: '8px 0' } }),
      h('div', { class: 'klein' }, t('kl.stored').replace('{a}', String(e.aufstellungen)).replace('{s}', String(e.sitzungen))),
      h('label', { class: 'feld' }, t('kl.endTitle'), h('div', { class: 'reihe', style: { flexWrap: 'nowrap' } }, ende, endeSpeichern)),
      h('div', { class: 'reihe', style: { marginTop: '4px' } },
        mitBestaetigung(hf, '🗑 ' + t('kl.deleteAll'), t('kl.deleteConfirm'), () => { void loescheDaten(e.id, false, hf); }),
        mitBestaetigung(hf, '✕ ' + t('kl.remove'), t('kl.removeConfirm'), () => { void loescheDaten(e.id, true, hf); })),
      h('div', { class: 'klein' }, t('kl.deleteHint')),
    );
  }
  // Noch keine Coaching-Klienten → Aufnahme gleich offen (Gerald 06.11.2026).
  const leer = klient.liste.length === 0;
  const offenJetzt = verwaltenOffen || leer;
  const verwaltenBox = h('details', { class: 'unterblock', open: offenJetzt }, h('summary', {}, t('kl.manage')), ...verwaltung);
  verwaltenBox.addEventListener('toggle', () => {
    verwaltenOffen = verwaltenBox.open;
    if (verwaltenBox.open && !klient.kandidaten.length) void ladeKandidaten();
  });
  if (offenJetzt && !klient.kandidaten.length) void ladeKandidaten();
  // Direkt vom Klient-Feld zur Aufnahme springen.
  const zurAufnahme = knopf('＋ ' + t('kl.addShort'), () => {
    verwaltenOffen = true;
    verwaltenBox.open = true;
    kandidat.focus();
    verwaltenBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  const meldung = h('div', { class: 'klein' }, klient.meldung);
  return hf.block('klient', t('kl.title'),
    ...erinnerungen(hf),
    aktuell,
    ...(leer ? [h('div', { class: 'hinweis-box' }, t('kl.emptyHint'))] : []),
    h('label', { class: 'feld' }, t('kl.session'), h('div', { class: 'reihe', style: { flexWrap: 'nowrap' } }, wahl, uebernehmen)),
    h('div', { class: 'reihe', style: { marginTop: '2px' } }, zurAufnahme),
    ...linkBereich(hf),
    meldung,
    verwaltenBox,
  );
}

/** Abfrage für die Liste gespeicherter Aufstellungen: nur die des Klienten bzw. ohne Klient. */
export function aufstellungenUrl(): string {
  return klient.aktuell
    ? '/api/snapshots?customer_id=' + encodeURIComponent(klient.aktuell.id)
    : '/api/snapshots?gespeichert=true&ohne_klient=true';
}
