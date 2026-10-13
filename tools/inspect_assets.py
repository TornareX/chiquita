"""Liste le contenu du FBX du pack padel : objets, dimensions, matériaux, textures.

Usage : blender --background --python tools/inspect_assets.py -- <chemin du FBX>
"""

import sys

import bpy
from mathutils import Vector

fbx_path = sys.argv[sys.argv.index("--") + 1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx_path)

print("UNITS", bpy.context.scene.unit_settings.system, bpy.context.scene.unit_settings.scale_length)
for obj in sorted(bpy.data.objects, key=lambda o: o.name):
    if obj.type != "MESH":
        print(f"OBJ {obj.name} type={obj.type}")
        continue
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    size = hi - lo
    materials = [slot.material.name if slot.material else "-" for slot in obj.material_slots]
    print(
        f"OBJ {obj.name} parent={obj.parent.name if obj.parent else '-'} "
        f"verts={len(obj.data.vertices)} polys={len(obj.data.polygons)} "
        f"min=({lo.x:.3f},{lo.y:.3f},{lo.z:.3f}) max=({hi.x:.3f},{hi.y:.3f},{hi.z:.3f}) "
        f"size=({size.x:.3f},{size.y:.3f},{size.z:.3f}) "
        f"scale=({obj.scale.x:.3f},{obj.scale.y:.3f},{obj.scale.z:.3f}) uv={len(obj.data.uv_layers)} "
        f"mats={materials}"
    )

for mat in sorted(bpy.data.materials, key=lambda m: m.name):
    color = tuple(round(c, 3) for c in mat.diffuse_color)
    images = []
    if mat.node_tree:
        images = [n.image.filepath for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
    print(f"MAT {mat.name} color={color} images={images}")

# Emprise de chaque matériau dans le monde, pour situer le sol, les lignes, les vitres…
for obj in bpy.data.objects:
    if obj.type != "MESH" or len(obj.material_slots) < 3:
        continue
    boxes = {}
    for poly in obj.data.polygons:
        box = boxes.setdefault(poly.material_index, [Vector((1e9,) * 3), Vector((-1e9,) * 3)])
        for index in poly.vertices:
            p = obj.matrix_world @ obj.data.vertices[index].co
            for axis in range(3):
                box[0][axis] = min(box[0][axis], p[axis])
                box[1][axis] = max(box[1][axis], p[axis])
    for index, (lo, hi) in sorted(boxes.items()):
        print(
            f"MATBOX {obj.name} {obj.material_slots[index].name} "
            f"min=({lo.x:.3f},{lo.y:.3f},{lo.z:.3f}) max=({hi.x:.3f},{hi.y:.3f},{hi.z:.3f})"
        )

# Repère local des petits objets (raquettes, balles) : emprise locale et rotation.
for obj in sorted(bpy.data.objects, key=lambda o: o.name):
    if obj.type != "MESH" or len(obj.data.vertices) > 5000:
        continue
    xs = [v.co for v in obj.data.vertices]
    lo = [min(c[a] for c in xs) for a in range(3)]
    hi = [max(c[a] for c in xs) for a in range(3)]
    rot = tuple(round(a, 3) for a in obj.rotation_euler)
    print(
        f"LOCAL {obj.name} min=({lo[0]:.1f},{lo[1]:.1f},{lo[2]:.1f}) max=({hi[0]:.1f},{hi[1]:.1f},{hi[2]:.1f}) "
        f"rot={rot} loc=({obj.location.x:.3f},{obj.location.y:.3f},{obj.location.z:.3f})"
    )

# Répartition des polygones par matériau, pour repérer à quoi sert chacun.
for obj in bpy.data.objects:
    if obj.type != "MESH" or len(obj.material_slots) < 2:
        continue
    counts = {}
    for poly in obj.data.polygons:
        counts[poly.material_index] = counts.get(poly.material_index, 0) + 1
    print(f"POLYS {obj.name} " + " ".join(f"{obj.material_slots[i].name}:{n}" for i, n in sorted(counts.items())))
