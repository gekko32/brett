// brett/src/client/zum-brett.ts
// „Zum Brett“ (Gerald 06.11.2026): Auf dem Handy öffnen sich Steuerpult oder
// Genogramm teils als eigener Tab – ohne Weg zurück. Dieser Knopf schließt den
// Tab, wenn das Brett ihn geöffnet hat, sonst lädt er das Brett im selben Tab.

/** Touch-Gerät ohne Maus (Handy, Tablet). */
export function istTouchGeraet(): boolean {
  try {
    if (window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches) return true;
    // Firefox auf Samsung-Handys meldet teils ein feines Zeigegerät; darum zusätzlich:
    // Touch-Fähigkeit und ein Bildschirm in Handy- oder Tablet-Größe (08.11.2026).
    return navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) <= 900;
  } catch { return false; }
}

export function zurueckZumBrett(room: string): void {
  const opener = window.opener as Window | null;
  if (opener && !opener.closed) {
    try { opener.focus(); } catch { /* fremdes Fenster */ }
    window.close();
    // Hat der Browser das Schließen verweigert, im selben Tab zum Brett.
    setTimeout(() => { if (!window.closed) location.href = '/?room=' + encodeURIComponent(room); }, 300);
    return;
  }
  location.href = '/?room=' + encodeURIComponent(room);
}

/** Adresse des Admin-Dashboards der Website (brett.x → web.x). Lokal ohne Website: null. */
export function dashboardAdresse(host: string, protokoll: string): string | null {
  if (!host.startsWith('brett.')) return null;
  return `${protokoll}//web.${host.slice('brett.'.length)}/admin`;
}

export function zumDashboard(): void {
  const ziel = dashboardAdresse(location.host, location.protocol);
  if (ziel) (window.top ?? window).location.href = ziel;
}

/** Am Handy im selben Tab wechseln: keine Tab-Sammlung, der Stand liegt auf dem Server (09.11.2026). */
export function zumGenogramm(room: string): void {
  (window.top ?? window).location.href = '/genogramm.html?room=' + encodeURIComponent(room);
}

export function dashboardKnopf(): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = '⌂ Dashboard';
  b.title = 'Zum Admin-Dashboard der Website';
  b.style.minHeight = '40px';
  b.addEventListener('click', zumDashboard);
  return b;
}

/** Knöpfe in der oberen Leiste des Bretts, direkt hinter dem Steuerpult (Gerald 09.11.2026). */
export function wechselKnoepfe(): void {
  const leiste = document.getElementById('topbar');
  if (!leiste || !(window as any).__brettCurrentUserIsAdmin || (window as any).__brettIsKlient) return;
  const room = new URLSearchParams(location.search).get('room');
  const knopf = (id: string, text: string, titel: string, aktion: () => void) => {
    const b = document.createElement('button');
    b.type = 'button'; b.id = id; b.textContent = text; b.title = titel;
    b.addEventListener('click', aktion);
    return b;
  };
  const neu: HTMLButtonElement[] = [];
  if (room) neu.push(knopf('wechsel-genogramm', 'Genogramm', 'Zum Genogramm wechseln', () => zumGenogramm(room)));
  if (dashboardAdresse(location.host, location.protocol)) neu.push(knopf('wechsel-dashboard', '⌂', 'Zum Admin-Dashboard', zumDashboard));
  const pult = leiste.querySelector('#steuerpult-btn, #pult-btn');
  if (pult) pult.after(...neu); else leiste.prepend(...neu);
}

export function zumBrettKnopf(room: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = '◀ Zum Brett';
  b.title = 'Zurück zum Brett';
  b.className = 'zum-brett';
  Object.assign(b.style, { minHeight: '40px', fontWeight: '600' } as CSSStyleDeclaration);
  b.addEventListener('click', () => zurueckZumBrett(room));
  return b;
}
