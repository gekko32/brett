// brett/src/client/pult-regiebuch.ts
// Regiebuch im Steuerpult (Gerald 06.11.2026, Baustein 5).
// - Bibliothek: fünf Originale (schreibgeschützt) + eigene Fassungen (Kopien).
// - Ablauf: Schritt für Schritt, jeder Schritt überspringbar, jederzeit
//   beenden und frei weiterarbeiten. Das Brett bleibt voll bedienbar.
// - Schalter „Frage auf dem Brett zeigen“: aus = nur der Coach sieht die
//   Fragen im Pult; an = eine gewählte Frage erscheint auf dem Brett.
// - Speicherpunkte legen den Stand als Aufstellung des Klienten ab.
// - Sitzungsnotiz (Erkenntnis, offene Frage) bleibt nur im Pult und wird mit
//   der nächsten gespeicherten Aufstellung abgelegt – nicht im Browser-Speicher.
// Texte zunächst nur Deutsch (Gerald 06.11.2026).

import {
  type Regiebuch, type Lauf, type Schritt,
  starte, gehe, istLetzter, brettText, speicherName, fragenAusText, laufAusSpeicher,
} from './regiebuch-ablauf';
import type { PultHelfer } from './pult-klient';

export interface RegiebuchDeps {
  room: string;
  senden: (m: any) => void;
  /** Aktuellen Stand als Aufstellung speichern; true = gespeichert. */
  speichereStand: (name: string) => Promise<boolean>;
}

export const rb = {
  liste: [] as Regiebuch[],
  geladen: false,
  gewaehlt: '' as string,
  lauf: null as Lauf | null,
  /** Erkenntnis / offene Frage dieser Sitzung (nur im Arbeitsspeicher). */
  notiz: '',
  meldung: '',
  /** Voreinstellung des Schalters beim Start. */
  frageStart: false,
  /** Bearbeiten einer eigenen Fassung: Arbeitskopie. */
  entwurf: null as Regiebuch | null,
};

const speicherKey = (room: string) => 'pult_regiebuch_' + room;

function laufSichern(room: string): void {
  try {
    if (rb.lauf) localStorage.setItem(speicherKey(room), JSON.stringify(rb.lauf));
    else localStorage.removeItem(speicherKey(room));
  } catch { /* privat: egal */ }
}

const aktuell = (): Regiebuch | null => rb.liste.find(r => r.id === (rb.lauf?.id ?? rb.gewaehlt)) ?? null;

async function json(url: string, init?: RequestInit): Promise<any> {
  const r = await fetch(url, { cache: 'no-store', ...init });
  if (!r.ok) { let e = String(r.status); try { e = (await r.json()).error || e; } catch { /* */ } throw new Error(e); }
  return r.json();
}

export async function ladeRegiebuecher(room: string, neuZeichnen: () => void): Promise<void> {
  try { rb.liste = await json('/api/regiebuecher'); } catch { rb.liste = []; }
  rb.geladen = true;
  if (!rb.gewaehlt && rb.liste[0]) rb.gewaehlt = rb.liste[0].id;
  // Lauf nach Neuladen des Pults fortsetzen.
  try {
    const roh = JSON.parse(localStorage.getItem(speicherKey(room)) || 'null');
    const buch = rb.liste.find(r => r.id === roh?.id) ?? null;
    rb.lauf = laufAusSpeicher(roh, buch);
    if (rb.lauf) rb.gewaehlt = rb.lauf.id;
  } catch { rb.lauf = null; }
  neuZeichnen();
}

/** Brett mit dem Lauf abgleichen (Frage zeigen oder ausblenden). */
function brettAbgleichen(d: RegiebuchDeps): void {
  d.senden({ type: 'admin_regiebuch_frage', text: brettText(rb.lauf, aktuell()) });
}

function setzeLauf(l: Lauf | null, d: RegiebuchDeps, hf: PultHelfer): void {
  rb.lauf = l;
  laufSichern(d.room);
  brettAbgleichen(d);
  hf.neuZeichnen();
}

const trenner = (hf: PultHelfer) => hf.h('hr', { style: { border: '0', borderTop: '1px solid var(--line)', margin: '8px 0' } });

function mitBestaetigung(hf: PultHelfer, text: string, frage: string, aktion: () => void): HTMLButtonElement {
  let bereit = false;
  const k = hf.knopf(text, () => {
    if (!bereit) { bereit = true; k.textContent = frage; k.classList.add('warn'); return; }
    bereit = false; k.textContent = text; k.classList.remove('warn');
    aktion();
  });
  return k;
}

// ── Ansicht: Auswahl ────────────────────────────────────────────────────────
function auswahlAnsicht(hf: PultHelfer, d: RegiebuchDeps): Node[] {
  const { h, knopf } = hf;
  const originale = rb.liste.filter(r => r.is_system);
  const eigene = rb.liste.filter(r => !r.is_system);
  const wahl = h('select', {},
    h('optgroup', { label: 'Bibliothek' }, ...originale.map(r => h('option', { value: r.id, selected: r.id === rb.gewaehlt }, r.titel))),
    ...(eigene.length ? [h('optgroup', { label: 'Eigene Fassungen' },
      ...eigene.map(r => h('option', { value: r.id, selected: r.id === rb.gewaehlt }, r.titel)))] : []));
  wahl.addEventListener('change', () => { rb.gewaehlt = wahl.value; rb.meldung = ''; hf.neuZeichnen(); });

  const b = aktuell();
  const info: Node[] = [];
  if (b) {
    const zeile = (titel: string, text: string) => text ? h('div', { class: 'klein', style: { marginTop: '3px' } }, h('b', {}, titel + ': '), text) : null;
    info.push(
      h('div', { style: { margin: '6px 0 2px' } }, b.kurz),
      h('details', { class: 'unterblock' }, h('summary', {}, `Mehr zum Regiebuch (${b.schritte.length} Schritte)`),
        ...[zeile('Anliegen', b.anliegen), zeile('Ziel', b.ziel), zeile('Grenzen', b.grenzen),
          zeile('Hinweise', b.hinweise), zeile('Herkunft', b.herkunft)].filter(Boolean) as Node[],
        h('ol', { style: { margin: '6px 0 0 18px', padding: '0' } }, ...b.schritte.map(s => h('li', {}, s.titel + (s.speicherpunkt ? ' 💾' : ''))))),
    );
  }
  const frageAn = h('input', { type: 'checkbox', checked: rb.frageStart }) as HTMLInputElement;
  frageAn.addEventListener('change', () => { rb.frageStart = frageAn.checked; });
  const starten = knopf('▶ Starten', () => {
    if (!b) return;
    rb.meldung = '';
    setzeLauf(starte(b, rb.frageStart), d, hf);
  }, 'primaer');
  const kopie = knopf('⧉ Eigene Fassung', async () => {
    if (!b) return;
    try {
      const neu = await json('/api/regiebuecher/' + encodeURIComponent(b.id) + '/kopie', { method: 'POST' });
      rb.liste.push(neu); rb.gewaehlt = neu.id; rb.meldung = '✓ Eigene Fassung angelegt. Mit „Bearbeiten“ anpassen.';
    } catch (e: any) { rb.meldung = '⚠ ' + e.message; }
    hf.neuZeichnen();
  });
  const knoepfe: Node[] = [starten, kopie];
  if (b && !b.is_system) {
    knoepfe.push(
      knopf('✎ Bearbeiten', () => { rb.entwurf = JSON.parse(JSON.stringify(b)); hf.neuZeichnen(); }),
      mitBestaetigung(hf, '🗑 Löschen', 'Wirklich löschen?', async () => {
        try {
          await json('/api/regiebuecher/' + encodeURIComponent(b.id), { method: 'DELETE' });
          rb.liste = rb.liste.filter(r => r.id !== b.id); rb.gewaehlt = rb.liste[0]?.id ?? ''; rb.meldung = '✓ Gelöscht';
        } catch (e: any) { rb.meldung = '⚠ ' + e.message; }
        hf.neuZeichnen();
      }));
  }
  return [
    h('label', { class: 'feld' }, 'Regiebuch', wahl),
    ...info,
    h('label', { class: 'feld', style: { flexDirection: 'row', alignItems: 'center', gap: '6px' } }, frageAn, 'Fragen auf dem Brett zeigen (später umschaltbar)'),
    h('div', { class: 'reihe' }, ...knoepfe),
    h('div', { class: 'klein', style: { marginTop: '4px' } }, 'Ein Regiebuch ist ein Angebot: jeder Schritt lässt sich überspringen, das Brett bleibt frei bedienbar.'),
  ];
}

// ── Ansicht: laufender Ablauf ───────────────────────────────────────────────
function laufAnsicht(hf: PultHelfer, d: RegiebuchDeps, b: Regiebuch, l: Lauf): Node[] {
  const { h, knopf } = hf;
  const s: Schritt | undefined = b.schritte[l.index];
  const schalter = h('input', { type: 'checkbox', checked: l.frageAn }) as HTMLInputElement;
  schalter.addEventListener('change', () => setzeLauf({ ...l, frageAn: schalter.checked }, d, hf));

  const fragen = (s?.fragen ?? []).map((f, i) => {
    const sichtbar = l.frageAn && l.frageIndex === i;
    return h('div', { class: 'frage' + (sichtbar ? ' aktiv' : '') },
      h('span', {}, f),
      l.frageAn
        ? knopf(sichtbar ? 'ausblenden' : 'zeigen', () => setzeLauf({ ...l, frageIndex: sichtbar ? null : i }, d, hf), 'mini')
        : null);
  });

  const speicherpunkt = s?.speicherpunkt
    ? knopf('💾 Stand speichern', async () => {
        const ok = await d.speichereStand(speicherName(b, l));
        rb.meldung = ok ? '✓ Gespeichert: ' + speicherName(b, l) : '⚠ Speichern hat nicht geklappt';
        hf.neuZeichnen();
      })
    : null;

  const notiz = h('textarea', { rows: '3', placeholder: 'Erkenntnis oder offene Frage – wird mit der nächsten gespeicherten Aufstellung abgelegt' }) as HTMLTextAreaElement;
  notiz.value = rb.notiz;
  notiz.addEventListener('input', () => { rb.notiz = notiz.value; });

  return [
    h('div', { class: 'klient-aktuell' }, '▶ ' + b.titel),
    h('div', { style: { fontWeight: '600', margin: '4px 0' } }, `Schritt ${l.index + 1} von ${b.schritte.length}: ${s?.titel ?? ''}`),
    s?.anleitung ? h('div', { class: 'klein' }, s.anleitung) : null,
    h('label', { class: 'feld', style: { flexDirection: 'row', alignItems: 'center', gap: '6px' } }, schalter, 'Frage auf dem Brett zeigen'),
    ...(fragen.length ? [h('div', { class: 'klein' }, 'Mögliche Fragen (Angebote):'), ...fragen] : []),
    speicherpunkt ? h('div', { class: 'reihe', style: { marginTop: '4px' } }, speicherpunkt) : null,
    h('div', { class: 'reihe', style: { marginTop: '6px' } },
      knopf('← Zurück', () => setzeLauf(gehe(l, b, l.index - 1), d, hf)),
      istLetzter(l, b)
        ? knopf('✓ Abschließen', () => { rb.meldung = '✓ Regiebuch abgeschlossen – frei weiterarbeiten'; setzeLauf(null, d, hf); }, 'primaer')
        : knopf('Weiter →', () => setzeLauf(gehe(l, b, l.index + 1), d, hf), 'primaer'),
    ),
    h('div', { class: 'reihe', style: { marginTop: '4px' } },
      knopf('■ Beenden, frei weiterarbeiten', () => { rb.meldung = 'Regiebuch beendet – das Brett bleibt, wie es ist.'; setzeLauf(null, d, hf); })),
    trenner(hf),
    h('label', { class: 'feld' }, 'Notiz zur Sitzung', notiz),
  ].filter(Boolean) as Node[];
}

// ── Ansicht: eigene Fassung bearbeiten ──────────────────────────────────────
function editorAnsicht(hf: PultHelfer, e: Regiebuch): Node[] {
  const { h, knopf } = hf;
  const feld = (titel: string, wert: string, setze: (v: string) => void, mehrzeilig = false) => {
    const el = (mehrzeilig ? h('textarea', { rows: '2' }) : h('input', { type: 'text' })) as HTMLInputElement | HTMLTextAreaElement;
    el.value = wert;
    el.addEventListener('input', () => setze(el.value));
    return h('label', { class: 'feld' }, titel, el);
  };
  const schritte = e.schritte.map((s, i) => h('fieldset', { class: 'schritt' },
    h('legend', {}, `Schritt ${i + 1}`),
    feld('Titel', s.titel, v => { s.titel = v; }),
    feld('Anleitung für dich', s.anleitung, v => { s.anleitung = v; }, true),
    feld('Fragen (eine je Zeile)', s.fragen.join('\n'), v => { s.fragen = fragenAusText(v); }, true),
    (() => {
      const c = h('input', { type: 'checkbox', checked: s.speicherpunkt }) as HTMLInputElement;
      c.addEventListener('change', () => { s.speicherpunkt = c.checked; });
      return h('label', { class: 'feld', style: { flexDirection: 'row', alignItems: 'center', gap: '6px' } }, c, 'Speicherpunkt');
    })(),
    h('div', { class: 'reihe' },
      i > 0 ? knopf('↑', () => { [e.schritte[i - 1], e.schritte[i]] = [e.schritte[i], e.schritte[i - 1]]; hf.neuZeichnen(); }, 'mini') : null,
      e.schritte.length > 1 ? knopf('✕ Schritt entfernen', () => { e.schritte.splice(i, 1); hf.neuZeichnen(); }, 'mini') : null),
  ));
  const speichern = knopf('💾 Fassung speichern', async () => {
    try {
      const neu = await json('/api/regiebuecher/' + encodeURIComponent(e.id), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) });
      rb.liste = rb.liste.map(r => r.id === neu.id ? neu : r);
      rb.entwurf = null; rb.meldung = '✓ Fassung gespeichert';
    } catch (err: any) { rb.meldung = '⚠ ' + err.message; }
    hf.neuZeichnen();
  }, 'primaer');
  return [
    h('div', { class: 'klient-aktuell' }, '✎ Eigene Fassung bearbeiten'),
    feld('Titel', e.titel, v => { e.titel = v; }),
    feld('Kurzbeschreibung', e.kurz, v => { e.kurz = v; }, true),
    feld('Ziel', e.ziel, v => { e.ziel = v; }, true),
    feld('Grenzen', e.grenzen, v => { e.grenzen = v; }, true),
    feld('Hinweise für dich', e.hinweise, v => { e.hinweise = v; }, true),
    ...schritte,
    h('div', { class: 'reihe', style: { marginTop: '6px' } },
      knopf('＋ Schritt', () => { e.schritte.push({ titel: 'Neuer Schritt', anleitung: '', fragen: [], speicherpunkt: false }); hf.neuZeichnen(); }),
      speichern,
      knopf('Abbrechen', () => { rb.entwurf = null; rb.meldung = ''; hf.neuZeichnen(); })),
  ];
}

export function regiebuchBlock(hf: PultHelfer, d: RegiebuchDeps): HTMLElement {
  const { h } = hf;
  let inhalt: Node[];
  if (!rb.geladen) inhalt = [h('div', { class: 'klein' }, '…')];
  else if (!rb.liste.length) inhalt = [h('div', { class: 'klein' }, 'Keine Regiebücher gefunden (angemeldet?).')];
  else if (rb.entwurf) inhalt = editorAnsicht(hf, rb.entwurf);
  else {
    const b = aktuell();
    inhalt = rb.lauf && b ? laufAnsicht(hf, d, b, rb.lauf) : auswahlAnsicht(hf, d);
  }
  return hf.block('regiebuch', 'Regiebuch', ...inhalt, h('div', { class: 'klein' }, rb.meldung));
}
