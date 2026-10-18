// brett/src/client/ui/catalog-panel.ts
// Personenkatalog als Figurenauswahl im Feld „Neue Figur“ (Schritt 1).
// Ein Klick auf eine Rolle stellt die Figur mit Name, Farbe der Ebene,
// passender Größe und (bei Verstorbenen/Ausgeblendeten) blass auf einen
// freien Platz nahe der Mitte.

import { STATE } from '../state';
import { addFigure } from './fig-panel';
import {
  PERSONEN_KATALOG, KOERPER_GROESSE, KOERPER_APPEARANCE, BLASS_OPACITY,
  freierPlatz, eindeutigerName, type KatalogEbene, type KatalogRolle,
} from '../person-catalog';
import { ebeneText, ebeneHinweis, rolleText } from '../katalog-texte';

export function stelleRolleAuf(ebene: KatalogEbene, rolle: KatalogRolle): any {
  const belegt = STATE.figures.map(f => ({ x: f.root.position.x, z: f.root.position.z }));
  const platz = freierPlatz(belegt);
  const namen = STATE.figures.map(f => (f as any).label).filter((l: any) => typeof l === 'string');
  return addFigure(platz, {
    label: eindeutigerName(rolleText(rolle), namen),
    color: ebene.farbe,
    scale: KOERPER_GROESSE[rolle.koerper],
    role: rolle.key,
    body: KOERPER_APPEARANCE[rolle.koerper],
    ...(rolle.blass ? { opacity: BLASS_OPACITY } : {}),
  });
}

export function initCatalogPanel(): void {
  const root = document.getElementById('fig-panel-catalog');
  if (!root) return;
  root.innerHTML = '';
  PERSONEN_KATALOG.forEach((ebene, i) => {
    const det = document.createElement('details');
    det.className = 'catalog-ebene';
    if (i === 0) det.open = true;
    const sum = document.createElement('summary');
    sum.textContent = ebeneText(ebene);
    sum.title = ebeneHinweis(ebene);
    sum.style.borderLeftColor = ebene.farbe;
    det.appendChild(sum);
    const grid = document.createElement('div');
    grid.className = 'catalog-rollen';
    for (const rolle of ebene.rollen) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'catalog-rolle';
      btn.textContent = rolleText(rolle);
      btn.style.borderLeftColor = ebene.farbe;
      if (rolle.blass) btn.classList.add('blass');
      btn.addEventListener('click', () => stelleRolleAuf(ebene, rolle));
      grid.appendChild(btn);
    }
    det.appendChild(grid);
    root.appendChild(det);
  });
}
