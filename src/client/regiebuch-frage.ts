// brett/src/client/regiebuch-frage.ts
// Regiebuch (Gerald 06.11.2026): Frage, die der Coach im Steuerpult für den
// Klienten einblendet. Ob sie erscheint, schaltet der Coach je Sitzung
// (Schalter „Frage auf dem Brett zeigen“). Unten mittig, gut lesbar, verdeckt
// keine Bedienelemente und fängt keine Klicks ab.

const ID = 'regiebuch-frage';

export function zeigeRegiebuchFrage(text: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(ID);
  if (!text) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = ID;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    Object.assign(el.style, {
      // bottom: über der Hinweiszeile; width: damit die Breite nicht an left:50% hängt (Handy).
      position: 'fixed', left: '50%', bottom: '96px', transform: 'translateX(-50%)', width: 'max-content',
      maxWidth: 'min(760px, calc(100vw - 32px))', padding: '14px 22px', borderRadius: '14px',
      background: 'rgba(14,17,22,0.86)', color: '#f3efe6', border: '1px solid rgba(200,169,110,0.7)',
      font: '500 20px/1.4 ui-sans-serif, system-ui, sans-serif', textAlign: 'center',
      boxShadow: '0 8px 28px rgba(0,0,0,0.35)', zIndex: '40', pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);
    document.body.append(el);
  }
  el.textContent = text;
}
