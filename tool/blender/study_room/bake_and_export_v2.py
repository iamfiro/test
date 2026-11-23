"""StudyVillage v2 공부방: 합치기 → UV → 조명 베이크 → 톤 → 언릿 GLB(`study_room_v2.glb`).

원본: PocketTime `tool/blender/study_room/bake_and_export.py`(f6865a86). 바뀐 점:
- 씬 `StudyRoomV2`, 오브젝트 구분은 `study_room_part`(shell·props·outdoors) 커스텀 속성.
- 합칠 때 법선을 평평하게 바꾸지 않는다(가구는 smooth + sharp edge로 둥근 모서리, 웹 셀 셰이딩용).
- 조명: 해가 남서쪽에서 창으로 들어와 바닥에 밝은 창 무늬, 스탠드·줄 전구 둘레 따뜻한 빛 번짐.
- 톤: 명암 대비를 키우고(밝은 볕·전구), 어두운 쪽은 회색 대신 푸른 보라(#B8A8C8 쪽)로 띄운다.
- 텍스처: 껍데기·소품 각 4096 베이크 → 2048(상자 필터로 노이즈 평균). 바닥 UV에 면적을 더 준다
  (줄눈 5cm가 텍스처에서 4px 이상).

결과 GLB 노드: `study_room` 아래 `room_shell`·`room_props`·`room_outdoors`(메시)와 `seat_NN`(빈 노드).
재질은 두 개(KHR_materials_unlit): `study_room_shell`, `study_room_props`(바깥도 소품 텍스처를 쓴다).
"""

import math
import os

import bmesh
import bpy
from mathutils import Vector

PREFIX = "sv2_"
SCENE = "StudyRoomV2"
BAKE = 4096
DOWNSAMPLE = 2  # 4096 → 2048
SAMPLES = 384

# 톤(선형 → sRGB). retone으로 다시 굽지 않고 바꿀 수 있다.
TONE = {
    # 굽기 결과(선형): 바닥 중앙값 0.85, 창 볕 1.9, 전구·갓 5 이상. 명도로 Reinhard(흰 점 white)를 걸어
    # 볕까지는 표시 0.9 아래에 두고 전구·갓만 하얗게 남긴다(웹 빛 번짐이 전구 둘레만 번지게).
    "exposure": 1.05,
    "white": 6.0,
    # 흰 균형: 따뜻한 해·오렌지 가구 반사광이 크림 벽까지 주황으로 물들이지 않게(웹이 따뜻한 색을 다시 더한다)
    "balance": (0.94, 0.99, 1.08),
    "saturation": 0.92,  # 웹 카툰 룩이 채도를 +25% 더한다
    # 어두운 쪽 물들이기: 선형 명도 shade_lo 이하에서 shade_mix만큼 푸른 보라로(명도는 유지)
    "shade_tint": "#B8A8C8",
    "shade_lo": 0.3,
    "shade_mix": 0.55,
    # 가장 어두운 곳 바닥(선형 명도, 푸른 보라). 검정·회갈색 금지.
    "floor": 0.08,
    # 표시 공간 명도 대비: 밝은 기준점 pivot 둘레로 contrast배(어두운 쪽이 내려가 명암 폭이 커진다)
    "pivot": 0.8,
    "contrast": 1.35,
}


def _scene():
    return bpy.data.scenes[SCENE]


def _view3d_override():
    if bpy.app.background:
        return {}
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == "VIEW_3D":
                region = next(r for r in area.regions if r.type == "WINDOW")
                return {"window": window, "area": area, "region": region}
    raise RuntimeError("3D 뷰포트가 열린 창이 필요합니다")


def _select_only(objects, active):
    for ob in _scene().objects:
        ob.select_set(False)
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = active


def _export_sources():
    shell, props, outdoors = [], [], []
    for ob in _scene().objects:
        if ob.type != "MESH" or ob.hide_render:
            continue
        part = ob.get("study_room_part")
        {"shell": shell, "props": props, "outdoors": outdoors}[part].append(ob)
    return shell, props, outdoors


def _join(name, sources, coll):
    """[sources]를 월드 좌표로 구운 메시 하나로 합친다(재질 슬롯 합집합, 매끈/날카로운 모서리 유지)."""
    mats = []
    bm = bmesh.new()
    for ob in sources:
        slot_map = []
        for slot in ob.data.materials:
            if slot not in mats:
                mats.append(slot)
            slot_map.append(mats.index(slot))
        t = bmesh.new()
        t.from_mesh(ob.data)
        bmesh.ops.transform(t, matrix=ob.matrix_world, verts=t.verts)
        for f in t.faces:
            f.material_index = slot_map[f.material_index] if slot_map else 0
        tmp = bpy.data.meshes.new("_join_tmp")
        t.to_mesh(tmp)
        t.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    me = bpy.data.meshes.new(PREFIX + name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    old = bpy.data.objects.get(name)
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def prepare():
    scene = _scene()
    # 백그라운드에서는 새로 놓은 오브젝트의 matrix_world가 갱신되지 않은 채라 합치기 전에 갱신한다.
    bpy.context.view_layer.update()
    shell, props, outdoors = _export_sources()
    coll = bpy.data.collections.get(PREFIX + "export") or bpy.data.collections.new(PREFIX + "export")
    if coll.name not in scene.collection.children:
        scene.collection.children.link(coll)
    joined = (_join("room_shell", shell, coll), _join("room_props", props, coll), _join("room_outdoors", outdoors, coll))
    joined[2].visible_shadow = False  # 창으로 드는 볕을 가리지 않게
    for ob in shell + props + outdoors:
        ob.hide_render = True
        ob.hide_viewport = True
    return joined


def _unwrap(objects, margin, boost=None):
    """스마트 UV → (선택) [boost] 면의 UV를 키움 → 한 장에 모아 담기."""
    override = _view3d_override()
    _select_only(objects, objects[0])
    with bpy.context.temp_override(**override):
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    if boost:
        for ob in objects:
            me = ob.data
            uv = me.uv_layers.active.data
            for poly in me.polygons:
                k = boost(ob, poly)
                if k != 1.0:
                    for li in poly.loop_indices:
                        uv[li].uv = uv[li].uv * k
    with bpy.context.temp_override(**override):
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.select_all(action="SELECT")
        bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method="FRACTION", margin=margin, shape_method="CONCAVE")
        bpy.ops.object.mode_set(mode="OBJECT")


def _shell_boost(ob, poly):
    """바닥 윗면은 텍스처 면적 1.7배, 보이지 않는 벽 바깥 면은 0.35배."""
    if ob.name != "room_shell":
        return 1.0
    m = ob.data.materials[poly.material_index]
    if m.name == PREFIX + "src_floor" and poly.normal.z > 0.5:
        return 1.7
    c = poly.center
    n = poly.normal
    outside = (c.y < -0.15 and n.y < -0.5) or (c.x < -0.15 and n.x < -0.5) or (c.x > 16.15 and n.x > 0.5) or (c.y > 12.85 and n.y > 0.5) \
        or (c.y > 6.95 and c.x < 10.25 and n.y > 0.5) or (c.x < 10.25 and c.y > 6.95 and n.x < -0.5)
    return 0.35 if outside else 1.0


def _target_image(name, size):
    image = bpy.data.images.get(name)
    if image is not None:
        bpy.data.images.remove(image)
    return bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)


def _point_materials_at(objects, image):
    for ob in objects:
        for m in ob.data.materials:
            nodes = m.node_tree.nodes
            node = nodes.get("sv2_bake_target") or nodes.new("ShaderNodeTexImage")
            node.name = "sv2_bake_target"
            node.image = image
            for n in nodes:
                n.select = False
            node.select = True
            nodes.active = node


def bake(shell_objects, props_objects, samples=SAMPLES):
    scene = _scene()
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.01
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.target = "IMAGE_TEXTURES"
    scene.render.bake.margin_type = "EXTEND"
    override = _view3d_override()
    images = []
    for objects, name, margin in ((shell_objects, "bake_shell", 8), (props_objects, "bake_props", 6)):
        image = _target_image(PREFIX + name, BAKE)
        _point_materials_at(objects, image)
        scene.render.bake.margin = margin
        _select_only(objects, objects[0])
        with bpy.context.temp_override(**override):
            bpy.ops.object.bake(type="COMBINED")
        images.append(image)
    return images


SUN_DIR = Vector((0.52, 0.66, -0.54)).normalized()  # 남서쪽 위에서 북동쪽 아래로


def lighting(scene):
    """굽기용 조명: 남서 해(창으로 드는 볕), 천장 면광원(고른 채움), 푸른 보라 하늘(그늘 색),
    스탠드·바닥 스탠드·줄 전구 둘레의 따뜻한 점광원(빛 번짐)."""
    for ob in list(scene.objects):
        if ob.type == "LIGHT":
            bpy.data.objects.remove(ob, do_unlink=True)

    def light(name, typ, loc, energy, color, size=None, radius=None):
        ld = bpy.data.lights.new(PREFIX + name, typ)
        ld.energy = energy
        ld.color = color
        if size is not None:
            ld.size = size
        if radius is not None:
            ld.shadow_soft_size = radius
        ob = bpy.data.objects.new(name, ld)
        ob.location = loc
        scene.collection.objects.link(ob)
        return ob

    sun = light("Bake_Sun", "SUN", (0, 0, 10), 4.6, (1.0, 0.93, 0.82))
    sun.data.angle = math.radians(2.5)
    sun.rotation_euler = SUN_DIR.to_track_quat("-Z", "Y").to_euler()
    for k, (x, y) in enumerate([(2.0, 1.8), (5.4, 1.8), (8.8, 1.8), (12.6, 1.8), (2.0, 5.0), (5.4, 5.0), (8.8, 5.0), (12.6, 5.0), (13.2, 8.6), (13.2, 11.4)]):
        ob = light(f"Bake_Fill_{k}", "AREA", (x, y, 3.85), 90, (1.0, 1.0, 1.0), size=3.0)
    # 스탠드 갓 안쪽(오브젝트 위치 기준)과 바닥 스탠드, 줄 전구.
    for ob in list(scene.objects):
        if ob.name.startswith("StudyLamp_"):
            p = ob.matrix_world @ Vector((0.18, 0, 0.25))
            light(f"PL_{ob.name}", "POINT", p, 14, (1.0, 0.82, 0.55), radius=0.04)
        elif ob.name.endswith("_FloorLamp"):
            p = ob.matrix_world @ Vector((0, 0, 1.36))
            light(f"PL_{ob.name}", "POINT", p, 70, (1.0, 0.8, 0.52), radius=0.1)
    runs = [((0.3, 6.68), (10.1, 6.68), 3.9), ((10.6, 12.58), (15.8, 12.58), 3.9), ((15.88, 0.3), (15.88, 12.4), 3.92)]
    for (x0, y0), (x1, y1), z in runs:
        n = max(2, int(math.hypot(x1 - x0, y1 - y0) / 1.2))
        for k in range(n + 1):
            t = k / n
            light(f"PL_Fairy_{x0}_{k}", "POINT", (x0 + (x1 - x0) * t - 0.05 * (x1 == x0), y0 + (y1 - y0) * t - 0.08 * (y1 == y0), z), 6,
                  (1.0, 0.85, 0.58), radius=0.06)
    world = scene.world or bpy.data.worlds.new(PREFIX + "world")
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.62, 0.66, 0.92, 1.0)  # 하늘(푸른 보라 그늘)
    bg.inputs["Strength"].default_value = 1.1
    for m in bpy.data.materials:
        if m.name in (PREFIX + "src_glow", PREFIX + "src_glow_soft"):
            b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            b.inputs["Emission Strength"].default_value = 9.0 if m.name.endswith("glow") else 3.0


def _srgb_to_lin(hx):
    h = hx.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def tone_pixels(px, tone=TONE):
    """선형 RGB(N×3) → sRGB(N×3). numpy 배열."""
    import numpy as np

    c = np.clip(px, 0.0, None) * tone["exposure"] * np.array(tone["balance"], dtype=np.float32)
    w3 = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    lum = np.maximum((c @ w3)[:, None], 1e-6)
    mapped = lum * (1 + lum / tone["white"] ** 2) / (1 + lum)
    c = c * (mapped / lum)
    luma = (c @ w3)[:, None]
    c = np.clip(luma + tone["saturation"] * (c - luma), 0.0, None)
    tint = np.array(_srgb_to_lin(tone["shade_tint"]), dtype=np.float32)
    tint_n = tint / float(tint @ w3)
    luma = (c @ w3)[:, None]
    wgt = np.clip((tone["shade_lo"] - luma) / tone["shade_lo"], 0.0, 1.0) * tone["shade_mix"]
    c = c * (1 - wgt) + luma * tint_n * wgt
    lift = np.clip(1.0 - (c @ w3)[:, None] / tone["floor"], 0.0, 1.0)
    c = c + lift * tone["floor"] * tint_n
    c = np.clip(c, 0.0, 1.0)
    s = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)
    # 대비는 명도에만(채널마다 걸면 채도가 같이 올라 전부 주황이 된다).
    ls = np.maximum((s @ w3)[:, None], 1e-4)
    target = np.clip(tone["pivot"] + tone["contrast"] * (ls - tone["pivot"]), 0.0, 1.0)
    return np.clip(s * (target / ls), 0.0, 1.0)


def tonemap(image, factor=DOWNSAMPLE, tone=TONE):
    import numpy as np

    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    small = px.reshape(h // factor, factor, w // factor, factor, 4).mean(axis=(1, 3)).reshape(-1, 4)
    out_px = np.ones_like(small)
    out_px[:, :3] = tone_pixels(small[:, :3], tone)
    name = image.name + "_lo"
    old = bpy.data.images.get(name)
    if old is not None:
        bpy.data.images.remove(old)
    out = bpy.data.images.new(name, w // factor, h // factor, alpha=False, float_buffer=False)
    out.colorspace_settings.name = "sRGB"
    out.pixels.foreach_set(out_px.ravel())
    out.update()
    return out


def save_raw(images, cache_dir):
    os.makedirs(cache_dir, exist_ok=True)
    for image in images:
        image.filepath_raw = os.path.join(cache_dir, image.name + ".exr")
        image.file_format = "OPEN_EXR"
        image.save()


def load_raw(cache_dir):
    out = []
    for name in ("bake_shell", "bake_props"):
        image = bpy.data.images.load(os.path.join(cache_dir, PREFIX + name + ".exr"), check_existing=False)
        image.name = PREFIX + name
        out.append(image)
    return out


def _unlit_material(name, image):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    background = nodes.new("ShaderNodeBackground")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Linear"
    links.new(tex.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs[0], out.inputs["Surface"])
    return m


def assign_export_materials(groups):
    for objects, name, image in groups:
        material = _unlit_material(name, image)
        for ob in objects:
            mesh = ob.data
            mesh.materials.clear()
            mesh.materials.append(material)
            for poly in mesh.polygons:
                poly.material_index = 0


def arrange_for_export(meshes):
    scene = _scene()
    root = bpy.data.objects.get("study_room")
    if root is not None:
        bpy.data.objects.remove(root, do_unlink=True)
    root = bpy.data.objects.new("study_room", None)
    meshes[0].users_collection[0].objects.link(root)
    seats = sorted((o for o in scene.objects if o.get("study_room_seat") is not None), key=lambda o: o["study_room_seat"])
    for ob in [*meshes, *seats]:
        bpy.context.view_layer.update()
        world = ob.matrix_world.copy()
        ob.parent = root
        ob.matrix_world = world
    return root


def _descendants(ob):
    out = [ob]
    for child in ob.children:
        out += _descendants(child)
    return out


def export_glb(path, root, quality=86):
    objects = _descendants(root)
    for ob in objects:
        ob.hide_viewport = False
        ob.hide_set(False)
    _select_only(objects, root)
    with bpy.context.temp_override(**_view3d_override()):
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            use_active_scene=True,
            export_yup=True,
            export_apply=False,
            export_texcoords=True,
            export_normals=True,
            export_tangents=False,
            export_vertex_color="NONE",
            export_materials="EXPORT",
            export_image_format="JPEG",
            export_image_quality=quality,
            export_cameras=False,
            export_lights=False,
            export_animations=False,
            export_extras=False,
            export_skins=False,
            export_morph=False,
        )


def stats(root):
    tris = {}
    for ob in _descendants(root):
        if ob.type == "MESH":
            ob.data.calc_loop_triangles()
            tris[ob.name] = len(ob.data.loop_triangles)
    return {"triangles": sum(tris.values()), "meshes": tris, "seats": sum(1 for o in _descendants(root) if o.name.startswith("seat_"))}


def run_all(out_glb, samples=SAMPLES, cache_dir=None, from_cache=False, tone=TONE):
    scene = _scene()
    shell, props, outdoors = prepare()
    lighting(scene)
    _unwrap([shell], 0.003, boost=_shell_boost)
    _unwrap([props, outdoors], 0.004)
    if from_cache:
        shell_image, props_image = load_raw(cache_dir)
    else:
        shell_image, props_image = bake([shell], [props, outdoors], samples)
        if cache_dir:
            save_raw([shell_image, props_image], cache_dir)
    shell_lo, props_lo = tonemap(shell_image, tone=tone), tonemap(props_image, tone=tone)
    assign_export_materials([([shell], "study_room_shell", shell_lo), ([props, outdoors], "study_room_props", props_lo)])
    root = arrange_for_export([shell, props, outdoors])
    export_glb(out_glb, root)
    return stats(root)
