// brett/src/client/regiebuch-ablauf.ts
// Reine Ablauflogik für Regiebücher (Gerald 06.11.2026). Kein DOM → testbar
// (test/regiebuch.test.ts). Grundsätze: jeder Schritt überspringbar, jederzeit
// beendbar, Fragen sind Angebote und blockieren nichts.

export interface Schritt { titel: string; anleitung: string; fragen: string[]; speicherpunkt: boolean }
export interface Regiebuch {
  id: string; titel: string; kurz: string; anliegen: string; ziel: string; grenzen: string;
  hinweise: string; herkunft: string; schritte: Schritt[]; version: number; is_system: boolean; original_id: string | null;
}

/** Laufender Ablauf im Steuerpult. Kein Klienteninhalt (Notizen bleiben im Speicher des Pults). */
export interface Lauf {
  id: string;
  index: number;
  /** Schalter: Frage auf dem Brett zeigen (je Sitzung umschaltbar). */
  frageAn: boolean;
  /** Welche Frage des Schritts gerade auf dem Brett steht (null = keine). */
  frageIndex: number | null;
}

export function starte(rb: Pick<Regiebuch, 'id'>, frageAn = false): Lauf {
  return { id: rb.id, index: 0, frageAn, frageIndex: null };
}

const klemme = (i: number, n: number) => Math.max(0, Math.min(i, Math.max(0, n - 1)));

/** Weiter/zurück/springen. Wechselt der Schritt, verschwindet die Frage vom Brett. */
export function gehe(l: Lauf, rb: Pick<Regiebuch, 'schritte'>, ziel: number): Lauf {
  const index = klemme(ziel, rb.schritte.length);
  return index === l.index ? l : { ...l, index, frageIndex: null };
}

export function istLetzter(l: Lauf, rb: Pick<Regiebuch, 'schritte'>): boolean {
  return l.index >= rb.schritte.length - 1;
}

/** Text, der aufs Brett soll, oder null (Schalter aus, keine Frage gewählt, ungültig). */
export function brettText(l: Lauf | null, rb: Pick<Regiebuch, 'schritte'> | null): string | null {
  if (!l || !rb || !l.frageAn || l.frageIndex === null) return null;
  return rb.schritte[l.index]?.fragen[l.frageIndex] ?? null;
}

/** Name für einen Speicherpunkt: „Regiebuch – Schritt“. */
export function speicherName(rb: Pick<Regiebuch, 'titel' | 'schritte'>, l: Lauf): string {
  const s = rb.schritte[l.index]?.titel || `Schritt ${l.index + 1}`;
  return `${rb.titel} – ${s}`.slice(0, 200);
}

/** Fragen aus einem Textfeld: eine je Zeile, leere Zeilen fallen weg. */
export function fragenAusText(text: string): string[] {
  return text.split(/\r?\n/).map(z => z.trim()).filter(Boolean);
}

/** Gespeicherten Lauf (localStorage) prüfen; Unpassendes → null. */
export function laufAusSpeicher(roh: unknown, rb: Pick<Regiebuch, 'id' | 'schritte'> | null): Lauf | null {
  if (!roh || typeof roh !== 'object' || !rb) return null;
  const r = roh as any;
  if (r.id !== rb.id || typeof r.index !== 'number') return null;
  const index = klemme(r.index | 0, rb.schritte.length);
  const fragen = rb.schritte[index]?.fragen.length ?? 0;
  const fi = typeof r.frageIndex === 'number' && r.frageIndex >= 0 && r.frageIndex < fragen ? r.frageIndex : null;
  return { id: rb.id, index, frageAn: r.frageAn === true, frageIndex: fi };
}
