// brett/src/client/ui/menue.ts
// ☰ Menü in der oberen Leiste (Bedienkonzept Schritt 4, Gerald 16.10.2026):
// In der Leiste bleibt nur, was man in einer Sitzung ständig braucht; Seltenes
// wandert geordnet ins Menü. Die vorhandenen Knöpfe werden samt ihrer
// Funktion verschoben (nicht nachgebaut). Manche werden erst später von
// anderen Modulen eingehängt → MutationObserver sortiert sie nach.

import { t } from '../i18n';

interface Abschnitt { key: string; titel: string; selektoren: string[] }

const ABSCHNITTE: Abschnitt[] = [
  { key: 'ansicht', titel: 'menu.view', selektoren: ['#btn-view-2d', '#btn-view-cone', '#btn-magnet'] },
  { key: 'teilen', titel: 'menu.share', selektoren: ['#share-btn', '#zuschauer-btn'] },
  { key: 'export', titel: 'menu.export', selektoren: ['.brett-template-save-btn', '#btn-export-png', '#btn-export-json', '#btn-export-pdf', '#btn-import-json'] },
  { key: 'sitzung', titel: 'menu.sessionGroup', selektoren: ['#reset-default-btn'] },
  { key: 'sprache', titel: 'menu.language', selektoren: ['#lang-select'] },
];

let panel: HTMLDivElement | null = null;
const ziele = new Map<string, HTMLDivElement>();

function einsortieren(): void {
  if (!panel) return;
  for (const a of ABSCHNITTE) {
    const ziel = ziele.get(a.key)!;
    for (const sel of a.selektoren) {
      const e = document.querySelector(sel) as HTMLElement | null;
      if (e && !panel.contains(e)) ziel.append(e);
    }
    // Abschnitt nur zeigen, wenn er etwas enthält
    (ziel.parentElement as HTMLElement).hidden = ziel.children.length === 0;
  }
  // „Template speichern“ verständlicher benennen
  const tpl = panel.querySelector('.brett-template-save-btn') as HTMLElement | null;
  if (tpl && tpl.textContent !== t('menu.saveTemplate')) tpl.textContent = t('menu.saveTemplate');
}

export function initMenue(): void {
  const topbar = document.getElementById('topbar');
  if (!topbar || document.getElementById('menue-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'menue-btn';
  btn.type = 'button';
  btn.textContent = '☰ ' + t('menu.button');
  btn.setAttribute('aria-expanded', 'false');
  topbar.append(btn);

  panel = document.createElement('div');
  panel.id = 'menue-panel';
  panel.hidden = true;
  panel.addEventListener('mousedown', e => e.stopPropagation());
  for (const a of ABSCHNITTE) {
    const block = document.createElement('section');
    const h = document.createElement('div');
    h.className = 'menue-titel';
    h.textContent = t(a.titel);
    const ziel = document.createElement('div');
    ziel.className = 'menue-inhalt';
    block.append(h, ziel);
    panel.append(block);
    ziele.set(a.key, ziel);
  }
  document.body.append(panel);

  const auf = (an: boolean) => { panel!.hidden = !an; btn.setAttribute('aria-expanded', String(an)); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); auf(panel!.hidden === true); });
  document.addEventListener('mousedown', (e) => {
    if (panel && !panel.hidden && !panel.contains(e.target as Node) && e.target !== btn) auf(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') auf(false); });

  einsortieren();
  // Später eingehängte Knöpfe (Teilen, Zuschauer, Vorlage …) nachsortieren.
  new MutationObserver(() => einsortieren()).observe(topbar, { childList: true, subtree: true });
}
