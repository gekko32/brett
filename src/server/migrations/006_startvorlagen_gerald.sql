-- 006_startvorlagen_gerald.sql
-- Startvorlagen von Gerald (16.10.2026): schnell aufbauen, danach in der
-- Sitzung anpassen. Bewusst ohne vorgegebene Sätze (entstehen in der Sitzung),
-- neutraler Gesichtsausdruck, keine Zonen/Linien.
-- Größe: Kinder 0,7, Oma/Opa 0,95 (die Körperform „child“/„elder“ ändert das 3D-Modell nicht).
-- Blickrichtung: vorn = lokal +Z (wie Haltungen, Gesicht, Vorlagen 005); alle zur Mitte bzw. zur Leitung.
-- Idempotent wie 005 (läuft bei jedem Start): Upsert über (brand, name)
-- für Systemzeilen, feste IDs. is_default bleibt bei 005.

INSERT INTO brett.board_templates
  (id, brand, name, description, category, state, is_system)
VALUES
  ('31958c8b-17ec-4c18-9afe-29dd9c8841fe', 'mentolder', 'Ein Mann',
   'Eine männliche Figur in der Mitte, Blick nach vorn.',
   'Einzelperson',
   '{"figures":[{"id":"f1","label":"Mann","x":0,"z":0,"facingY":0,"color":"#4f7cac","scale":1,"preset":"stand","appearance":{"color":"#4f7cac","face":"neutral","body":"adult-tall"}}],"zones":[],"anchors":[],"lines":[],"optik":{"sky":"day","floor":"wood-dark","lightMood":"neutral"}}',
   true),
  ('19ea1274-c41b-46f8-a12c-28e9a3e7824e', 'mentolder', 'Eine Frau',
   'Eine weibliche Figur in der Mitte, Blick nach vorn.',
   'Einzelperson',
   '{"figures":[{"id":"f1","label":"Frau","x":0,"z":0,"facingY":0,"color":"#c0607a","scale":1,"preset":"stand","appearance":{"color":"#c0607a","face":"neutral","body":"adult-average"}}],"zones":[],"anchors":[],"lines":[],"optik":{"sky":"day","floor":"wood-dark","lightMood":"neutral"}}',
   true),
  ('69422be9-2bb9-404f-8c27-a5a01734702e', 'mentolder', 'Familie: Mann, Frau, zwei Kinder',
   'Mann und Frau hinten, zwei Kinder vorn, alle zur Mitte gewandt.',
   'Familie',
   '{"figures":[{"id":"f1","label":"Mann","x":-1,"z":-0.7,"facingY":0.9601,"color":"#4f7cac","scale":1,"preset":"stand","appearance":{"color":"#4f7cac","face":"neutral","body":"adult-tall"}},{"id":"f2","label":"Frau","x":1,"z":-0.7,"facingY":-0.9601,"color":"#c0607a","scale":1,"preset":"stand","appearance":{"color":"#c0607a","face":"neutral","body":"adult-average"}},{"id":"f3","label":"Kind 1","x":-0.6,"z":0.9,"facingY":2.5536,"color":"#e0b04a","scale":0.7,"preset":"stand","appearance":{"color":"#e0b04a","face":"neutral","body":"child"}},{"id":"f4","label":"Kind 2","x":0.6,"z":0.9,"facingY":-2.5536,"color":"#6fb38a","scale":0.7,"preset":"stand","appearance":{"color":"#6fb38a","face":"neutral","body":"child"}}],"zones":[],"anchors":[],"lines":[],"optik":{"sky":"day","floor":"wood-dark","lightMood":"neutral"}}',
   true),
  ('e6339eb0-e234-4abe-9c36-2a9da18faa35', 'mentolder', 'Opa und Kind',
   'Großvater und Kind einander zugewandt (eigene Elternbeziehung).',
   'Familie',
   '{"figures":[{"id":"f1","label":"Opa","x":-0.8,"z":0,"facingY":1.5708,"color":"#8a8f98","scale":0.95,"preset":"stand","appearance":{"color":"#8a8f98","face":"neutral","body":"elder"}},{"id":"f2","label":"Kind","x":0.8,"z":0,"facingY":-1.5708,"color":"#e0b04a","scale":0.7,"preset":"stand","appearance":{"color":"#e0b04a","face":"neutral","body":"child"}}],"zones":[],"anchors":[],"lines":[],"optik":{"sky":"day","floor":"wood-dark","lightMood":"neutral"}}',
   true),
  ('46d3a941-ec2c-4e3b-bb24-3d81b9006776', 'mentolder', 'Oma und Kind',
   'Großmutter und Kind einander zugewandt (eigene Elternbeziehung).',
   'Familie',
   '{"figures":[{"id":"f1","label":"Oma","x":-0.8,"z":0,"facingY":1.5708,"color":"#9b7fb0","scale":0.95,"preset":"stand","appearance":{"color":"#9b7fb0","face":"neutral","body":"elder"}},{"id":"f2","label":"Kind","x":0.8,"z":0,"facingY":-1.5708,"color":"#e0b04a","scale":0.7,"preset":"stand","appearance":{"color":"#e0b04a","face":"neutral","body":"child"}}],"zones":[],"anchors":[],"lines":[],"optik":{"sky":"day","floor":"wood-dark","lightMood":"neutral"}}',
   true),
  ('cee97053-68b1-4074-a874-f0faa71a7380', 'mentolder', 'Team: Chef/in und 6 Mitarbeitende',
   'Leitung vorn, sechs Mitarbeitende in zwei Reihen ihr zugewandt.',
   'Team',
   '{"figures":[{"id":"f1","label":"Chef/in","x":0,"z":-1.6,"facingY":0,"color":"#b05a3c","scale":1,"preset":"stand","appearance":{"color":"#b05a3c","face":"neutral","body":"adult-tall"}},{"id":"f2","label":"Mitarbeiter/in 1","x":-1.2,"z":0.3,"facingY":2.5783,"color":"#5f8fa8","scale":1,"preset":"stand","appearance":{"color":"#5f8fa8","face":"neutral","body":"adult-average"}},{"id":"f3","label":"Mitarbeiter/in 2","x":0,"z":0.3,"facingY":3.1416,"color":"#5f8fa8","scale":1,"preset":"stand","appearance":{"color":"#5f8fa8","face":"neutral","body":"adult-average"}},{"id":"f4","label":"Mitarbeiter/in 3","x":1.2,"z":0.3,"facingY":-2.5783,"color":"#5f8fa8","scale":1,"preset":"stand","appearance":{"color":"#5f8fa8","face":"neutral","body":"adult-average"}},{"id":"f5","label":"Mitarbeiter/in 4","x":-1.2,"z":1.4,"facingY":2.7611,"color":"#5f8fa8","scale":1,"preset":"stand","appearance":{"color":"#5f8fa8","face":"neutral","body":"adult-average"}},{"id":"f6","label":"Mitarbeiter/in 5","x":0,"z":1.4,"facingY":3.1416,"color":"#5f8fa8","scale":1,"preset":"stand","appearance":{"color":"#5f8fa8","face":"neutral","body":"adult-average"}},{"id":"f7","label":"Mitarbeiter/in 6","x":1.2,"z":1.4,"facingY":-2.7611,"color":"#5f8fa8","scale":1,"preset":"stand","appearance":{"color":"#5f8fa8","face":"neutral","body":"adult-average"}}],"zones":[],"anchors":[],"lines":[],"optik":{"sky":"day","floor":"wood-dark","lightMood":"neutral"}}',
   true)
ON CONFLICT (brand, name) WHERE is_system IS TRUE
DO UPDATE SET
  id          = EXCLUDED.id,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  state       = EXCLUDED.state;
