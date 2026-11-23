"""v2 가구 프로토타입 5종(공용 테이블+의자, 개인 책상, 소파, 안락의자, 큰 화분)을 한 장에 찍는다.

열린 Blender에서:
    import runpy; runpy.run_path(r".../tool/blender/study_room/preview_prototypes.py")["run"](out_png)

씬 "StudyRoomV2_Proto"만 비우고 다시 만든다(다른 씬은 건드리지 않는다). 확인용 미리보기이며 앱용
조명(베이크)이 아니다. 그림자 색은 웹 셰이더처럼 푸른 보라로 들뜨게 월드 색을 둔다.
"""

import math
import os
import runpy

import bpy
from mathutils import Vector

_HERE = os.path.dirname(os.path.abspath(__file__))
kit = runpy.run_path(os.path.join(_HERE, "cozy_kit.py"), run_name="cozy_kit")

SCENE = "StudyRoomV2_Proto"


def _scene():
    sc = bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE)
    if bpy.context.window is not None:
        bpy.context.window.scene = sc
    for ob in list(sc.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    return sc


def _inst(sc, me, name, loc, rz=0.0):
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = (0, 0, math.radians(rz))
    sc.collection.objects.link(ob)
    return ob


def build(sc):
    MB = kit["MB"]
    stats = {}
    meshes = {
        "chair_coral": kit["cafe_chair"]("p_chair_coral", "coral"),
        "chair_butter": kit["cafe_chair"]("p_chair_butter", "butter"),
        "chair_sage": kit["cafe_chair"]("p_chair_sage", "sage"),
        "table": kit["communal_table"]("p_table", length=2.4),
        "desk": kit["study_desk"]("p_desk"),
        "lamp": kit["desk_lamp"]("p_lamp"),
        "sofa": kit["sofa"]("p_sofa", "coral", "coral_deep", pillows=((-0.62, "butter", 10), (0.64, "sage", -8))),
        "armchair": kit["armchair"]("p_armchair", "butter", "butter_deep", pillow="coral"),
        "plant": kit["big_plant"]("p_plant", 7),
    }
    for k, me in meshes.items():
        stats[k] = kit["tris"](me)
    # 바닥·벽(색 대비 확인용: 따뜻한 타일 바닥 + 크림 벽)
    floor = MB().box((12, 6, 0.1), (0, 0, -0.05), "floor_tile", r=0.0, segs=0)
    for i in range(-7, 8):
        floor.box((0.05, 6, 0.004), (i * 0.8, 0, 0.002), "grout", r=0, segs=0)
    for j in range(-3, 4):
        floor.box((12, 0.05, 0.004), (0, j * 0.8, 0.002), "grout", r=0, segs=0)
    _inst(sc, floor.mesh("p_floor"), "Floor", (0, 1.0, 0))
    _inst(sc, MB().box((12, 0.2, 3.0), (0, 0, 1.5), "cream", r=0, segs=0).mesh("p_wall"), "Wall", (0, 4.0, 0))
    # 그룹: 공용 테이블(짧게 2.4m) + 의자 넷(원본처럼 테이블 중심에서 ±0.9m)
    tx, ty = -2.9, 1.5
    _inst(sc, meshes["table"], "Table", (tx, ty, 0))
    for i, (dx, col) in enumerate(((-0.55, "chair_coral"), (0.55, "chair_butter"))):
        _inst(sc, meshes[col], f"ChairN{i}", (tx + dx, ty + 0.9, 0), 180)
        _inst(sc, meshes["chair_sage" if i else "chair_coral"], f"ChairS{i}", (tx + dx, ty - 0.9, 0), 0)
    # 개인 책상 + 의자 + 스탠드(원본: 책상 y, 의자 y+0.6, 회전 180)
    _inst(sc, meshes["desk"], "Desk", (-0.6, 2.4, 0), 180)
    _inst(sc, meshes["chair_butter"], "DeskChair", (-0.6, 1.8, 0), 0)
    _inst(sc, meshes["lamp"], "Lamp", (-0.98, 2.52, 0.76), 200)
    _inst(sc, meshes["sofa"], "Sofa", (1.8, 2.7, 0), 180)
    _inst(sc, meshes["armchair"], "Armchair", (3.9, 2.2, 0), 200)
    _inst(sc, meshes["plant"], "Plant", (4.8, 3.2, 0))
    return stats


def light(sc):
    world = sc.world or bpy.data.worlds.new("sv2_proto_world")
    sc.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*kit["srgb_to_linear"]("#B8A8C8"), 1)  # 푸른 보라 그림자
    bg.inputs["Strength"].default_value = 1.1
    sd = bpy.data.lights.get("sv2_proto_sun") or bpy.data.lights.new("sv2_proto_sun", "SUN")
    sd.energy = 3.2
    sd.angle = math.radians(6)
    sd.color = (1.0, 0.92, 0.8)
    sun = bpy.data.objects.new("Sun", sd)
    # 해는 남서쪽 위에서(카메라 왼쪽 앞).
    sun.rotation_euler = Vector((0.55, 0.6, -0.6)).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(sun)
    cd = bpy.data.cameras.get("sv2_proto_cam") or bpy.data.cameras.new("sv2_proto_cam")
    cd.lens = 24
    cam = bpy.data.objects.new("Proto_Camera", cd)
    target, loc = Vector((0.1, 2.0, 0.45)), Vector((0.1, -3.9, 3.3))
    cam.location = loc
    cam.rotation_euler = (target - loc).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(cam)
    sc.camera = cam
    try:
        sc.render.engine = "BLENDER_EEVEE"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.view_settings.view_transform = "Standard"
    sc.render.resolution_x, sc.render.resolution_y = 1600, 900
    sc.render.film_transparent = False


def run(out_png=None):
    sc = _scene()
    stats = build(sc)
    light(sc)
    if out_png:
        sc.render.filepath = out_png
        bpy.ops.render.render(write_still=True, scene=sc.name)
    return stats
