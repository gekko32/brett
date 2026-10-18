"""Mannequin-Figuren für das Systembrett mit MPFB erzeugen (Gerald, 18.10.2026).

Erzeugt neutrale, glatte Menschenfiguren ohne Kleidung, Haare und
Hauttextur, mit dem MPFB-Skelett „game_engine“, und speichert sie als GLB
nach public/assets/figuren. Dazu kommt figuren.json mit Messwerten
(Höhe, Kopf, Dreiecke), die das Brett zum Einpassen braucht.

Aufruf (oder per figuren_erzeugen.cmd):
    blender -b --python blender/figuren_erzeugen.py -- <ausgabeordner>

Voraussetzung: Blender ab 4.2 mit der Erweiterung MPFB (extensions.blender.org).
Lizenzen: MPFB-Code GPLv3 (nur Werkzeug), Grundmodell und Skelett CC0.
"""
import importlib
import json
import os
import sys

import bpy

# ── MPFB finden (als Blender-Erweiterung installiert) ───────────────────────
mpfb = None
for kandidat in ("bl_ext.blender_org.mpfb", "bl_ext.user_default.mpfb", "mpfb"):
    try:
        mpfb = importlib.import_module(kandidat)
        break
    except ImportError:
        pass
if mpfb is None:
    raise SystemExit("MPFB nicht gefunden – bitte in Blender unter Erweiterungen installieren.")
HumanService = importlib.import_module(mpfb.__name__ + ".services.humanservice").HumanService
TargetService = importlib.import_module(mpfb.__name__ + ".services.targetservice").TargetService
LocationService = importlib.import_module(mpfb.__name__ + ".services.locationservice").LocationService

# Zielgröße (Dreiecke): Körper und je Kleidungsstück. 12 Figuren sind auch für Tablets wenig.
ZIEL_DREIECKE = 6000
ZIEL_DREIECKE_KLEIDUNG = 2500

# Frisuren (Gerald 18.10.2026: Haare am Mannequin statt flacher Bilder), MakeHuman-
# Systemassets, CC0. Je Körper angepasst und einzeln exportiert; das Brett lädt nur,
# was eine Figur trägt. Gefärbt wird schlicht – aus der Textur bleibt nur die Form
# der Strähnen (Alpha) als kleines Graubild haare/<name>.png.
HAARE = ["short02", "long01", "ponytail01", "braid01", "afro01"]
HAAR_TEXTUR_PX = 512

# Schlichte Kleidung (Gerald 18.10.2026) aus den MakeHuman-Systemassets (CC0,
# makehuman_system_assets_cc0.zip, in MPFB eingespielt). Stoffbilder werden nicht
# übernommen: Kleidung bekommt im Brett die Ebenenfarbe, Kopf/Hände einen Hautton.
KLEIDUNG = {
    "mann": ["male_casualsuit02", "shoes02"],
    "aelter_mann": ["male_casualsuit02", "shoes02"],
    "frau": ["female_casualsuit01", "shoes02"],
    "aelter_frau": ["female_elegantsuit01", "shoes02"],
    "neutral": ["male_casualsuit04", "shoes02"],
    "aelter_neutral": ["male_casualsuit04", "shoes02"],
    "kind": ["male_casualsuit04", "shoes02"],
    "jugend_m": ["male_casualsuit04", "shoes02"],
    "jugend_w": ["female_casualsuit01", "shoes02"],
    "kleinkind": ["male_casualsuit04", "shoes02"],
    "mann_kraeftig": ["male_casualsuit02", "shoes02"],
    "frau_kraeftig": ["female_elegantsuit01", "shoes02"],
    "mann_schlank": ["male_casualsuit02", "shoes02"],
    "frau_schlank": ["female_casualsuit01", "shoes02"],
    "hochbetagt": ["male_casualsuit02", "shoes02"],
}

# MakeHuman-Makros: gender 0 = weiblich, 1 = männlich; age 0,5 ≈ 25 Jahre,
# 0,14 ≈ 8 Jahre, 0,85 ≈ 70 Jahre (MakeHuman-Skala).
VARIANTEN = {
    "mann": {"gender": 1.0, "age": 0.5, "height": 0.55},
    "frau": {"gender": 0.0, "age": 0.5, "height": 0.45},
    "neutral": {"gender": 0.5, "age": 0.5},
    "kind": {"gender": 0.5, "age": 0.14},
    "aelter_mann": {"gender": 1.0, "age": 0.85, "height": 0.5},
    "aelter_frau": {"gender": 0.0, "age": 0.85, "height": 0.45},
    "aelter_neutral": {"gender": 0.5, "age": 0.85},
    # Figurenbibliothek (Gerald 18.10.2026): weitere Körperformen, im Steuerpult wählbar
    "jugend_m": {"gender": 1.0, "age": 0.3},
    "jugend_w": {"gender": 0.0, "age": 0.3},
    "kleinkind": {"gender": 0.5, "age": 0.06},
    "mann_kraeftig": {"gender": 1.0, "age": 0.55, "weight": 0.85, "muscle": 0.6},
    "frau_kraeftig": {"gender": 0.0, "age": 0.55, "weight": 0.85},
    "mann_schlank": {"gender": 1.0, "age": 0.45, "weight": 0.15},
    "frau_schlank": {"gender": 0.0, "age": 0.45, "weight": 0.15},
    "hochbetagt": {"gender": 0.5, "age": 1.0},
}


def szene_leeren():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for sammlung in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials):
        for daten in list(sammlung):
            if daten.users == 0:
                sammlung.remove(daten)


def aktiv(obj):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)


def dreiecke(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def modifier_anwenden(obj, name):
    aktiv(obj)
    bpy.ops.object.modifier_move_to_index(modifier=name, index=0)
    bpy.ops.object.modifier_apply(modifier=name)


def neutrales_material(obj, name="Figur"):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.80, 0.80, 0.78, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.7
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def kopf_messen(obj):
    """Kopfmitte und Gesichtsvorderseite in glTF-Koordinaten (x, z, -y)."""
    gruppe = obj.vertex_groups.get("head")
    punkte = []
    if gruppe is not None:
        gi = gruppe.index
        for v in obj.data.vertices:
            for g in v.groups:
                if g.group == gi and g.weight > 0.5:
                    punkte.append(obj.matrix_world @ v.co)
    if not punkte:
        return None
    xs = [p.x for p in punkte]; ys = [p.y for p in punkte]; zs = [p.z for p in punkte]
    return {
        # glTF: x bleibt, y = Blender-z, z = -Blender-y (vorn = -y in Blender)
        "mitte": [round((min(xs) + max(xs)) / 2, 4), round((min(zs) + max(zs)) / 2, 4), round(-(min(ys) + max(ys)) / 2, 4)],
        "vorn": round(-min(ys), 4),
        "hoehe": round(max(zs) - min(zs), 4),
        "breite": round(max(xs) - min(xs), 4),
    }


def kleidung_vorbereiten(eintrag):
    stueck, obj = eintrag
    if obj is None:
        return None
    vereinfachen(obj, ZIEL_DREIECKE_KLEIDUNG)
    obj.name = "Kleidung_" + stueck
    neutrales_material(obj, "Kleidung")
    return obj


def vereinfachen(obj, ziel):
    """Masken anwenden, auf ziel Dreiecke reduzieren, übrige Modifier (außer Skelett) entfernen."""
    aktiv(obj)
    for m in list(obj.modifiers):
        if m.type == "MASK":
            modifier_anwenden(obj, m.name)
    vorher = dreiecke(obj)
    if vorher > ziel:
        dec = obj.modifiers.new("Vereinfachen", "DECIMATE")
        dec.ratio = ziel / vorher
        modifier_anwenden(obj, dec.name)
    for m in list(obj.modifiers):
        if m.type != "ARMATURE":
            obj.modifiers.remove(m)
    aktiv(obj)
    bpy.ops.object.shade_smooth()
    return vorher


def erzeugen(name, werte, ordner):
    szene_leeren()
    makros = TargetService.get_default_macro_info_dict()
    makros.update(werte)
    koerper = HumanService.create_human(macro_detail_dict=makros)
    skelett = HumanService.add_builtin_rig(koerper, "game_engine")
    kleidung = []
    for stueck in KLEIDUNG.get(name, []):
        pfad = os.path.join(LocationService.get_user_data("clothes"), stueck, stueck + ".mhclo")
        if not os.path.isfile(pfad):
            print(f"[figuren] Kleidung fehlt: {pfad} (makehuman_system_assets einspielen)", flush=True)
            continue
        obj = HumanService.add_mhclo_asset(pfad, koerper, asset_type="Clothes", subdiv_levels=0)
        kleidung.append((stueck, obj))
    haare = []
    for haar in HAARE:
        pfad = os.path.join(LocationService.get_user_data("hair"), haar, haar + ".mhclo")
        if not os.path.isfile(pfad):
            print(f"[figuren] Frisur fehlt: {pfad}", flush=True)
            continue
        obj = HumanService.add_mhclo_asset(pfad, koerper, asset_type="Hair", subdiv_levels=0)
        haare.append((haar, obj))
        # Kopfhaut nicht wegschneiden: ohne Frisur soll der Kopf geschlossen bleiben.
        for m in list(koerper.modifiers):
            if m.type == "MASK" and haar in m.name:
                koerper.modifiers.remove(m)

    # Körperform fest einrechnen (Formschlüssel), Hilfsgeometrie entfernen, vereinfachen
    aktiv(koerper)
    if koerper.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(koerper.modifiers):
        if m.type == "MASK":
            modifier_anwenden(koerper, m.name)
    vorher = vereinfachen(koerper, ZIEL_DREIECKE)
    koerper.name = "Koerper"
    neutrales_material(koerper)

    teile = [koerper]
    for stueck in kleidung:
        teil = kleidung_vorbereiten(stueck)
        if teil is not None:
            teile.append(teil)

    # Höhe über alle Teile (Beine liegen unter der Kleidung, Schuhe bilden den Boden).
    zs = [(t.matrix_world @ v.co).z for t in teile for v in t.data.vertices]
    info = {
        "datei": name + ".glb",
        "kleidung": [k for k, _ in kleidung],
        "dreieckeGesamt": sum(dreiecke(t) for t in teile),
        "hoehe": round(max(zs) - min(zs), 4),
        "boden": round(min(zs), 4),
        "dreiecke": dreiecke(koerper),
        "dreieckeVorher": vorher,
        "knochen": len(skelett.data.bones),
        "kopf": kopf_messen(koerper),
        "makros": werte,
    }

    bpy.ops.object.select_all(action="DESELECT")
    for t in teile:
        t.select_set(True)
    skelett.select_set(True)
    bpy.context.view_layer.objects.active = skelett
    pfad = os.path.join(ordner, name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=pfad,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=False,
        export_morph=False,
        export_skins=True,
        export_yup=True,
    )
    info["groesseKB"] = round(os.path.getsize(pfad) / 1024)

    info["haare"] = {}
    for haar, obj in haare:
        if obj is None:
            continue
        for m in list(obj.modifiers):
            if m.type != "ARMATURE":
                obj.modifiers.remove(m)
        obj.name = "Haar_" + haar
        neutrales_material(obj, "Haar")
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        skelett.select_set(True)
        bpy.context.view_layer.objects.active = skelett
        hpfad = os.path.join(ordner, f"{name}__haar_{haar}.glb")
        bpy.ops.export_scene.gltf(filepath=hpfad, export_format="GLB", use_selection=True, export_apply=True,
                                  export_animations=False, export_morph=False, export_skins=True, export_yup=True)
        info["haare"][haar] = {"datei": os.path.basename(hpfad), "dreiecke": dreiecke(obj),
                               "groesseKB": round(os.path.getsize(hpfad) / 1024)}
    return info


def haar_texturen(ordner):
    """Strähnen-Form (Alpha) jeder Frisur als kleines Graubild ablegen."""
    import numpy as np
    ziel = os.path.join(ordner, "haare")
    os.makedirs(ziel, exist_ok=True)
    for haar in HAARE:
        quelle_ordner = os.path.join(LocationService.get_user_data("hair"), haar)
        pngs = [f for f in os.listdir(quelle_ordner) if f.lower().endswith(".png")] if os.path.isdir(quelle_ordner) else []
        if not pngs:
            continue
        bild = bpy.data.images.load(os.path.join(quelle_ordner, pngs[0]))
        w, h = bild.size
        px = np.empty(w * h * 4, dtype=np.float32)
        bild.pixels.foreach_get(px)
        alpha = px[3::4]
        grau = np.empty_like(px)
        grau[0::4] = alpha; grau[1::4] = alpha; grau[2::4] = alpha; grau[3::4] = 1.0
        neu = bpy.data.images.new("haar_" + haar, w, h, alpha=False)
        neu.pixels.foreach_set(grau)
        neu.scale(HAAR_TEXTUR_PX, HAAR_TEXTUR_PX)
        neu.filepath_raw = os.path.join(ziel, haar + ".png")
        neu.file_format = "PNG"
        neu.save()
        bpy.data.images.remove(bild)
        bpy.data.images.remove(neu)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ordner = os.path.abspath(args[0] if args else os.path.join(os.path.dirname(__file__), "..", "public", "assets", "figuren"))
    os.makedirs(ordner, exist_ok=True)
    ergebnis = {"quelle": "MPFB " + str(getattr(mpfb, "bl_info", {}).get("version", "")), "skelett": "game_engine",
                "haare": HAARE, "figuren": {}}
    haar_texturen(ordner)
    for name, werte in VARIANTEN.items():
        print(f"[figuren] erzeuge {name} …", flush=True)
        ergebnis["figuren"][name] = erzeugen(name, werte, ordner)
        print(f"[figuren] {name}: {ergebnis['figuren'][name]}", flush=True)
    with open(os.path.join(ordner, "figuren.json"), "w", encoding="utf-8") as f:
        json.dump(ergebnis, f, ensure_ascii=False, indent=2)
    print("[figuren] fertig:", ordner, flush=True)


main()
