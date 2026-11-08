// brett/src/client/klient-ansicht.ts
// Klienten-Ansicht (Gerald 08.11.2026): Aufruf über den persönlichen Link
// /k/<token>. Kein Startbildschirm, keine Bedienelemente, nur das Brett und
// (falls eingeblendet) die Frage aus dem Regiebuch. Der Server lässt diese
// Verbindung nur lesen und nur diesen einen Raum sehen.

import { injectTheme } from './ui/theme';
import { currentUser } from './state';

export function istKlientenAdresse(pfad: string): boolean {
  return /^\/k\/[A-Za-z0-9_-]{32}$/.test(pfad);
}

function meldung(text: string): void {
  const d = document.createElement('div');
  d.id = 'klient-meldung';
  d.textContent = text;
  document.body.append(d);
}

export async function starteKlientenAnsicht(): Promise<void> {
  (window as any).__brettIsZuschauer = true;
  injectTheme();
  document.body.classList.add('klient-ansicht');
  for (const id of ['brett-menu', 'brett-lobby']) {
    const e = document.getElementById(id);
    if (e) e.hidden = true;
  }
  const token = location.pathname.split('/').filter(Boolean).at(-1) ?? '';
  let roomToken: string;
  try {
    const r = await fetch(`/api/k/${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('ungueltig');
    ({ roomToken } = await r.json());
  } catch {
    meldung('Dieser Link ist abgelaufen oder gesperrt. Bitte fragen Sie Ihren Coach nach einem neuen Link.');
    return;
  }
  currentUser.userId = 'anon';
  currentUser.name = 'Klient';
  history.replaceState(null, '', `${location.pathname}?${new URLSearchParams({ room: roomToken, klient_token: token })}`);
  const board = await import('./board-boot');
  await board.bootBoard();
}
