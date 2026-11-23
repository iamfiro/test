"""PocketTime 3D 공부방(라운지 카페): 합치기 → UV 펼침 → 조명 베이크 → 언릿 GLB.

`build_study_room.py`로 씬을 만든 뒤 같은 Blender에서 실행한다(보통은
`export_study_assets.py -- room`이 둘을 이어서 돌린다).

    import runpy
    ns = runpy.run_path(".../bake_and_export.py", run_name="study_room_bake")
    ns["run_all"](out_glb=".../assets/study_themes/cafe_room_3d/study_room.glb")

앱 카메라는 내 자리 둘레(1인칭·3인칭·머리 위)라 사방 벽과 천장이 있는 닫힌 방을 내보낸다
(유리만 빼고 창을 열어 두어 밖의 잔디·나무·하늘이 보인다). 정적인 방이라 메시는 세 개로 합친다(드로우콜 최소).

결과 GLB 노드:
- `study_room`: 루트. 아래에
  - `room_shell`: 바닥·벽·창틀(재질 `study_room_shell`)
  (창은 열어 두어 유리 메시가 없다. 밖의 잔디·나무는 소품에 들어 있다.)
  - `room_props`: 가구·소품 전부(재질 `study_room_props`)
  - `seat_NN`: 자리(빈 노드). 위치 = 방석 윗면 가운데, 로컬 +Z = 앉은 사람이 보는 쪽.

재질은 두 개뿐이다(KHR_materials_unlit, 조명·그림자를 구운 텍스처).
"""

import math

import bmesh
import bpy

PREFIX = "sr_"
SHELL_BAKE = 4096
PROPS_BAKE = 4096  # 책상·의자 나뭇결이 보이게(2048로 줄여 내보낸다)
DOWNSAMPLE = 2  # 소품: 4096 베이크 → 2048
SHELL_DOWNSAMPLE = 4  # 껍데기: 4096 베이크 → 1024(그래픽을 낮춰 메모리·대역을 줄인다)
SAMPLES = 256


def _scene():
    return bpy.data.scenes["StudyRoom3D"]


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
    """앱에 내보낼 메시(실내용 벽·천장 제외)를 (껍데기, 유리, 소품, 바깥)으로 나눈다. 바깥(잔디·나무)은
    창으로 드는 볕을 가리지 않게 따로 합쳐 그림자를 끈다."""
    shell, glass, props, outdoors = [], [], [], []
    for ob in _scene().objects:
        if ob.type != "MESH" or ob.hide_render or ob.get("study_room_part") in ("interior", "cutaway"):
            continue
        if ob.name.endswith("_Glass"):
            glass.append(ob)
        elif not ob.visible_shadow:
            outdoors.append(ob)
        elif ob.get("study_room_part") in ("shell", "near"):
            shell.append(ob)
        else:
            props.append(ob)
    return shell, glass, props, outdoors


def _join(name, sources, coll):
    """[sources]를 월드 좌표로 구운 메시 하나로 합친다(재질 슬롯은 합집합)."""
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
    for p in me.polygons:
        p.use_smooth = False
    old = bpy.data.objects.get(name)
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def prepare():
    """앱 화면 구성으로 바꾸고, 합친 베이크 대상 셋을 만든다(원본은 렌더에서 숨긴다)."""
    import runpy
    import os

    build = runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "build_study_room.py"), run_name="study_room_build_lib")
    scene = _scene()
    build["set_view"](scene, "app")
    shell, glass, props, outdoors = _export_sources()
    coll = bpy.data.collections.get(PREFIX + "export") or bpy.data.collections.new(PREFIX + "export")
    if coll.name not in scene.collection.children:
        scene.collection.children.link(coll)
    joined_shell = _join("room_shell", shell, coll)
    joined_glass = _join("room_glass", glass, coll) if glass else None
    joined_props = _join("room_props", props, coll)
    joined_outdoors = _join("room_outdoors", outdoors, coll) if outdoors else None
    if joined_outdoors is not None:
        joined_outdoors.visible_shadow = False
    if joined_glass is not None:
        joined_glass.visible_shadow = False
    for ob in shell + glass + props + outdoors:
        ob.hide_render = True
        ob.hide_viewport = True
    return joined_shell, joined_glass, joined_props, joined_outdoors


def _unwrap(objects, margin):
    override = _view3d_override()
    _select_only(objects, objects[0])
    with bpy.context.temp_override(**override):
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
        bpy.ops.uv.select_all(action="SELECT")
        bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method="FRACTION", margin=margin, shape_method="CONCAVE")
        bpy.ops.object.mode_set(mode="OBJECT")


def _target_image(name, size):
    """베이크 대상: 선형 float(밝은 곳이 1을 넘어도 잘리지 않게, 톤 매핑은 [tonemap]이 한다)."""
    image = bpy.data.images.get(name)
    if image is not None:
        bpy.data.images.remove(image)
    return bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)


def _point_materials_at(objects, image):
    """베이크할 오브젝트 재질의 활성 노드를 [image]로 바꾼다."""
    for ob in objects:
        for m in ob.data.materials:
            nodes = m.node_tree.nodes
            node = nodes.get("sr_bake_target") or nodes.new("ShaderNodeTexImage")
            node.name = "sr_bake_target"
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
    for objects, size, name, margin in ((shell_objects, SHELL_BAKE, "bake_shell", 8), (props_objects, PROPS_BAKE, "bake_props", 4)):
        image = _target_image(PREFIX + name, size)
        _point_materials_at(objects, image)
        scene.render.bake.margin = margin
        _select_only(objects, objects[0])
        with bpy.context.temp_override(**override):
            bpy.ops.object.bake(type="COMBINED")
        images.append(image)
    return images


EXPOSURE = 0.85
SHOULDER = 0.8
SATURATION = 1.0


def soft_lighting():
    """앱용 조명: 따뜻한 오후. 천장이 위를 가린 채 북북동 창으로 해가 비스듬히 들어와
    바닥·테이블에 창 격자 모양 볕이 지고, 하늘빛(월드)이 열린 남·서쪽과 창으로 방을 채운다.
    전등 갓은 은은하게 켠다."""
    scene = _scene()
    for ob in scene.objects:
        if ob.type == "LIGHT":
            ob.hide_render = True
    sun_data = bpy.data.lights.new(PREFIX + "bake_sun", "SUN")
    sun_data.energy = 4.0
    sun_data.angle = math.radians(4)
    sun_data.color = (1.0, 0.86, 0.68)
    sun = bpy.data.objects.new("Bake_Sun", sun_data)
    # 북북동 창에서 남서쪽 아래로: 카메라 쪽(남)에서 비추면 그림자가 물건 뒤로 숨어 납작해 보인다.
    from mathutils import Vector

    sun.rotation_euler = Vector((-0.32, -0.72, -0.62)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun)
    # 천장 조명(넓은 면광원)으로 방 안을 고르게 채운다. 볕(해)은 그 위에 밝은 무늬로 남는다.
    fill = bpy.data.lights.new(PREFIX + "bake_fill", "AREA")
    fill.energy = 130
    fill.size = 3.2
    fill.color = (1.0, 0.93, 0.86)
    for k, (x, y) in enumerate([(2.0, 1.8), (5.4, 1.8), (8.8, 1.8), (12.6, 1.8), (2.0, 5.0), (5.4, 5.0), (8.8, 5.0), (12.6, 5.0), (13.2, 8.6), (13.2, 11.4)]):
        ob = bpy.data.objects.new(f"Bake_Fill_{k}", fill)
        ob.location = (x, y, 4.05)
        scene.collection.objects.link(ob)
    bg = next(n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (1.0, 0.93, 0.86, 1.0)
    bg.inputs["Strength"].default_value = 1.2
    for m in bpy.data.materials:
        if m.name.startswith(PREFIX + "src_lampglow"):
            b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            b.inputs["Emission Strength"].default_value = 3.0
        elif m.name == PREFIX + "src_glass":
            b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            b.inputs["Emission Strength"].default_value = 1.0


def tonemap(image, factor=DOWNSAMPLE, exposure=EXPOSURE, shoulder=SHOULDER, saturation=SATURATION):
    """선형 float 베이크 → 상자 필터로 1/factor 축소(노이즈 평균) → 노출·어깨(밝은 쪽만 부드럽게
    눌러 흰 벽이 날아가지 않게) → sRGB 8비트 이미지. 언릿이라 앱은 이 텍스처를 그대로 그린다."""
    import numpy as np

    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    small = px.reshape(h // factor, factor, w // factor, factor, 4).mean(axis=(1, 3)).reshape(-1, 4)
    c = np.clip(small[:, :3], 0.0, None) * exposure
    over = np.maximum(c - shoulder, 0.0)
    c = np.minimum(c, shoulder) + (1 - shoulder) * (1 - np.exp(-over / (1 - shoulder)))
    luma = (c @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))[:, None]
    c = np.clip(luma + saturation * (c - luma), 0.0, 1.0)
    c = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)
    small[:, :3] = c
    small[:, 3] = 1.0
    name = image.name + "_lo"
    old = bpy.data.images.get(name)
    if old is not None:
        bpy.data.images.remove(old)
    out = bpy.data.images.new(name, w // factor, h // factor, alpha=False, float_buffer=False)
    out.colorspace_settings.name = "sRGB"
    out.pixels.foreach_set(small.ravel())
    out.update()
    return out


def save_raw(images, cache_dir):
    """톤 매핑 전 선형 베이크를 EXR로 남긴다(다시 굽지 않고 색만 고칠 때)."""
    import os

    os.makedirs(cache_dir, exist_ok=True)
    for image in images:
        image.filepath_raw = os.path.join(cache_dir, image.name + ".exr")
        image.file_format = "OPEN_EXR"
        image.save()


def _unlit_material(name, image):
    """glTF 내보내기가 KHR_materials_unlit로 인식하는 형태: 이미지 → Background → 출력."""
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
    """`study_room` 루트 아래로 합친 메시와 자리 노드를 모은다."""
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


def export_glb(path, root, quality=88):
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
            export_jpeg_quality=quality,
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


def run_all(out_glb, samples=SAMPLES, cache_dir=None):
    shell, glass, props, outdoors = prepare()
    props_group = [props, outdoors] if outdoors is not None else [props]
    soft_lighting()
    shell_group = [shell, glass] if glass is not None else [shell]
    _unwrap(shell_group, 0.002)
    _unwrap(props_group, 0.004)
    shell_image, props_image = bake(shell_group, props_group, samples)
    if cache_dir:
        save_raw([shell_image, props_image], cache_dir)
    shell_lo, props_lo = tonemap(shell_image, factor=SHELL_DOWNSAMPLE), tonemap(props_image)
    assign_export_materials([(shell_group, "study_room_shell", shell_lo), (props_group, "study_room_props", props_lo)])
    root = arrange_for_export([*shell_group, *props_group])
    export_glb(out_glb, root)
    return stats(root)
