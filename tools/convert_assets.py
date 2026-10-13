"""Convertit le FBX du pack padel en court.glb, racket.glb et ball.glb.

Usage :
  blender --background --python tools/convert_assets.py -- <FBX> <dossier des textures> <dossier de sortie>

Le pack est en centimètres (objets à l'échelle 0,01) et Z vers le haut ; l'export glTF passe en
mètres, Y vers le haut. Le terrain est recentré sur le centre du filet et tourné pour que sa
longueur soit sur l'axe Z du jeu. Les textures sont réduites et rebranchées à la main : le FBX
ne garde que des références à des maps procédurales de 3ds Max.
"""

import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

fbx_path, texture_dir, out_dir = sys.argv[sys.argv.index("--") + 1 :][:3]
os.makedirs(out_dir, exist_ok=True)

# Dimensions du jeu (src/sim/constants.ts).
COURT_LENGTH = 20.0
COURT_WIDTH = 10.0
BALL_RADIUS = 0.0325

COURT, BALL, RACKET = "Padel007", "Padel000", "Padel010"
GROUND, LINES = "Material #37", "Material #39"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx_path)
scene = bpy.context.scene
# Les textures enregistrées ne doivent pas subir la transformation de vue du rendu.
scene.view_settings.view_transform = "Standard"


# --- Textures -------------------------------------------------------------------------------


def load_pixels(filename, max_size, non_color=False):
    """Charge une image du pack, la réduit et retourne (largeur, hauteur, pixels RGBA à plat)."""
    image = bpy.data.images.load(os.path.join(texture_dir, filename))
    if non_color:
        image.colorspace_settings.name = "Non-Color"
    width, height = image.size
    factor = min(1.0, max_size / max(width, height))
    width, height = max(1, round(width * factor)), max(1, round(height * factor))
    image.scale(width, height)
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return width, height, pixels


def make_texture(name, color_file=None, alpha_file=None, max_size=2048):
    """Crée une image empaquetée : couleur du pack (ou blanc) et, si demandé, opacité dans l'alpha."""
    source = color_file or alpha_file
    width, height, pixels = load_pixels(source, max_size, non_color=color_file is None)
    if color_file is None:
        alpha = pixels[0::4].copy()
        pixels[:] = 1.0
        pixels[3::4] = alpha
    elif alpha_file is not None:
        alpha_width, alpha_height, alpha = load_pixels(alpha_file, max_size, non_color=True)
        if (alpha_width, alpha_height) != (width, height):
            raise RuntimeError(f"{color_file} et {alpha_file} n'ont pas les mêmes proportions")
        pixels[3::4] = alpha[0::4]
    else:
        pixels[3::4] = 1.0

    has_alpha = alpha_file is not None
    image = bpy.data.images.new(name, width, height, alpha=has_alpha)
    image.pixels.foreach_set(pixels)
    # Écrit sur disque puis empaquette : l'export glTF reprend le fichier tel quel.
    path = os.path.join(out_dir, f"_{name}.{'png' if has_alpha else 'jpg'}")
    settings = scene.render.image_settings
    settings.file_format = "PNG" if has_alpha else "JPEG"
    settings.color_mode = "RGBA" if has_alpha else "RGB"
    settings.quality = 85
    image.save_render(path, scene=scene)
    bpy.data.images.remove(image)
    saved = bpy.data.images.load(path)
    saved.pack()
    print(f"TEXTURE {name} {width}x{height} {os.path.getsize(path) // 1024} Ko")
    return saved, path


# --- Matériaux ------------------------------------------------------------------------------


def make_material(name, color=(0.8, 0.8, 0.8), image=None, alpha=1.0, roughness=0.7, metallic=0.0, emission=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Alpha"].default_value = alpha
    if emission > 0:
        bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    transparent = alpha < 1.0
    if image is not None:
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = image
        material.node_tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
        if image.depth == 32:
            material.node_tree.links.new(texture.outputs["Alpha"], bsdf.inputs["Alpha"])
            transparent = True
    if transparent:
        material.surface_render_method = "BLENDED"
    return material


temp_files = []


def texture(*args, **kwargs):
    image, path = make_texture(*args, **kwargs)
    temp_files.append(path)
    return image


materials = {
    # Terrain.
    "Material #21": make_material("structure", color=(0.03, 0.03, 0.035), roughness=0.5, metallic=0.6),
    "Material #20": make_material("vitre", color=(0.75, 0.9, 0.95), alpha=0.14, roughness=0.05),
    "Material #22": make_material(
        "grillage", image=texture("grillage", "reshetka_dif.jpg", "reshetka_Opacity.jpg", 1024), metallic=0.5
    ),
    "Material #23": make_material("filet", image=texture("filet", None, "setka_opasyti.jpg", 1024)),
    "Material #38": make_material("filet_bas", color=(0.9, 0.9, 0.9)),
    "Fabric Cotton Lampshade": make_material("filet_bande", color=(0.95, 0.95, 0.95)),
    GROUND: make_material("sol", image=texture("sol", "ground_dif.jpg", None, 2048), roughness=0.95),
    "Material #41": make_material("projecteur", color=(0.02, 0.02, 0.02)),
    "Material #42": make_material("projecteur_verre", color=(1.0, 0.97, 0.9), emission=1.5),
    "Material #115": make_material("accessoire", color=(0.06, 0.06, 0.06)),
    # Balle.
    "Material #103": make_material("balle", color=(0.79, 0.9, 0.12), roughness=0.95),
    "Material #102": make_material("gomme", color=(0.85, 0.85, 0.82), roughness=0.8),
    # Raquette.
    "Material #101": make_material(
        "raquette", image=texture("raquette", "raketka.jpg", "raketka_opasyti.jpg", 1024), roughness=0.45
    ),
}


def assign_materials(obj):
    for slot in obj.material_slots:
        if slot.material and slot.material.name in materials:
            slot.material = materials[slot.material.name]


# --- Géométrie ------------------------------------------------------------------------------


def world_points(obj, material_name=None):
    index = None
    if material_name is not None:
        index = next(i for i, slot in enumerate(obj.material_slots) if slot.material.name == material_name)
    ids = set()
    for poly in obj.data.polygons:
        if index is None or poly.material_index == index:
            ids.update(poly.vertices)
    return np.array([obj.matrix_world @ obj.data.vertices[i].co for i in ids])


def apply_transform(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def export(obj, name):
    assign_materials(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    path = os.path.join(out_dir, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_image_format="AUTO",
        export_jpeg_quality=85,
        export_animations=False,
    )
    size = [round(d, 3) for d in obj.dimensions]
    print(f"EXPORT {name}.glb {os.path.getsize(path) // 1024} Ko dimensions Blender {size}")


# Terrain : le sol du modèle donne le centre et l'orientation du terrain de jeu.
court = bpy.data.objects[COURT]
ground = world_points(court, GROUND)
lo, hi = ground.min(axis=0), ground.max(axis=0)
length, width = hi[0] - lo[0], hi[1] - lo[1]
print(f"COURT sol {length:.3f} x {width:.3f} m, centre ({(lo[0] + hi[0]) / 2:.3f}, {(lo[1] + hi[1]) / 2:.3f})")
if abs(length - COURT_LENGTH) > 0.05 or abs(width - COURT_WIDTH) > 0.05:
    raise RuntimeError("Le sol du modèle ne fait pas 20 m x 10 m : alignement FIP impossible")
center = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, hi[2]))
# Longueur du modèle (X de Blender) -> axe Z du jeu (-Y de Blender après export).
court.matrix_world = Matrix.Rotation(math.radians(90), 4, "Z") @ Matrix.Translation(-center) @ court.matrix_world
apply_transform(court)

# Les lignes du modèle ne sont pas aux cotes FIP (service à 6,4 m au lieu de 6,95 m) :
# on les retire, le jeu dessine les siennes.
line_index = next(i for i, slot in enumerate(court.material_slots) if slot.material.name == LINES)
mesh = bmesh.new()
mesh.from_mesh(court.data)
bmesh.ops.delete(mesh, geom=[f for f in mesh.faces if f.material_index == line_index], context="FACES")
mesh.to_mesh(court.data)
mesh.free()
export(court, "court")

# Balle : centrée sur l'origine, au rayon exact du jeu.
ball = bpy.data.objects[BALL]
ball.location = (0, 0, 0)
apply_transform(ball)
ball.scale = (BALL_RADIUS / (max(ball.dimensions) / 2),) * 3
apply_transform(ball)
export(ball, "ball")

# Raquette : axes principaux -> manche vers le bas le long de Z (Y du jeu), tamis face à Y de
# Blender (Z du jeu), origine au bout du manche.
racket = bpy.data.objects[RACKET]
points = world_points(racket)
mean = points.mean(axis=0)
_, vectors = np.linalg.eigh(np.cov((points - mean).T))
thick_axis, width_axis, long_axis = vectors[:, 0], vectors[:, 1], vectors[:, 2]
along = (points - mean) @ long_axis
across = (points - mean) @ width_axis
span = along.max() - along.min()
low_end = across[along < along.min() + 0.15 * span].std()
high_end = across[along > along.max() - 0.15 * span].std()
if high_end < low_end:
    # Le manche (bout étroit) doit être du côté des petites valeurs.
    long_axis = -long_axis
    along = -along
rotation = np.array([width_axis, thick_axis, long_axis])
if np.linalg.det(rotation) < 0:
    rotation[0] = -rotation[0]
matrix = Matrix.Identity(4)
for row in range(3):
    for col in range(3):
        matrix[row][col] = rotation[row][col]
offset = -(rotation @ mean)
matrix[0][3], matrix[1][3], matrix[2][3] = offset[0], offset[1], offset[2] - along.min()
racket.matrix_world = matrix @ racket.matrix_world
apply_transform(racket)
export(racket, "racket")

for path in temp_files:
    os.remove(path)
