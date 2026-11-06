-- 010_ohne_patrick.sql
-- Gerald 06.11.2026: Patrick hat abgegeben – seine Vorlagen und sein alter
-- Ablauf kommen aus dem Brett. Die Startdateien 002/004/005 legen sie nicht
-- mehr an; hier werden die vorhandenen Zeilen entfernt. Idempotent.
-- Geralds eigene Vorlagen (006) und selbst gespeicherte Vorlagen bleiben.
-- Ohne Standardvorlage beginnt eine neue Sitzung mit leerem Brett.

DELETE FROM brett.board_templates
 WHERE is_system IS TRUE
   AND brand = 'mentolder'
   AND name IN ('Familiensystem 4 Personen', 'Team-Konflikt', 'Innere Anteile');


DELETE FROM brett.coaching_templates WHERE id = 'sys-beziehungsdynamik-familiensystem';
