# Systembrett (mentolder)

Geralds digitales Systembrett für brett.mentolder.de: 3D-Brett, Steuerpult
für den Coach, Genogramm, Klientenbezug, Vergleich von Aufstellungen und
Regiebücher. Ein Node-Server (Port 3000) liefert Oberfläche, WebSocket-Abgleich
und Speicherung in Postgres.

- **Image:** jeder Push auf `main` baut `ghcr.io/gekko32/brett:latest`
  (`.github/workflows/build.yml`). `main` geht damit nach etwa 20 Minuten live.
- **Ausrollen:** `gekko32/mentolder-prod` prüft alle 20 Minuten auf ein neues Image.
- **Lokal:** `lokal/start.ps1` oder `lokal/vorschau.ps1`; der Datenbankzugang
  liegt in `lokal/.env.lokal` (nicht im Repo).
- **Datenbank:** Änderungen in `src/server/migrations/` laufen bei jedem Start
  (idempotent).
- **Tests:** `MOCK_DB=true npx tsx --test test/*.test.ts test/*.test.js test/*.test.mjs`

Arbeitsstand und Entscheidungen: `technik/hetzner/BRETT-*.md` im Arbeitsordner.

## Schalter (Feature Flags)

`window.__brettFeatures['name']`, gesetzt über die ConfigMap `brett-features`:

| Flag | Bedeutung | Stand |
|------|-----------|-------|
| `replay` | Zeitleiste/Wiedergabe einer Sitzung | aus |
| `t000468-ground-anchors` | Boden-Anker und Flächen | an |
| `sf-t000465` | Freiflug-Kamera | an |
| `sf-t000467` | Beziehungslinien | an |
| `sf-t000469` | Boden-Notizen | an |
