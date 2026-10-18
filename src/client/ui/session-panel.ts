// brett/src/client/ui/session-panel.ts
// Feld „Sitzung“ oben links (Gerald 16.10.2026: Lobby-Bildschirm überflüssig,
// dessen Inhalt gehört aufs Brett). Enthält: Sitzungs-Code + Einladungslink,
// Vorlage laden (ersetzt die Aufstellung, deshalb zweistufige Bestätigung),
// Himmel und Licht. Nutzt dieselben Server-Befehle wie die frühere Lobby.

import { t } from '../i18n';
import { getAktuelleOptik } from './optik';
import { getLobbyState, sendClient } from '../ws-client';

let panel: HTMLDivElement | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function zeile(label: string, inhalt: HTMLElement): HTMLElement {
  const z = el('label', 'session-zeile');
  z.appendChild(el('span', 'fig-panel-label', label));
  z.appendChild(inhalt);
  return z;
}

function auswahl(werte: Array<[string, string]>, aktuell: string | undefined, onChange: (v: string) => void): HTMLSelectElement {
  const s = el('select', 'session-select');
  for (const [v, txt] of werte) {
    const o = el('option', undefined, txt);
    o.value = v;
    if (v === aktuell) o.selected = true;
    s.appendChild(o);
  }
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

async function vorlagenAuswahl(): Promise<HTMLSelectElement> {
  const s = el('select', 'session-select');
  const leer = el('option', undefined, t('session.choose'));
  leer.value = '';
  s.appendChild(leer);
  try {
    const brand = new URLSearchParams(location.search).get('brand') || 'mentolder';
    const r = await fetch(`/api/board-templates?brand=${encodeURIComponent(brand)}`);
    const list: any[] = r.ok ? await r.json() : [];
    // Nach Kategorie gruppiert, innerhalb alphabetisch (vorher ungeordnet).
    const gruppen = new Map<string, any[]>();
    for (const v of list) {
      const k = v.category || '—';
      if (!gruppen.has(k)) gruppen.set(k, []);
      gruppen.get(k)!.push(v);
    }
    for (const k of [...gruppen.keys()].sort((a, b) => a.localeCompare(b, 'de'))) {
      const og = el('optgroup');
      og.label = k;
      for (const v of gruppen.get(k)!.sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
        const o = el('option', undefined, v.name);
        o.value = v.id;
        if (v.description) o.title = v.description;
        og.appendChild(o);
      }
      s.appendChild(og);
    }
  } catch { /* Liste bleibt leer */ }
  return s;
}

async function baue(): Promise<HTMLDivElement> {
  const p = el('div');
  p.id = 'session-panel';
  p.hidden = true;
  p.addEventListener('mousedown', e => e.stopPropagation());

  // Code + Einladungslink
  const code = getLobbyState().sessionCode;
  const codeBox = el('div', 'session-code');
  codeBox.appendChild(el('strong', undefined, code || '—'));
  const copy = el('button', 'session-btn', t('session.copyLink'));
  copy.type = 'button';
  copy.disabled = !code;
  copy.addEventListener('click', () => {
    const c = getLobbyState().sessionCode;
    if (!c) return;
    try { navigator.clipboard?.writeText(`${location.origin}/api/join?code=${encodeURIComponent(c)}`); } catch { /* noop */ }
    copy.textContent = t('session.copied');
    setTimeout(() => { copy.textContent = t('session.copyLink'); }, 1500);
  });
  codeBox.appendChild(copy);
  p.appendChild(zeile(t('session.code'), codeBox));

  // Vorlage laden (zweistufig: erst „Laden“, dann „Wirklich ersetzen?“)
  const tpl = await vorlagenAuswahl();
  const laden = el('button', 'session-btn', t('session.templateLoad'));
  laden.type = 'button';
  let bestaetigt = false;
  const zuruecksetzen = () => { bestaetigt = false; laden.textContent = t('session.templateLoad'); laden.classList.remove('warn'); };
  tpl.addEventListener('change', zuruecksetzen);
  laden.addEventListener('click', () => {
    if (!tpl.value) return;
    if (!bestaetigt) {
      bestaetigt = true;
      laden.textContent = t('session.templateConfirm');
      laden.classList.add('warn');
      return;
    }
    sendClient({ type: 'admin_set_board_template', boardTemplateId: tpl.value });
    zuruecksetzen();
    schliessen();
  });
  const tplBox = el('div', 'session-tpl');
  tplBox.append(tpl, laden);
  p.appendChild(zeile(t('session.template'), tplBox));
  p.appendChild(el('span', 'session-hinweis', t('session.templateHint')));

  // Himmel / Licht
  const optik = (getLobbyState().settings as any)?.optik || {};
  p.appendChild(zeile(t('session.sky'), auswahl(
    [['day', t('optik.day')], ['dusk', t('optik.dusk')], ['calm', t('optik.calm')]], optik.sky,
    v => sendClient({ type: 'admin_set_optik', settings: { ...getAktuelleOptik(), sky: v as 'day' | 'dusk' | 'calm' } }))));
  p.appendChild(zeile(t('session.light'), auswahl(
    [['neutral', t('optik.neutral')], ['warm', t('optik.warm')], ['cool', t('optik.cool')]], optik.lightMood,
    v => sendClient({ type: 'admin_set_optik', settings: { ...getAktuelleOptik(), lightMood: v as 'neutral' | 'warm' | 'cool' } }))));

  document.body.appendChild(p);
  return p;
}

function schliessen(): void {
  if (panel) panel.hidden = true;
}

/** Knopf „Sitzung ▾“ ganz links in die obere Leiste setzen. */
export function initSessionPanel(): void {
  const topbar = document.getElementById('topbar');
  if (!topbar || document.getElementById('session-btn')) return;
  const btn = el('button', undefined, t('session.button') + ' ▾');
  btn.id = 'session-btn';
  btn.type = 'button';
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    // Bei jedem Öffnen neu bauen: Code und Vorlagenliste aktuell halten.
    panel?.remove();
    panel = await baue();
    panel.hidden = false;
  });
  topbar.insertBefore(btn, topbar.firstChild);
  // Steuerpult als eigenes Fenster (Bildschirmteilen: nur das Spielfeld zeigen).
  const pult = el('button', undefined, '🗔 ' + t('pult.open'));
  pult.id = 'pult-btn';
  pult.type = 'button';
  pult.title = t('pult.openHint');
  pult.addEventListener('click', () => { import('../steuerpult-sync').then(m => m.oeffneSteuerpult()); });
  btn.after(pult);
  document.addEventListener('mousedown', (e) => {
    if (panel && !panel.hidden && !panel.contains(e.target as Node) && e.target !== btn) schliessen();
  });
}
