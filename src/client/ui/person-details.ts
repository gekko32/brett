// brett/src/client/ui/person-details.ts
// „Angaben zur Person“ im Feld „Figur bearbeiten“ (Personenkatalog, Schritt 2):
// in der Aufstellung, Geburts-/Todesjahr, Todesursache, Ereignisse (Katalog +
// Sonstiges). Gespeichert als `person` an der Figur (update), lebt nur in der
// jeweiligen Aufstellung.

import { STATE, SELECTION_DIM } from '../state';
import { sendUpdate } from '../ws-client';
import { applyFigureOpacity } from '../mannequin';
import { EREIGNISSE, type PersonAngaben } from '../person-catalog';
import { t } from '../i18n';
import { ereignisText } from '../katalog-texte';

let root: HTMLElement | null = null;
let aktuelleId: string | null = null;
let sendeTimer: ReturnType<typeof setTimeout> | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
}

function jahr(v: string): number | undefined {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 1000 && n < 2200 ? n : undefined;
}

function leseFormular(): PersonAngaben {
  const q = (id: string) => root!.querySelector<HTMLInputElement>('#' + id)!;
  const ereignisse = [...root!.querySelectorAll<HTMLButtonElement>('.person-ereignis.aktiv')].map(b => b.dataset.wert!);
  const p: PersonAngaben = {
    inAufstellung: q('person-in-aufstellung').checked,
    ereignisse,
  };
  const g = jahr(q('person-geburtsjahr').value); if (g) p.geburtsjahr = g;
  const t = jahr(q('person-todesjahr').value); if (t) p.todesjahr = t;
  const u = q('person-todesursache').value.trim(); if (u) p.todesursache = u;
  const s = q('person-sonstiges').value.trim(); if (s) p.sonstiges = s;
  return p;
}

/** Änderungen gebündelt senden (Tippen in Jahresfeldern nicht bei jedem Zeichen). */
function aenderung(sofort = false): void {
  const fig = STATE.figures.find(f => f.id === aktuelleId);
  if (!fig) return;
  const person = leseFormular();
  (fig as any).person = person;
  applyFigureOpacity(fig, STATE.selectedId === fig.id ? 1.0 : SELECTION_DIM);
  if (sendeTimer) clearTimeout(sendeTimer);
  const senden = () => sendUpdate(fig, { person });
  if (sofort) senden(); else sendeTimer = setTimeout(senden, 400);
}

export function initPersonDetails(): void {
  root = document.getElementById('fig-person-details');
  if (!root) return;
  root.innerHTML = '';
  const det = el('details', { open: '' });
  det.appendChild(el('summary', {}, t('person.title')));

  const inAuf = el('label', { class: 'person-zeile person-check' });
  const cb = el('input', { type: 'checkbox', id: 'person-in-aufstellung' });
  cb.addEventListener('change', () => aenderung(true));
  inAuf.append(cb, document.createTextNode(' ' + t('pult.inSetup')));
  det.appendChild(inAuf);

  const jahre = el('div', { class: 'person-zeile person-jahre' });
  for (const [id, lbl, ph] of [['person-geburtsjahr', t('person.born'), '1952'], ['person-todesjahr', t('person.died'), '—']]) {
    const w = el('label', {}, lbl);
    const inp = el('input', { type: 'number', id, placeholder: ph, min: '1800', max: '2100', inputmode: 'numeric' });
    inp.addEventListener('input', () => aenderung());
    w.appendChild(inp);
    jahre.appendChild(w);
  }
  det.appendChild(jahre);

  const ursache = el('label', { class: 'person-zeile' }, t('person.cause'));
  const uInp = el('input', { type: 'text', id: 'person-todesursache', maxlength: '120', placeholder: t('person.causeHint') });
  uInp.addEventListener('input', () => aenderung());
  ursache.appendChild(uInp);
  det.appendChild(ursache);

  det.appendChild(el('span', { class: 'fig-panel-label' }, t('person.events')));
  const chips = el('div', { class: 'person-ereignisse' });
  for (const e of EREIGNISSE) {
    const b = el('button', { type: 'button', class: 'person-ereignis', 'data-wert': e }, ereignisText(e));
    b.addEventListener('click', () => { b.classList.toggle('aktiv'); aenderung(true); });
    chips.appendChild(b);
  }
  det.appendChild(chips);

  const sonst = el('label', { class: 'person-zeile' }, t('person.other'));
  const sInp = el('input', { type: 'text', id: 'person-sonstiges', maxlength: '300', placeholder: t('person.otherHint') });
  sInp.addEventListener('input', () => aenderung());
  sonst.appendChild(sInp);
  det.appendChild(sonst);

  root.appendChild(det);
}

/** Formular auf die ausgewählte Figur setzen (oder ausblenden ohne Auswahl). */
export function syncPersonDetails(fig: any | null): void {
  if (!root) return;
  if (sendeTimer && aktuelleId && (!fig || fig.id !== aktuelleId)) { clearTimeout(sendeTimer); sendeTimer = null; aenderung(true); }
  aktuelleId = fig ? fig.id : null;
  root.hidden = !fig;
  if (!fig) return;
  const p: PersonAngaben = fig.person || {};
  const q = (id: string) => root!.querySelector<HTMLInputElement>('#' + id)!;
  q('person-in-aufstellung').checked = p.inAufstellung !== false;
  q('person-geburtsjahr').value = p.geburtsjahr ? String(p.geburtsjahr) : '';
  q('person-todesjahr').value = p.todesjahr ? String(p.todesjahr) : '';
  q('person-todesursache').value = p.todesursache || '';
  q('person-sonstiges').value = p.sonstiges || '';
  const aktiv = new Set(p.ereignisse || []);
  root.querySelectorAll<HTMLButtonElement>('.person-ereignis').forEach(b => b.classList.toggle('aktiv', aktiv.has(b.dataset.wert!)));
}
