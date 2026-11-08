// brett/src/client/klient-ansicht.ts
// Klienten-Ansicht (Gerald 08.11.2026): Aufruf über den persönlichen Link
// /k/<token>. Kein Startbildschirm, kein Steuerpult: nur das Brett und (falls
// eingeblendet) die Frage aus dem Regiebuch. Der Klient kann Figuren bewegen,
// drehen und setzen, sonst nichts. Das erzwingt der Server (klientDarf), die
// Oberfläche hier richtet sich nur danach. Nur dieser eine Raum.

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
  (window as any).__brettIsKlient = true;
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
  const hinweis = document.createElement('div');
  hinweis.id = 'klient-hinweis';
  hinweis.textContent = 'Figur ziehen = bewegen · antippen, dann ⟲ ⟳ = drehen · auf einen Stuhl ziehen = setzen';
  document.body.append(hinweis);
  setTimeout(() => hinweis.remove(), 15_000);
}
