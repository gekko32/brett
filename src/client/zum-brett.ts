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
