// brett/src/client/katalog-texte.ts
// Anzeige-Texte für Katalog, Ereignisse, Beziehungsarten und Böden in der
// gewählten Sprache (Bedienkonzept Schritt 6). Gespeichert werden weiterhin die
// deutschen Werte bzw. Keys – übersetzt wird nur die Anzeige. Fehlt eine
// Übersetzung, erscheint der deutsche Text.

import { t } from './i18n';
import type { KatalogEbene, KatalogRolle } from './person-catalog';

const tf = (key: string, rueckfall: string): string => { const v = t(key); return v === key ? rueckfall : v; };

export const ebeneText = (eb: KatalogEbene): string => tf('cat.' + eb.key, eb.label);
export const ebeneHinweis = (eb: KatalogEbene): string => tf('cat.' + eb.key + '.hint', eb.hinweis);
export const rolleText = (r: KatalogRolle): string => tf('role.' + r.key, r.label);
export const ereignisText = (e: string): string => tf('ev.' + e, e);
export const artText = (art: string | undefined): string => (art ? tf('rel.' + art, art) : '');
export const bodenText = (key: string, rueckfall: string): string => tf('floor.' + key, rueckfall);
