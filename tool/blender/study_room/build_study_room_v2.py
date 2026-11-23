"""StudyVillage v2 카툰 카페 공부방 생성 스크립트.

원본: PocketTime `tool/blender/study_room/build_study_room.py`(파일 마지막 변경 f6865a86, 복사 시점 f574f242).
평면도·벽·창 구멍·좌표계·자리 표는 원본 그대로이고, 가구·소품·색은 `cozy_kit.py`로 새로 만든다.

Blender 5.x. 씬 "StudyRoomV2"만 비우고 다시 만든다. 베이크·내보내기는 `bake_and_export_v2.py`
(`export_study_assets_v2.py`가 둘을 이어서 돌린다).

좌표(블렌더, Z 위, m): +X 동, +Y 북, 원점은 큰 홀 남서쪽 안쪽 모서리. 큰 홀 X 0–16 · Y 0–6.8,
북동 날개 X 10.4–16 · Y 6.8–12.7, 천장 4.2m. glTF(Y 위)로 내보내면 블렌더 +Y → glTF -Z.

자리(`seat_NN`): 웹 `frontend/src/feature/study/room3d/scenes.ts`의 `cafeSeats`(원본 SEATS와 같은 값)를
그대로 옮겨 빈 노드로 둔다. 가구는 자리에서 거꾸로 놓는다(자리 = 가구 위치 + 회전 × 자리 로컬 좌표).
그래서 가구를 바꿔도 자리 위치·방향은 표와 같다.
"""

import math
import os
import random
import runpy

import bmesh
import bpy
from mathutils import Matrix, Vector

_HERE = os.path.dirname(os.path.abspath(__file__))
K = runpy.run_path(os.path.join(_HERE, "cozy_kit.py"), run_name="cozy_kit")
MB, mat = K["MB"], K["mat"]

SCENE_NAME = "StudyRoomV2"
PREFIX = K["PREFIX"]
ROOM_H = 4.2

# ---------------------------------------------------------------------------
# 자리 표: cafeSeats(glTF 좌표 x, y, z, yaw). 블렌더 = (x, -z, y), 회전 z = yaw.
# 종류: 가구 원형 이름과 그 가구 로컬의 자리 좌표.

SEATS = [
    (4.825, 0.49, -4.28, -0.048), (4.825, 0.49, -2.51, -3.0943), (5.89, 0.49, -4.28, 0.1178), (5.979, 0.49, -2.503, -3.1134),
    (3.807, 0.49, -4.28, -0.0771), (3.8, 0.49, -2.501, -3.07), (6.964, 0.49, -4.28, -0.1185), (7.005, 0.49, -2.473, 3.0659),
    (2.729, 0.49, -4.28, 0.0146), (2.776, 0.49, -2.493, -3.1397), (8.039, 0.49, -4.28, -0.1148), (8.062, 0.49, -2.492, -3.0579),
    (5.562, 0.49, -0.9, 0.1275), (4.413, 0.49, -0.9, 0.0183), (6.75, 0.49, -0.9, 0.0587), (2.584, 0.49, -0.9, -0.071),
    (7.939, 0.49, -0.9, -0.138), (1.298, 0.49, -0.9, 0.0495), (9.154, 0.49, -0.9, 0.153),
    (13.6, 0.415, -5.67, 0.0), (14.213, 0.415, -5.67, 0.0), (12.987, 0.415, -5.67, 0.0),
    (12.259, 0.48, -4.56, 1.7453), (14.94, 0.48, -4.545, -1.4835),
    (13.3, 0.415, -2.15, 0.0), (13.913, 0.415, -2.15, 0.0), (12.687, 0.415, -2.15, 0.0),
    (12.0, 0.415, -1.15, 1.5708), (14.6, 0.415, -1.15, -1.5708),
    (13.45, 0.415, -8.65, 0.0), (15.0, 0.48, -8.59, 0.0),
    (0.67, 0.415, -2.6, 1.5708), (0.67, 0.415, -4.35, 1.5708),
]


def seat_world(i):
    x, y, z, yaw = SEATS[i]
    return Vector((x, -z, y)), yaw


# ---------------------------------------------------------------------------
# 씬


def reset_scene():
    scene = bpy.data.scenes.get(SCENE_NAME)
    window = bpy.context.window
    if scene is None:
        if window is None:
            scene = bpy.context.scene
            scene.name = SCENE_NAME
        else:
            scene = bpy.data.scenes.new(SCENE_NAME)
    if window is not None:
        window.scene = scene
    for ob in list(scene.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for blocks in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras):
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)
    return scene


class Builder:
    def __init__(self, scene):
        self.scene = scene
        self.colls = {}
        self.protos = {}

    def coll(self, name):
        c = self.colls.get(name)
        if c is None:
            full = f"{PREFIX}{name}"
            c = bpy.data.collections.get(full) or bpy.data.collections.new(full)
            if c.name not in self.scene.collection.children:
                self.scene.collection.children.link(c)
            self.colls[name] = c
        return c

    def proto(self, key, make):
        """같은 원형은 한 번만 만든다."""
        me = self.protos.get(key)
        if me is None:
            me = make()
            self.protos[key] = me
        return me

    def inst(self, me, name, loc, rz=0.0, coll="decor", part="props"):
        ob = bpy.data.objects.new(name, me)
        ob.location = loc
        ob.rotation_euler = (0, 0, math.radians(rz))
        self.coll(coll).objects.link(ob)
        ob["study_room_part"] = part
        return ob

    def at_seat(self, me, name, seat, local, coll):
        """자리 [seat]의 방석 윗면이 가구 로컬 [local]에 오도록 가구를 놓는다."""
        w, yaw = seat_world(seat)
        rz = yaw - math.pi
        if abs(w.z - local[2]) > 1e-3:
            raise ValueError(f"seat_{seat:02d} 높이 {w.z} ≠ 가구 방석 {local[2]}")
        off = Matrix.Rotation(rz, 3, "Z") @ Vector((local[0], local[1], 0))
        ob = self.inst(me, name, (w.x - off.x, w.y - off.y, 0), coll=coll)
        ob.rotation_euler = (0, 0, rz)
        return ob


# ---------------------------------------------------------------------------
# 건축: 바닥·벽·창·천장(원본 평면도·창 구멍 그대로)


def _wall(b, name, axis, fixed, a, c_end, height, openings, inward, t=0.2):
    """벽 한 면(창 구멍·창틀·걸레받이·아랫벽 띠 포함). axis 'x'면 X로 뻗고 Y=fixed. inward: 방 안쪽 방향 부호."""
    mw = MB()
    P = (lambda u, n, z: (u, fixed + n, z)) if axis == "x" else (lambda u, n, z: (fixed + n, u, z))
    S = (lambda su, sn, sz: (su, sn, sz)) if axis == "x" else (lambda su, sn, sz: (sn, su, sz))
    cuts = sorted({a, c_end} | {o[0] for o in openings} | {o[1] for o in openings})
    d = inward
    for u0, u1 in zip(cuts, cuts[1:]):
        um = (u0 + u1) / 2
        zs = [(0.0, height)]
        for o in openings:
            if o[0] <= um <= o[1]:
                zs = [z for z in ((0.0, o[2]), (o[3], height)) if z[1] - z[0] > 1e-4]
        for z0, z1 in zs:
            mw.box(S(u1 - u0, t, z1 - z0), P(um, 0, (z0 + z1) / 2), "cream", r=0, segs=0)
            if z0 == 0.0 and z1 >= 0.95:
                # 아랫벽: 연한 세이지 띠(크림 벽과 명도·채도로 나뉜다)
                mw.box(S(u1 - u0, 0.02, 0.95), P(um, d * (t / 2 + 0.01), 0.475), "wainscot", r=0, segs=0)
    mw.box(S(c_end - a, 0.04, 0.14), P((a + c_end) / 2, d * (t / 2 + 0.03), 0.07), "wood_deep", r=0.015, segs=1)
    for u0, u1 in zip(cuts, cuts[1:]):
        um = (u0 + u1) / 2
        blocked = any(o[0] <= um <= o[1] and o[2] < 0.95 for o in openings)
        if not blocked:
            mw.box(S(u1 - u0, 0.05, 0.06), P(um, d * (t / 2 + 0.035), 0.95), "wood", r=0, segs=0)
    for o in openings:
        o0, o1, z0, z1 = o[:4]
        w, h = o1 - o0, z1 - z0
        uc, zc = (o0 + o1) / 2, (z0 + z1) / 2
        fw = 0.1
        mw.box(S(w + 2 * fw, t + 0.06, fw), P(uc, 0, z1 + fw / 2), "wood_mid", r=0.03, segs=1)
        if z0 > 0:
            mw.box(S(w + 2 * fw + 0.1, t + 0.18, 0.07), P(uc, d * 0.06, z0 - 0.035), "wood_hi", r=0.03, segs=1)
        for uu in (o0 - fw / 2, o1 + fw / 2):
            mw.box(S(fw, t + 0.06, h + (fw if z0 > 0 else 0)), P(uu, 0, zc), "wood_mid", r=0, segs=0)
        if len(o) > 4:  # 문: 창살 없음
            continue
        n = max(1, round(w / 0.9))
        for k in range(1, n):
            mw.box(S(0.06, 0.08, h), P(o0 + w * k / n, 0, zc), "wood_mid", r=0, segs=0)
        rows = max(1, round(h / 1.1))
        for k in range(1, rows):
            mw.box(S(w, 0.08, 0.06), P(uc, 0, z0 + h * k / rows), "wood_mid", r=0, segs=0)
    return b.inst(mw.mesh(f"wall_{name}"), f"Wall_{name}", (0, 0, 0), coll="architecture", part="shell")


SOUTH_WINDOWS = [(0.5, 3.4, 1.35, 3.7), (3.9, 9.6, 1.35, 3.7), (10.6, 15.4, 1.0, 3.7)]
WEST_OPENINGS = [(1.1, 4.9, 1.3, 3.7), (5.2, 6.4, 0, 2.7, "door")]
NORTH_WINDOWS = [(0.9, 3.1, 1.1, 3.6), (8.95, 10.05, 1.1, 3.6)]
WING_NORTH_WINDOWS = [(12.2, 15.4, 1.1, 3.6)]
EAST_WINDOWS = [(0.4, 3.7, 0.08, 3.9), (4.3, 7.4, 0.08, 3.9), (8.0, 12.2, 0.08, 3.9)]
L_OUTLINE = [(-0.2, -0.2), (16.2, -0.2), (16.2, 12.9), (10.2, 12.9), (10.2, 7.0), (-0.2, 7.0)]


def build_architecture(b):
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x, y, 0)) for x, y in L_OUTLINE])
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=(0, 0, -0.35), verts=[e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for fc in bm.faces:
        fc.material_index = 0 if fc.normal.z > 0.5 else 1
        fc.smooth = True
    for e in bm.edges:
        e.smooth = False
    me = bpy.data.meshes.new(PREFIX + "floor")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat("floor"))
    me.materials.append(mat("wood_deep"))
    b.inst(me, "Floor", (0, 0, 0), coll="architecture", part="shell")
    b.inst(MB().box((0.8, 1.2, 0.02), (0.5, 5.8, 0.01), "coral_soft", r=0.008, segs=1).mesh("door_mat"), "Entrance_Mat", (0, 0, 0),
           coll="architecture", part="shell")

    H = ROOM_H
    _wall(b, "South", "x", -0.1, -0.2, 16.0, H, SOUTH_WINDOWS, +1)
    _wall(b, "West", "y", -0.1, 0.0, 6.8, H, WEST_OPENINGS, +1)
    _wall(b, "North", "x", 6.9, -0.2, 10.4, H, NORTH_WINDOWS, -1)
    _wall(b, "WingWest", "y", 10.3, 6.7, 12.9, H, [], +1)
    _wall(b, "WingNorth", "x", 12.8, 10.2, 16.2, H, WING_NORTH_WINDOWS, -1)
    _wall(b, "East", "y", 16.1, -0.2, 12.9, H, EAST_WINDOWS, -1)

    # 천장: 아래를 보는 판(크림) + 둥근 나무 들보. 위쪽 면은 보이지 않아 만들지 않는다.
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x, y, H)) for x, y in reversed(L_OUTLINE)])
    f.smooth = True
    me = bpy.data.meshes.new(PREFIX + "ceiling")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat("ceiling"))
    b.inst(me, "Ceiling", (0, 0, 0), coll="architecture", part="shell")
    c = MB()
    # 들보는 얕게(웹 '위에서 보기' 카메라가 천장 0.32m 아래까지 올라간다).
    for y in (2.0, 4.8):
        c.box((16.0, 0.24, 0.16), (8.0, y, H - 0.08), "wood", r=0.04, segs=1)
    c.box((0.24, 5.9, 0.16), (13.2, 9.85, H - 0.08), "wood", r=0.04, segs=1)
    b.inst(c.mesh("ceiling_beams"), "Ceiling_Beams", (0, 0, 0), coll="architecture", part="shell")


# ---------------------------------------------------------------------------
# 자리 가구

TABLE = (5.4, 3.4)
DESK_X = (1.3, 2.6, 4.4, 5.6, 6.8, 8.0, 9.2)
CUSHIONS = ("coral_soft", "butter", "sage", "sky")


def build_seat_furniture(b):
    p = b.proto
    chairs = [p(f"chair_{c}", lambda c=c: K["cafe_chair"](f"cafe_chair_{c}", c)) for c in CUSHIONS]
    for i in range(12):
        b.at_seat(chairs[(i * 3 + i // 2) % 4], f"GroupChair_{i:02d}", i, K["CHAIR_SEAT"], "group")
    for i in range(12, 19):
        b.at_seat(chairs[(i + 1) % 4], f"StudyChair_{i:02d}", i, K["CHAIR_SEAT"], "individual")
    sofa_coral = p("sofa_coral", lambda: K["sofa"]("sofa_coral", "coral", "coral_deep",
                                                    pillows=((-0.62, "butter", 10), (0.64, "sage", -8))))
    sofa_sage = p("sofa_sage", lambda: K["sofa"]("sofa_sage", "sage", "sage_deep",
                                                  pillows=((-0.62, "coral_soft", 8), (0.64, "lilac", -10))))
    b.at_seat(sofa_coral, "Lounge1_Sofa", 19, K["SOFA_SEATS"][1], "lounge")
    b.at_seat(sofa_sage, "Lounge2_Sofa", 24, K["SOFA_SEATS"][1], "lounge")
    basket_b = p("basket_butter", lambda: K["basket_chair"]("basket_butter", "butter", "coral_soft"))
    basket_c = p("basket_coral", lambda: K["basket_chair"]("basket_coral", "coral", "butter"))
    b.at_seat(basket_b, "Lounge1_Basket_W", 22, K["SHELL_SEAT"], "lounge")
    b.at_seat(basket_c, "Lounge1_Basket_E", 23, K["SHELL_SEAT"], "lounge")
    b.at_seat(basket_b, "Wing_Basket_E", 30, K["SHELL_SEAT"], "lounge")
    arm_b = p("arm_butter", lambda: K["armchair"]("armchair_butter", "butter", "butter_deep", pillow="coral_soft"))
    arm_c = p("arm_coral", lambda: K["armchair"]("armchair_coral", "coral", "coral_deep", pillow="butter"))
    arm_s = p("arm_sage", lambda: K["armchair"]("armchair_sage", "sage", "sage_deep", pillow="sky"))
    for seat, me, name in ((27, arm_b, "Lounge2_Armchair_W"), (28, arm_c, "Lounge2_Armchair_E"), (29, arm_s, "Wing_Armchair_W"),
                           (31, arm_c, "West_Armchair_A"), (32, arm_b, "West_Armchair_B")):
        b.at_seat(me, name, seat, K["ARM_SEAT"], "lounge")


# ---------------------------------------------------------------------------
# 탁자·책상과 위의 소품


def _props(b):
    p = b.proto
    return {
        "mug": [p(f"mug_{c}", lambda c=c: K["mug"](f"mug_{c}", c)) for c in ("cream", "sky", "coral_soft", "butter")],
        "book_stack": [p(f"books_{s}", lambda s=s: K["book_stack"](f"book_stack_{s}", s)) for s in range(4)],
        "open_book": [p(f"obook_{c}", lambda c=c: K["open_book"](f"open_book_{c}", c)) for c in ("sky", "coral", "sage")],
        "notebook": [p(f"note_{c}", lambda c=c: K["notebook"](f"notebook_{c}", c)) for c in ("coral", "lilac", "sky")],
        "pencil_cup": [p(f"pcup_{c}", lambda c=c: K["pencil_cup"](f"pencil_cup_{c}", c)) for c in ("sky", "butter")],
        "laptop": [p("laptop", lambda: K["laptop"]("laptop", "sky"))],
        "vase": [p(f"vase_{c}", lambda c=c: K["flower_vase"](f"flower_vase_{c}", c)) for c in ("sky", "cream", "coral_soft")],
        "tiny_plant": [p(f"tplant_{c}", lambda c=c: K["tiny_plant"](f"tiny_plant_{c}", c)) for c in ("coral_soft", "cream", "sky")],
    }


# 자리 앞 소품 조합(자리마다 다르게 2–3가지). (종류, 자리 기준 옆 x, 탁자 안쪽 깊이 d, 돌림)
SEAT_SETS = [
    (("open_book", 0.0, 0.3, 0), ("mug", 0.3, 0.26, 40)),
    (("notebook", -0.05, 0.3, 8), ("pencil_cup", 0.3, 0.36, 0), ("mug", -0.3, 0.3, 120)),
    (("laptop", 0.0, 0.34, 0), ("mug", 0.32, 0.26, 200)),
    (("book_stack", -0.25, 0.36, 15), ("notebook", 0.08, 0.28, -6)),
    (("open_book", 0.0, 0.3, -5), ("pencil_cup", -0.3, 0.36, 0)),
    (("notebook", 0.0, 0.28, 4), ("mug", 0.3, 0.3, 80), ("book_stack", -0.32, 0.38, -10)),
]


def build_tables(b):
    rng = random.Random(11)
    pr = _props(b)
    tx, ty = TABLE
    b.inst(b.proto("table", lambda: K["communal_table"]("communal_table")), "GroupTable", (tx, ty, 0), coll="group")
    top = K["TABLE_TOP"]
    for i in range(12):
        w, yaw = seat_world(i)
        side = 1 if w.y > ty else -1  # 1: 북쪽 의자(남쪽을 봄)
        face = 180 if side > 0 else 0
        for k, (kind, sx, depth, rot) in enumerate(SEAT_SETS[i % len(SEAT_SETS)]):
            variants = pr[kind]
            me = variants[(i + k) % len(variants)]
            x = w.x + sx * (-1 if side > 0 else 1)
            y = ty + side * (0.6 - depth)
            b.inst(me, f"Table_{i:02d}_{kind}", (x, y, top), face + rot + rng.uniform(-6, 6), coll="group")
    # 가운데 줄: 꽃병·작은 화분·책 더미를 번갈아.
    centre = (("vase", -2.4), ("book_stack", -1.2), ("tiny_plant", 0.0), ("book_stack", 1.2), ("vase", 2.4))
    for k, (kind, dx) in enumerate(centre):
        variants = pr[kind]
        b.inst(variants[k % len(variants)], f"Table_Centre_{k}", (tx + dx, ty + rng.uniform(-0.04, 0.04), top), rng.uniform(0, 360), coll="group")

    desk = b.proto("desk", lambda: K["study_desk"]("study_desk"))
    lamp = b.proto("lamp", lambda: K["desk_lamp"]("desk_lamp"))
    for i, x in enumerate(DESK_X):
        n = f"{i + 1:02d}"
        b.inst(desk, f"StudyDesk_{n}", (x, 0.32, 0), coll="individual")
        b.inst(lamp, f"StudyLamp_{n}", (x - 0.38, 0.2, top), 90 + rng.uniform(-20, 0), coll="individual")
        work = pr["laptop"][0] if i % 3 == 1 else (pr["open_book"][i % 3] if i % 2 else pr["notebook"][i % 3])
        b.inst(work, f"StudyWork_{n}", (x - 0.02, 0.42, top), 180 + rng.uniform(-10, 10), coll="individual")
        side = (pr["mug"][i % 4], pr["pencil_cup"][i % 2], pr["vase"][i % 3])[i % 3]
        b.inst(side, f"StudySide_{n}", (x + 0.33, 0.42, top), rng.uniform(0, 360), coll="individual")
        shelf_item = (pr["tiny_plant"][i % 3], pr["book_stack"][i % 4])[i % 2]
        b.inst(shelf_item, f"StudyShelf_{n}", (x + (0.22 if i % 2 else -0.15), 0.12, 1.0375), rng.uniform(-20, 20), coll="individual")


def build_lounges(b):
    p = b.proto
    pr = _props(b)
    L = "lounge"
    rug1 = p("rug1", lambda: K["rug_round"]("rug_round_a", 1.35, ("cream", "coral_soft", "butter")))
    rug2 = p("rug2", lambda: K["rug_round"]("rug_round_b", 1.15, ("sky", "cream", "sky")))
    rug3 = p("rug3", lambda: K["rug_dots"]("rug_dots", 3.0, 2.0, "butter", "cream"))
    ctable = p("ctable", lambda: K["coffee_table_round"]("coffee_table_round"))
    stable = p("stable", lambda: K["side_table"]("side_table"))
    flamp = p("flamp", lambda: K["floor_lamp"]("floor_lamp"))
    pouf_a = p("pouf_a", lambda: MB().cyl(0.26, 0.26, 0.36, (0, 0, 0.18), "lilac", segs=12, r=0.07).mesh("pouf_lilac"))
    pouf_b = p("pouf_b", lambda: MB().cyl(0.24, 0.24, 0.34, (0, 0, 0.17), "sky", segs=12, r=0.07).mesh("pouf_sky"))
    b.inst(rug1, "Lounge1_Rug", (13.6, 4.7, 0), coll=L)
    b.inst(ctable, "Lounge1_CoffeeTable", (13.6, 4.65, 0), coll=L)
    b.inst(pouf_a, "Lounge1_Pouf", (13.6, 3.7, 0), coll=L)
    b.inst(flamp, "Lounge1_FloorLamp", (15.45, 5.75, 0), coll=L)
    b.inst(pr["mug"][1], "Lounge1_Mug_A", (13.4, 4.55, 0.42), 30, coll=L)
    b.inst(pr["mug"][2], "Lounge1_Mug_B", (13.85, 4.8, 0.42), 200, coll=L)
    b.inst(pr["vase"][0], "Lounge1_Vase", (13.62, 4.72, 0.42), 0, coll=L)
    b.inst(pr["book_stack"][1], "Lounge1_Books", (13.75, 4.45, 0.42), 15, coll=L)
    b.inst(rug2, "Lounge2_Rug", (13.3, 1.2, 0), coll=L)
    b.inst(ctable, "Lounge2_CoffeeTable", (13.3, 1.2, 0), coll=L)
    b.inst(pr["tiny_plant"][1], "Lounge2_Plant", (13.3, 1.25, 0.42), coll=L)
    b.inst(pr["laptop"][0], "Lounge2_Laptop", (13.05, 1.02, 0.42), -20, coll=L)
    b.inst(pr["mug"][3], "Lounge2_Mug", (13.58, 1.0, 0.42), 90, coll=L)
    b.inst(rug3, "Wing_Rug", (14.2, 8.3, 0), coll=L)
    b.inst(pouf_b, "Wing_Ottoman_W", (13.45, 7.65, 0), coll=L)
    b.inst(pouf_a, "Wing_Ottoman_E", (15.0, 7.65, 0), coll=L)
    b.inst(stable, "Wing_SideTable", (14.22, 8.95, 0), coll=L)
    b.inst(pr["mug"][0], "Wing_Mug", (14.12, 8.95, 0.52), coll=L)
    b.inst(pr["open_book"][2], "Wing_Book", (14.3, 8.85, 0.52), 40, coll=L)
    b.inst(flamp, "Wing_FloorLamp", (15.6, 9.55, 0), coll=L)
    b.inst(stable, "West_SideTable", (0.42, 3.48, 0), coll=L)
    b.inst(pr["book_stack"][2], "West_Books", (0.42, 3.42, 0.52), 20, coll=L)
    b.inst(pr["vase"][2], "West_Vase", (0.45, 3.62, 0.52), 0, coll=L)
    b.inst(flamp, "West_FloorLamp", (0.3, 1.55, 0), coll=L)


def build_plants(b):
    p = b.proto
    big_a = p("big_a", lambda: K["big_plant"]("big_plant_a", 7))
    big_b = p("big_b", lambda: K["big_plant"]("big_plant_b", 8, pot_col="sky", band="cream", height=1.5))
    big_c = p("big_c", lambda: K["big_plant"]("big_plant_c", 9, pot_col="butter", band="coral", leaves=9, height=1.1))
    bush_a = p("bush_a", lambda: K["bush_plant"]("bush_plant_a", 4))
    bush_b = p("bush_b", lambda: K["bush_plant"]("bush_plant_b", 5, pot_col="coral_soft"))
    rng = random.Random(5)
    for name, me, loc in (("Plant_NW", bush_a, (0.3, 6.3)), ("Plant_N_A", big_a, (3.75, 6.2)), ("Plant_N_B", big_b, (9.95, 6.35)),
                          ("Plant_E", big_c, (15.6, 4.0)), ("Plant_SE", bush_b, (15.62, 0.35)), ("Plant_S", bush_a, (3.62, 0.3)),
                          ("Plant_SW", bush_b, (0.35, 0.35)), ("Plant_Wing", bush_a, (12.65, 9.9)), ("Plant_WingN", bush_b, (11.0, 12.35))):
        b.inst(me, name, (*loc, 0), rng.uniform(0, 360), coll="plants")
    hang = p("hang", lambda: K["hanging_plant"]("hanging_plant", 3))
    for name, loc in (("Hang_N", (2.0, 6.35)), ("Hang_Wing", (13.8, 12.25))):
        b.inst(hang, name, (*loc, ROOM_H - 0.62), rng.uniform(0, 360), coll="plants")


def build_counter(b):
    """날개 서쪽 카운터(원본 위치): 오렌지 우드 몸통 + 크림 상판 + 세이지·크림 앞판, 뒤 선반."""
    rng = random.Random(9)
    pr = _props(b)
    mb = MB()

    def run(x0, x1, y0, y1, front):
        H = 1.05
        cx, cy, w, d = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
        mb.box((w - 0.06, d - 0.06, 0.1), (cx, cy, 0.05), "wood_deep", r=0.02, segs=1)
        mb.box((w, d, H - 0.14), (cx, cy, 0.1 + (H - 0.14) / 2), "wood", r=0.03, segs=1)
        mb.box((w + 0.08, d + 0.08, 0.06), (cx, cy, H - 0.03), "wood_hi", r=0.03, segs=1)
        if front == "x":
            n = max(1, int(d / 0.6))
            for k in range(n):
                y = y0 + d * (k + 0.5) / n
                mb.box((0.02, d / n - 0.12, H - 0.4), (x1 + 0.01, y, 0.55), "sage" if k % 2 else "cream", r=0, segs=0)
        else:
            mb.box((w - 0.12, 0.02, H - 0.4), (cx, y0 - 0.01, 0.55), "cream", r=0, segs=0)

    run(11.6, 12.2, 7.95, 11.5, "x")
    run(10.95, 12.2, 7.35, 7.95, "y")
    mb.box((0.55, 4.6, 0.88), (10.68, 9.95, 0.44), "wood", r=0.03, segs=1)
    mb.box((0.62, 4.66, 0.05), (10.7, 9.95, 0.905), "wood_hi", r=0.02, segs=1)
    for z in (1.55, 1.95):
        mb.box((0.3, 4.4, 0.05), (10.57, 9.95, z), "wood_mid", r=0.02, segs=1)
    # 메뉴판: 세이지 판 + 굵은 크림 줄(4px 이상)
    mb.box((0.05, 1.8, 0.75), (10.44, 9.95, 2.6), "wood_deep", r=0.025, segs=1)
    mb.box((0.01, 1.66, 0.62), (10.47, 9.95, 2.6), "sage_deep", r=0, segs=0)
    for r in range(4):
        for c in (-1, 1):
            mb.box((0.005, 0.5 - 0.12 * (r % 2), 0.05), (10.477, 9.95 + c * 0.4, 2.8 - r * 0.13), "cream", r=0, segs=0)
    # 뒤 선반 단지·컵
    for k in range(9):
        y = 8.1 + k * 0.48
        z = 1.575 if k % 2 else 1.975
        col = ("sky", "coral_soft", "butter", "cream")[k % 4]
        if k % 3 == 0:
            mb.cyl(0.06, 0.06, 0.18, (10.55, y, z + 0.09), col, segs=8)
            mb.cyl(0.065, 0.065, 0.03, (10.55, y, z + 0.195), "wood", segs=8)
        elif k % 3 == 1:
            for i in range(3):
                mb.cyl(0.04, 0.036, 0.09, (10.55, y - 0.1 + i * 0.1, z + 0.045), col, segs=8)
        else:
            mb.cyl(0.05, 0.04, 0.12, (10.55, y, z + 0.06), "coral_soft", segs=8)
            mb.ball(0.07, (10.55, y, z + 0.16), "leaf", sub=1)
    b.inst(mb.mesh("counter_body"), "Counter_Body", (0, 0, 0), coll="counter")
    e = MB()
    e.box((0.5, 0.7, 0.42), (0, 0, 0.21), "coral", r=0.06, segs=2)
    e.box((0.52, 0.72, 0.05), (0, 0, 0.445), "cream", r=0.02, segs=1)
    for y in (-0.18, 0.18):
        e.cyl(0.045, 0.04, 0.08, (-0.28, y, 0.22), "cream", segs=10, rot=(0, 90, 0))
        e.box((0.16, 0.035, 0.03), (-0.38, y, 0.2), "wood_deep", r=0.01, segs=1)
    e.box((0.18, 0.6, 0.025), (-0.27, 0, 0.06), "cream_deep", r=0.01, segs=1)
    for k in range(4):
        e.cyl(0.035, 0.032, 0.07, (0.05, -0.24 + k * 0.16, 0.505), ("sky", "butter", "cream", "coral_soft")[k], segs=8)
    b.inst(e.mesh("espresso"), "Counter_Espresso", (10.7, 10.4, 0.93), 180, coll="counter")
    cake = b.proto("cake", lambda: K["cake_stand"]("cake_stand"))
    b.inst(cake, "Counter_Cake_A", (11.4, 7.65, 1.05), coll="counter")
    b.inst(cake, "Counter_Cake_B", (11.9, 8.4, 1.05), coll="counter")
    for k, y in enumerate((9.2, 9.36, 9.52)):
        b.inst(pr["mug"][k], f"Counter_Cup_{k}", (11.9, y, 1.05), rng.uniform(0, 360), coll="counter")
    b.inst(pr["vase"][1], "Counter_Vase", (11.9, 10.3, 1.05), coll="counter")
    b.inst(pr["tiny_plant"][0], "Counter_Plant", (11.9, 10.9, 1.05), coll="counter")


PAINTINGS = [
    # (이름, 폭, 높이, [(w, h, x, z, 색)] — 색 앞 '~'는 동그라미)
    ("painting_sun", 0.62, 0.78, [(0.54, 0.38, 0, 0.12, "sky"), (0.54, 0.32, 0, -0.2, "leaf_light"), (0.16, 0.16, 0.12, 0.17, "~butter"),
                                   (0.3, 0.1, -0.1, -0.08, "leaf")]),
    ("painting_flower", 0.6, 0.6, [(0.52, 0.52, 0, 0, "butter"), (0.2, 0.2, 0, 0.06, "~coral"), (0.08, 0.08, 0, 0.06, "~cream"),
                                    (0.03, 0.22, 0, -0.14, "leaf")]),
    ("painting_hills", 0.84, 0.56, [(0.76, 0.48, 0, 0, "coral_soft"), (0.76, 0.16, 0, -0.16, "sage"), (0.36, 0.12, 0.14, -0.06, "leaf_light"),
                                     (0.14, 0.14, -0.2, 0.1, "~cream")]),
    ("painting_cup", 0.5, 0.62, [(0.42, 0.54, 0, 0, "sky"), (0.2, 0.18, 0, -0.06, "cream"), (0.06, 0.08, 0.13, -0.05, "cream"),
                                  (0.28, 0.03, 0, -0.17, "wood")]),
    ("painting_leaf", 0.46, 0.46, [(0.38, 0.38, 0, 0, "cream"), (0.2, 0.2, -0.04, 0.03, "~leaf"), (0.12, 0.12, 0.08, -0.06, "~leaf_light")]),
]


def build_decor(b):
    p = b.proto
    for k, x in enumerate((4.55, 6.5, 7.9)):
        b.inst(p(f"shelf{k}", lambda k=k: K["bookshelf"](f"bookshelf_{k}", k + 20)), f"Bookshelf_{k + 1:02d}", (x, 6.6, 0), coll="decor")
    b.inst(p("cred_a", lambda: K["credenza"]("credenza_a", 2.2)), "Credenza_North", (2.0, 6.55, 0), coll="decor")
    b.inst(p("cred_b", lambda: K["credenza"]("credenza_b", 3.0, 0.38, 0.8)), "Credenza_Wing", (13.8, 12.45, 0), coll="decor")
    pr = _props(b)
    b.inst(pr["vase"][0], "Credenza_North_Vase", (1.5, 6.55, 0.77), coll="decor")
    b.inst(pr["book_stack"][3], "Credenza_North_Books", (2.5, 6.5, 0.77), 10, coll="decor")
    b.inst(pr["tiny_plant"][2], "Credenza_North_Plant", (2.85, 6.55, 0.77), coll="decor")
    b.inst(pr["tiny_plant"][0], "Credenza_Wing_Plant_A", (12.7, 12.45, 0.82), coll="decor")
    b.inst(pr["vase"][2], "Credenza_Wing_Vase", (13.4, 12.45, 0.82), coll="decor")
    b.inst(pr["book_stack"][1], "Credenza_Wing_Books", (14.3, 12.4, 0.82), -8, coll="decor")
    b.inst(pr["tiny_plant"][1], "Credenza_Wing_Plant_B", (14.9, 12.45, 0.82), coll="decor")

    frames = {n: p(n, lambda n=n, w=w, h=h, art=art: K["picture_frame"](n, w, h, art)) for n, w, h, art in PAINTINGS}
    # 액자 다섯: 북쪽 벽 책장 위 셋, 날개 북벽, 동쪽 벽 창 사이.
    for name, loc, rz in (("painting_sun", (4.55, 6.77, 2.75), 0), ("painting_hills", (6.5, 6.77, 2.75), 0), ("painting_flower", (7.9, 6.77, 2.75), 0),
                          ("painting_cup", (11.3, 12.67, 2.4), 0), ("painting_leaf", (15.97, 7.7, 2.3), 90)):
        b.inst(frames[name], f"Frame_{name}", loc, rz, coll="decor")
    shelf_a = p("wshelf_a", lambda: K["wall_shelf"]("wall_shelf_a", 1))
    shelf_b = p("wshelf_b", lambda: K["wall_shelf"]("wall_shelf_b", 4))
    for name, me, loc, rz in (("Shelf_North_A", shelf_a, (5.52, 6.68, 3.45), 0), ("Shelf_North_B", shelf_b, (7.2, 6.68, 3.45), 0),
                              ("Shelf_Wing", shelf_b, (11.25, 12.58, 3.3), 0), ("Shelf_West", shelf_a, (0.12, 0.55, 2.3), -90)):
        b.inst(me, name, loc, rz, coll="decor")
    # 커튼: 북서 창·날개 북창 양옆(두툼한 주름 7개). 커튼 로컬 -Y가 방 안쪽.
    cur_c = p("curtain_c", lambda: K["curtain"]("curtain_coral", 3.55, 0.6, "coral_soft"))
    cur_s = p("curtain_s", lambda: K["curtain"]("curtain_sage", 3.55, 0.6, "sage"))
    for name, me, x, y, rz in (("Curtain_N_L", cur_c, 0.6, 6.72, 0), ("Curtain_N_R", cur_c, 3.42, 6.72, 0),
                               ("Curtain_Wing_L", cur_s, 11.88, 12.62, 0), ("Curtain_Wing_R", cur_s, 15.68, 12.62, 0)):
        b.inst(me, name, (x, y, 0.05), rz, coll="decor")
    b.inst(p("rod_n", lambda: K["curtain_rod"]("curtain_rod_n", 3.6)), "Rod_N", (2.0, 6.7, 3.72), coll="decor")
    b.inst(p("rod_w", lambda: K["curtain_rod"]("curtain_rod_w", 4.4)), "Rod_Wing", (13.8, 12.6, 3.72), coll="decor")
    # 줄 전구: 북쪽 벽·날개 북벽·동쪽 창 위를 따라.
    runs = [((0.3, 6.68), (10.1, 6.68), 3.98, 4), ((10.6, 12.58), (15.8, 12.58), 3.98, 2), ((15.88, 0.3), (15.88, 12.4), 4.02, 4)]
    me, count = K["string_lights"]("string_lights", runs, spacing=0.6)
    b.inst(me, "String_Lights", (0, 0, 0), coll="decor")
    return count


def build_outdoors(b):
    """창 밖: 잔디·둥근 나무·꽃 덤불·낮은 울타리. 하늘은 웹이 그린다(하늘 면 없음)."""
    rng = random.Random(21)
    O = "outdoors"
    lawn = MB().box((40.0, 34.0, 0.1), (8.0, 6.0, -0.4), "grass", r=0, segs=0)
    b.inst(lawn.mesh("lawn"), "Lawn", (0, 0, 0), coll=O, part="outdoors")
    trees = [b.proto(f"tree{k}", lambda k=k: K["tree"](f"tree_{k}", k + 30, height=rng.uniform(2.6, 3.2), blobs=6)) for k in range(3)]
    # 창으로 보이는 자리에만: 동쪽 큰 창 셋, 북쪽 창 둘, 날개 북창, 서쪽 창.
    spots = [(18.6, 2.0), (19.2, 9.8), (2.0, 9.2), (13.8, 15.4)]
    for i, (x, y) in enumerate(spots):
        b.inst(trees[i % 3], f"Tree_{i:02d}", (x, y, -0.35), rng.uniform(0, 360), coll=O, part="outdoors")
    bushes = [b.proto(f"fbush{k}", lambda k=k: K["flower_bush"](f"flower_bush_{k}", k + 50)) for k in range(2)]
    for i, (x, y) in enumerate(((17.1, 0.8), (17.0, 5.6), (2.6, 7.9), (12.6, 13.8))):
        b.inst(bushes[i % 2], f"FlowerBush_{i:02d}", (x, y, -0.35), rng.uniform(0, 360), coll=O, part="outdoors")
    fe = b.proto("fence", lambda: K["fence"]("fence", 6.0))
    for i, (x, y, rz) in enumerate(((17.8, 3.2, 90), (17.8, 9.4, 90), (2.2, 8.4, 0))):
        b.inst(fe, f"Fence_{i}", (x, y, -0.35), rz, coll=O, part="outdoors")


def build_seats(b):
    """`seat_NN` 빈 노드: 위치 = 방석 윗면 가운데, 블렌더 회전 z = yaw(glTF 로컬 +Z가 보는 쪽)."""
    out = []
    for i in range(len(SEATS)):
        w, yaw = seat_world(i)
        ob = bpy.data.objects.new(f"seat_{i:02d}", None)
        ob.empty_display_type = "SINGLE_ARROW"
        ob.empty_display_size = 0.3
        ob.location = w
        ob.rotation_euler = (0, 0, yaw)
        ob["study_room_seat"] = i
        b.coll("seats").objects.link(ob)
        out.append(ob)
    return out


def stats(scene):
    by = {}
    for ob in scene.objects:
        if ob.type == "MESH":
            by.setdefault(ob.get("study_room_part", "?"), 0)
            ob.data.calc_loop_triangles()
            by[ob["study_room_part"]] += len(ob.data.loop_triangles)
    return by


def run_all():
    scene = reset_scene()
    b = Builder(scene)
    build_architecture(b)
    build_seat_furniture(b)
    build_tables(b)
    build_lounges(b)
    build_plants(b)
    build_counter(b)
    bulbs = build_decor(b)
    build_outdoors(b)
    build_seats(b)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)
    s = stats(scene)
    print(f"[study-room-v2] tris by part {s}, total {sum(s.values())}, bulbs {bulbs}")
    return scene


if __name__ == "__main__":
    run_all()
