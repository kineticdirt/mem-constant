# Blender 3.x+ — run from Blender: Scripting → Open → Run Script
# Plane = map template; curves = wireframe highways traced from green+black art.
import bpy
from pathlib import Path

MAP_DIR = Path(r"C:/Users/abhinav/Desktop/MAIN_PROGRAMMING_FILES/agent-dump/campaigns/tropic-gooner/map")
TEX = MAP_DIR / "master-enhanced.png"
SVG = MAP_DIR / "highways-wireframe.svg"

# Clear mesh objects
for obj in list(bpy.data.objects):
    if obj.type in {"MESH", "CURVE"}:
        bpy.data.objects.remove(obj, do_unlink=True)

# Plane sized to image aspect (width=10 Blender units)
bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0))
plane = bpy.context.active_object
plane.name = "IslaPrimavera_MapPlane"
aspect = 4176 / 4096
plane.scale = (1.0, aspect, 1.0)

mat = bpy.data.materials.new("MapTerrain")
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
out_n = nt.nodes.new("ShaderNodeOutputMaterial")
bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(str(TEX))
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
nt.links.new(bsdf.outputs["BSDF"], out_n.inputs["Surface"])
plane.data.materials.append(mat)

# Wireframe overlay plane (expanded same size, slightly above)
WIRE = MAP_DIR / "highways-wireframe.png"
bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0.02))
wire = bpy.context.active_object
wire.name = "Hwy_Wireframe_Overlay"
wire.scale = (1.0, aspect, 1.0)
wmat = bpy.data.materials.new("HwyWireframe")
wmat.use_nodes = True
wmat.blend_method = "BLEND"
wnt = wmat.node_tree
wnt.nodes.clear()
wout = wnt.nodes.new("ShaderNodeOutputMaterial")
wbsdf = wnt.nodes.new("ShaderNodeBsdfPrincipled")
wtex = wnt.nodes.new("ShaderNodeTexImage")
if WIRE.exists():
    wtex.image = bpy.data.images.load(str(WIRE))
    wtex.image.alpha_mode = "STRAIGHT"
wnt.links.new(wtex.outputs["Color"], wbsdf.inputs["Base Color"])
wnt.links.new(wtex.outputs["Alpha"], wbsdf.inputs["Alpha"])
wnt.links.new(wbsdf.outputs["BSDF"], wout.inputs["Surface"])
wire.data.materials.append(wmat)

print("Done: map plane + wireframe overlay. Template = master-enhanced; roads = highways-wireframe.png")
