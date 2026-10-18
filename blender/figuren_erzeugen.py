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

# Zielgröße je Figur (Dreiecke). 12 Figuren × 6000 sind auch für Tablets wenig.
ZIEL_DREIECKE = 6000

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


def neutrales_material(obj):
    mat = bpy.data.materials.new("Figur")
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


def erzeugen(name, werte, ordner):
    szene_leeren()
    makros = TargetService.get_default_macro_info_dict()
    makros.update(werte)
    koerper = HumanService.create_human(macro_detail_dict=makros)
    skelett = HumanService.add_builtin_rig(koerper, "game_engine")

    # Körperform fest einrechnen (Formschlüssel), Hilfsgeometrie entfernen, vereinfachen
    aktiv(koerper)
    if koerper.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(koerper.modifiers):
        if m.type == "MASK":
            modifier_anwenden(koerper, m.name)
    vorher = dreiecke(koerper)
    if vorher > ZIEL_DREIECKE:
        dec = koerper.modifiers.new("Vereinfachen", "DECIMATE")
        dec.ratio = ZIEL_DREIECKE / vorher
        modifier_anwenden(koerper, dec.name)
    for m in list(koerper.modifiers):
        if m.type not in ("ARMATURE",):
            koerper.modifiers.remove(m)
    aktiv(koerper)
    bpy.ops.object.shade_smooth()
    neutrales_material(koerper)

    zs = [(koerper.matrix_world @ v.co).z for v in koerper.data.vertices]
    info = {
        "datei": name + ".glb",
        "hoehe": round(max(zs) - min(zs), 4),
        "boden": round(min(zs), 4),
        "dreiecke": dreiecke(koerper),
        "dreieckeVorher": vorher,
        "knochen": len(skelett.data.bones),
        "kopf": kopf_messen(koerper),
        "makros": werte,
    }

    bpy.ops.object.select_all(action="DESELECT")
    koerper.select_set(True)
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
    return info


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ordner = os.path.abspath(args[0] if args else os.path.join(os.path.dirname(__file__), "..", "public", "assets", "figuren"))
    os.makedirs(ordner, exist_ok=True)
    ergebnis = {"quelle": "MPFB " + str(getattr(mpfb, "bl_info", {}).get("version", "")), "skelett": "game_engine", "figuren": {}}
    for name, werte in VARIANTEN.items():
        print(f"[figuren] erzeuge {name} …", flush=True)
        ergebnis["figuren"][name] = erzeugen(name, werte, ordner)
        print(f"[figuren] {name}: {ergebnis['figuren'][name]}", flush=True)
    with open(os.path.join(ordner, "figuren.json"), "w", encoding="utf-8") as f:
        json.dump(ergebnis, f, ensure_ascii=False, indent=2)
    print("[figuren] fertig:", ordner, flush=True)


main()
