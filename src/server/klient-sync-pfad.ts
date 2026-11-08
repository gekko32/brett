// Klienten-Link (08.11.2026): Der Schlüssel steht im Pfad, nicht in der Abfrage.
// Der Anmeldeschutz davor (oauth2-proxy) entscheidet über Ausnahmen nur anhand
// des Pfads; `/sync` als Ganzes freizugeben hieße, das Brett für alle zu öffnen.
export const KLIENT_SYNC_PFAD = /^\/sync\/k\/([A-Za-z0-9_-]{32})$/;

/** Nur diese Pfade dürfen eine WebSocket-Verbindung aufbauen. */
export function istSyncPfad(pfad: string): boolean {
  return pfad === '/sync' || KLIENT_SYNC_PFAD.test(pfad);
}
