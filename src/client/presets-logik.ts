// brett/src/client/presets-logik.ts
// Reine Logik zu Haltungen (ohne Three.js), auch vom Steuerpult genutzt.

/** Umschalten (Gerald 18.10.2026): aktive Haltung erneut gewählt → Stehen, sonst die gewählte. Stehen bleibt Stehen. */
export function naechsteHaltung(aktuell: string | undefined, gewaehlt: string): string {
  return aktuell === gewaehlt && gewaehlt !== 'stand' ? 'stand' : gewaehlt;
}
