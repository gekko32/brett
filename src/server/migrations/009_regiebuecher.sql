-- 009_regiebuecher.sql
-- Regiebücher (Gerald 06.11.2026, BRETT-ARBEITSRAUM-PROMPT.md, Baustein 5).
-- Ein Regiebuch ist ein möglicher Ablauf, keine Pflicht: jeder Schritt kann
-- übersprungen, das Regiebuch jederzeit beendet werden. Fragen sind Angebote.
--
-- Bibliothek: Systemeinträge (is_system) werden hier gepflegt und bei jedem
-- Start aktualisiert. Eigene Fassungen sind Kopien (original_id) und werden
-- nie von hier überschrieben. Texte zunächst nur Deutsch (Gerald 06.11.2026).
-- Idempotent.

CREATE SCHEMA IF NOT EXISTS brett;

CREATE TABLE IF NOT EXISTS brett.regiebuecher (
  id           TEXT PRIMARY KEY,
  titel        TEXT NOT NULL CHECK (char_length(titel) <= 120),
  kurz         TEXT NOT NULL DEFAULT '',
  anliegen     TEXT NOT NULL DEFAULT '',
  ziel         TEXT NOT NULL DEFAULT '',
  grenzen      TEXT NOT NULL DEFAULT '',
  hinweise     TEXT NOT NULL DEFAULT '',
  herkunft     TEXT NOT NULL DEFAULT '',
  schritte     JSONB NOT NULL,          -- [{titel, anleitung, fragen[], speicherpunkt}]
  version      INTEGER NOT NULL DEFAULT 1,
  is_system    BOOLEAN NOT NULL DEFAULT false,
  original_id  TEXT REFERENCES brett.regiebuecher(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reihenfolge in der Bibliothek wie im Master-Prompt (1–5); eigene Fassungen danach.
ALTER TABLE brett.regiebuecher ADD COLUMN IF NOT EXISTS reihenfolge INTEGER NOT NULL DEFAULT 100;

INSERT INTO brett.regiebuecher (id, titel, kurz, anliegen, ziel, grenzen, hinweise, herkunft, schritte, version, is_system)
VALUES
('rb-mein-platz', 'Mein Platz im System',
 'Eine aktuelle Situation räumlich darstellen und andere Anordnungen ausprobieren.',
 'Familie, Team, Organisation oder eine andere Gruppe, in der der Klient seinen Platz klären möchte.',
 'Die eigene Darstellung der Situation sichtbar machen und Alternativen erkunden.',
 'Die Anordnung wird nicht gedeutet. Nähe, Abstand und Blickrichtung bedeuten, was der Klient ihnen zuschreibt.',
 'Die Ausgangsszene vor dem Umstellen speichern, damit sie im Vergleich wieder da ist.',
 'Eigener konzeptioneller Entwurf (Master-Prompt v2.0, Regiebuch 1), nicht literaturbasiert.',
 '[
   {"titel":"Aufbauen","anleitung":"Der Klient wählt Figuren für die Personen oder Aspekte, die für ihn dazugehören, und stellt sie auf.","fragen":["Wer oder was gehört für dich zu dieser Situation?","Wo stehst du selbst?"],"speicherpunkt":false},
   {"titel":"Beschreiben","anleitung":"Der Klient erzählt, wofür die Figuren stehen und was ihm an der Anordnung auffällt.","fragen":["Wofür steht diese Figur?","Was fällt dir auf, wenn du das Bild so siehst?"],"speicherpunkt":true},
   {"titel":"Ausprobieren","anleitung":"Eine oder mehrere andere Anordnungen erproben, zum Beispiel die eigene Figur an einen anderen Platz stellen.","fragen":["Welchen anderen Platz möchtest du ausprobieren?","Wie ist es dort im Vergleich zu vorher?"],"speicherpunkt":true},
   {"titel":"Vergleichen und festhalten","anleitung":"Ausgangsszene und Varianten im Vergleichsfenster nebeneinander ansehen. Eine Erkenntnis oder offene Frage notieren.","fragen":["Was nimmst du aus diesem Vergleich mit?","Welche Frage ist für dich noch offen?"],"speicherpunkt":false}
 ]'::jsonb, 1, true),
('rb-zwei-erwartungen', 'Zwischen zwei Erwartungen',
 'Eine Situation mit mehreren Erwartungen oder Bezugspunkten untersuchen.',
 'Der Klient erlebt unterschiedliche Erwartungen von Personen, Gruppen oder Rollen.',
 'Die eigene Position zu den Bezugspunkten sichtbar machen und Spielräume erkunden.',
 'Unterstellt keinen Loyalitätskonflikt und keine Ursache. Ob und wie die Erwartungen zusammenhängen, bestimmt der Klient.',
 'Erwartungen können als Figuren, Beschriftungen auf dem Boden oder Flächen dargestellt werden.',
 'Eigener konzeptioneller Entwurf (Master-Prompt v2.0, Regiebuch 2), nicht literaturbasiert.',
 '[
   {"titel":"Bezugspunkte wählen","anleitung":"Der Klient wählt die Personen, Gruppen oder Erwartungen, die ihm wichtig sind.","fragen":["Welche Erwartungen spielen für dich eine Rolle?","Von wem kommen sie?"],"speicherpunkt":false},
   {"titel":"Ausgangsszene","anleitung":"Bezugspunkte und eigene Figur aufstellen.","fragen":["Wo stehst du im Verhältnis zu diesen Erwartungen?"],"speicherpunkt":true},
   {"titel":"Position variieren","anleitung":"Die eigene Figur an andere Stellen bringen, drehen oder den Abstand verändern.","fragen":["Wie ist es, wenn du hier stehst?","Wohin schaust du dabei?"],"speicherpunkt":true},
   {"titel":"Weitere Möglichkeiten","anleitung":"Eine zusätzliche Figur, einen größeren Abstand oder eine andere Anordnung ausprobieren.","fragen":["Was möchtest du noch ausprobieren?","Was verändert sich für dich?"],"speicherpunkt":true},
   {"titel":"Besprechen","anleitung":"Die Varianten aus Sicht des Klienten besprechen.","fragen":["Was ist dir wichtig geworden?"],"speicherpunkt":false}
 ]'::jsonb, 1, true),
('rb-grenze', 'Eine Grenze gestalten',
 'Grenzen, Abstände, Übergänge oder Schutzräume räumlich erkunden.',
 'Der Klient möchte einen Abstand, einen Übergang oder einen geschützten Bereich klären.',
 'Verschiedene Gestaltungen einer Grenze ausprobieren und vergleichen.',
 'Die Bedeutung der Grenze bestimmt der Klient. Eine Grenze ist nicht von sich aus gut oder schlecht.',
 'Eine Grenze lässt sich heute als Fläche oder Rahmen legen; Größe und Deckkraft sind veränderbar.',
 'Eigener konzeptioneller Entwurf (Master-Prompt v2.0, Regiebuch 3), nicht literaturbasiert.',
 '[
   {"titel":"Ausgangssituation","anleitung":"Die Situation mit den beteiligten Figuren aufbauen.","fragen":["Wer oder was gehört zu dieser Situation?"],"speicherpunkt":true},
   {"titel":"Grenze ergänzen","anleitung":"Eine Fläche, einen Rahmen oder ein geeignetes Objekt als Grenze einfügen.","fragen":["Wo soll die Grenze verlaufen?","Wofür steht sie für dich?"],"speicherpunkt":false},
   {"titel":"Verändern","anleitung":"Lage, Größe oder Durchlässigkeit der Grenze verändern.","fragen":["Wie soll sie sein: fester, durchlässiger, größer, kleiner?"],"speicherpunkt":true},
   {"titel":"Figuren erproben","anleitung":"Figuren an verschiedenen Stellen diesseits und jenseits der Grenze ausprobieren.","fragen":["Wie ist es auf dieser Seite, wie auf der anderen?"],"speicherpunkt":true},
   {"titel":"Vergleichen","anleitung":"Bevorzugte und alternative Gestaltung im Vergleichsfenster ansehen.","fragen":["Welche Gestaltung passt im Moment für dich?"],"speicherpunkt":false}
 ]'::jsonb, 1, true),
('rb-ressourcen', 'Ressourcen aktivieren',
 'Unterstützende Personen, Fähigkeiten, Erfahrungen oder Symbole sichtbar machen.',
 'Der Klient sucht Unterstützung oder möchte vorhandene Stärken bewusster nutzen.',
 'Ressourcen auf das Brett bringen und erkunden, wie sie im Alltag nutzbar werden.',
 'Was eine Ressource ist, bestimmt der Klient. Es gibt keine vorgegebene Liste.',
 'Ressourcen können Figuren mit eigenem Namen sein; die Beziehungsart „Ressource“ zeichnet eine grüne Linie.',
 'Eigener konzeptioneller Entwurf (Master-Prompt v2.0, Regiebuch 4), nicht literaturbasiert.',
 '[
   {"titel":"Ausgangssituation","anleitung":"Die Situation aufbauen.","fragen":["Wie sieht die Situation gerade aus?"],"speicherpunkt":true},
   {"titel":"Ressource ergänzen","anleitung":"Eine Person, Fähigkeit, Erfahrung oder ein Symbol als Figur hinzufügen.","fragen":["Wer oder was unterstützt dich?","Was hat dir früher in ähnlichen Lagen geholfen?"],"speicherpunkt":false},
   {"titel":"Anordnen","anleitung":"Verschiedene Positionen und Beziehungen der Ressource ausprobieren.","fragen":["Wo soll die Ressource stehen?","Wie nah soll sie sein?"],"speicherpunkt":true},
   {"titel":"Übertragen","anleitung":"Überlegen, wie die Ressource außerhalb des Bretts konkret nutzbar wird.","fragen":["Was könntest du in den nächsten Tagen damit tun?"],"speicherpunkt":false}
 ]'::jsonb, 1, true),
('rb-zwei-zukuenfte', 'Zwei mögliche Zukünfte',
 'Handlungsalternativen sichtbar machen und vergleichen.',
 'Eine Entscheidung steht an, oder der Klient möchte mögliche Entwicklungen durchspielen.',
 'Zwei Entwicklungen aus derselben Ausgangslage nebeneinanderstellen.',
 'Keine Variante gilt als besser, richtiger oder wahrscheinlicher. Die Software bewertet nichts.',
 'Ausgangslage speichern, dann im Pult zweimal „Kopie“ anlegen (Zukunft A und B), jeweils laden und gestalten.',
 'Eigener konzeptioneller Entwurf (Master-Prompt v2.0, Regiebuch 5), nicht literaturbasiert.',
 '[
   {"titel":"Ausgangslage","anleitung":"Die aktuelle Situation gestalten und speichern.","fragen":["Wie sieht es heute aus?"],"speicherpunkt":true},
   {"titel":"Zukunft A","anleitung":"Eine Kopie der Ausgangslage laden und eine mögliche Entwicklung darstellen.","fragen":["Wie könnte es aussehen, wenn …?"],"speicherpunkt":true},
   {"titel":"Zukunft B","anleitung":"Eine zweite Kopie laden und eine andere Entwicklung gestalten.","fragen":["Und wie, wenn es anders kommt?"],"speicherpunkt":true},
   {"titel":"Vergleichen","anleitung":"Beide Zukünfte im Vergleichsfenster nebeneinander ansehen.","fragen":["Was fällt dir auf, wenn du beide nebeneinander siehst?"],"speicherpunkt":false},
   {"titel":"Nächster Schritt","anleitung":"Eine mögliche nächste Handlung oder eine offene Entscheidungsfrage festhalten.","fragen":["Was wäre ein nächster kleiner Schritt?","Welche Frage willst du noch klären?"],"speicherpunkt":false}
 ]'::jsonb, 1, true)
ON CONFLICT (id) DO UPDATE SET
  titel = EXCLUDED.titel, kurz = EXCLUDED.kurz, anliegen = EXCLUDED.anliegen, ziel = EXCLUDED.ziel,
  grenzen = EXCLUDED.grenzen, hinweise = EXCLUDED.hinweise, herkunft = EXCLUDED.herkunft,
  schritte = EXCLUDED.schritte, version = EXCLUDED.version, is_system = true, updated_at = now()
WHERE brett.regiebuecher.is_system = true
  AND (brett.regiebuecher.schritte IS DISTINCT FROM EXCLUDED.schritte
       OR brett.regiebuecher.version IS DISTINCT FROM EXCLUDED.version
       OR brett.regiebuecher.titel IS DISTINCT FROM EXCLUDED.titel
       OR brett.regiebuecher.hinweise IS DISTINCT FROM EXCLUDED.hinweise);

UPDATE brett.regiebuecher SET reihenfolge = CASE id
  WHEN 'rb-mein-platz' THEN 1 WHEN 'rb-zwei-erwartungen' THEN 2 WHEN 'rb-grenze' THEN 3
  WHEN 'rb-ressourcen' THEN 4 WHEN 'rb-zwei-zukuenfte' THEN 5 END
WHERE is_system = true AND id IN ('rb-mein-platz','rb-zwei-erwartungen','rb-grenze','rb-ressourcen','rb-zwei-zukuenfte')
  AND reihenfolge = 100;
