"""PocketTime 3D 공부방(로우폴리 라운지 카페) 생성 스크립트.

Blender 5.x에서 실행한다. 같은 이름의 씬("StudyRoom3D")을 비우고 다시 만든다.
다른 씬과 사용자 오브젝트는 건드리지 않는다. 베이크 → GLB 내보내기는
`bake_and_export.py`가 이어서 한다(`export_study_assets.py -- room`).

좌표(블렌더, Z 위, m): +X 오른쪽(동), +Y 뒤(북, 화면 위), 원점은 큰 홀 남서쪽 안쪽 모서리.
glTF(Y 위)로 내보내면 블렌더 +Y → glTF -Z가 된다(앱 카메라는 남쪽에서 북쪽을 본다).

평면도(손그림 기준): L자 방. 큰 홀 X 0–16 · Y 0–6.8, 북동쪽 날개 X 10.4–16 · Y 6.8–12.7.
- 가운데 왼쪽: 긴 공용 테이블(의자 12)
- 남쪽 벽: 개인 책상 7(칸막이·스탠드)
- 동쪽: 라운지 둘(소파·안락의자·커피 테이블)
- 날개: 서쪽 벽 카운터, 독서 의자 둘
- 북쪽 벽: 책장 셋·수납장, 서쪽 벽: 안락의자 둘·입구

자리(`seat_NN` 빈 노드): 사람이 앉는 방석 윗면 가운데. 노드의 glTF 로컬 +Z가 앉은 사람이
보는 방향이다. 번호는 채우는 순서(0번이 내 자리). 소파도 한 칸이 한 자리다. 앱의
`StudyRoom3dScenes.cafe` 자리 표와 같아야 한다(`study_room_glb_contract_test.dart`).

아트 디렉션: 낮의 밝은 라운지 카페(흰 벽·콘크리트 바닥·검은 금속·오크·코냑 가죽·회색
패브릭). 로우폴리: 모서리는 한 번만 깎고, 원기둥은 3–8각, 플랫 셰이딩.
"""

import math
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

SCENE_NAME = "StudyRoom3D"
PREFIX = "sr_"

ROOM_H = 4.2  # 천장 높이
CUTAWAY_H = 0.9  # 앱 카메라 쪽(남·서) 벽을 자른 높이

# 큰 홀·날개 안쪽 범위(블렌더 XY).
HALL = (0.0, 16.0, 0.0, 6.8)
WING = (10.4, 16.0, 6.8, 12.7)

# ---------------------------------------------------------------------------
# 색·재질


def srgb_to_linear(hex_value):
    h = hex_value.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# 이름: (sRGB 헥스, 거칠기, 금속성)
PALETTE = {
    "wall": ("#F0BBA4", 0.9, 0), "wall_trim": ("#F7E3D3", 0.85, 0), "base_dark": ("#8E5A40", 0.7, 0),
    "frame_green": ("#2F4A3A", 0.6, 0), "chalk": ("#2E3B33", 0.9, 0), "rattan": ("#D9B27E", 0.85, 0),
    "grass": ("#8DB86B", 1, 0), "bark": ("#7A5236", 0.9, 0), "tree_a": ("#5E9A4C", 0.8, 0), "tree_b": ("#78B05A", 0.8, 0),
    "black": ("#4A2E22", 0.6, 0), "metal": ("#C9C4BC", 0.3, 0.9), "steel": ("#8E8A85", 0.35, 0.9),
    "oak": ("#E2AE78", 0.6, 0), "oak_light": ("#EDC491", 0.6, 0),
    "walnut": ("#7A4B30", 0.45, 0), "walnut_dark": ("#5A3420", 0.5, 0),
    "white_top": ("#F4F2EE", 0.3, 0), "cream": ("#EFE6D6", 0.85, 0),
    "cognac": ("#C2603E", 0.7, 0), "cognac_dark": ("#9A4A30", 0.75, 0), "grey_fab": ("#EBDCC6", 0.95, 0),
    "grey_dark": ("#B79C83", 0.95, 0), "orange": ("#E08A55", 0.85, 0), "terracotta": ("#C66A47", 0.8, 0),
    "sage": ("#9AAA8C", 0.95, 0), "mustard": ("#D9A54A", 0.85, 0), "felt": ("#8C9A83", 1, 0),
    "leaf": ("#5E8F4A", 0.6, 0), "leaf_dark": ("#3F6B38", 0.6, 0), "leaf_light": ("#82B05E", 0.6, 0),
    "trunk": ("#6B4A33", 0.8, 0), "pot_concrete": ("#A7A29B", 0.9, 0), "pot_white": ("#EDEAE4", 0.5, 0),
    "pot_terra": ("#C0704E", 0.8, 0), "soil": ("#3B2D24", 1, 0),
    "ceramic": ("#F6F3EC", 0.3, 0), "paper": ("#FBF8F1", 0.9, 0), "coffee": ("#3A2416", 0.3, 0),
    "pink": ("#F3B6C2", 0.7, 0), "tulip": ("#F28DA8", 0.6, 0), "petal_white": ("#FFF4EE", 0.6, 0), "blue": ("#9DBBD0", 0.7, 0), "lilac": ("#BEADD3", 0.7, 0), "mint": ("#AFD5BE", 0.7, 0),
    "rug1": ("#EBD3B8", 1, 0), "rug2": ("#D59B76", 1, 0), "rug3": ("#E3C49B", 1, 0),
    "screen": ("#20262B", 0.2, 0), "cake": ("#E9C79B", 0.7, 0), "berry": ("#B8424A", 0.5, 0),
}


def _bsdf(mat):
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def mat(name):
    """`sr_src_<name>` 원본 재질(베이크 전 미리보기·베이크 입력)."""
    full = f"{PREFIX}src_{name}"
    m = bpy.data.materials.get(full)
    if m:
        return m
    m = bpy.data.materials.new(full)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = _bsdf(m)
    nt = m.node_tree
    if name == "glass":
        # 앱은 언릿 불투명이라 유리는 밝은 하늘색 면으로 굽는다.
        col = srgb_to_linear("#DCEBF2")
        b.inputs["Base Color"].default_value = (*col, 1)
        b.inputs["Emission Color"].default_value = (*col, 1)
        b.inputs["Emission Strength"].default_value = 0.9
        b.inputs["Roughness"].default_value = 0.2
    elif name in ("lampglow", "lampglow_soft"):
        col = srgb_to_linear("#FFD9A0")
        b.inputs["Base Color"].default_value = (*col, 1)
        b.inputs["Emission Color"].default_value = (*col, 1)
        b.inputs["Emission Strength"].default_value = 8.0 if name == "lampglow" else 2.5
    elif name == "floor_wood":
        # 따뜻한 나무 마루: 벽돌 무늬 노드로 판자(1.2×0.18m)를 엇갈려 깐다.
        col = srgb_to_linear("#DDA88A")
        tc = nt.nodes.new("ShaderNodeTexCoord")
        brick = nt.nodes.new("ShaderNodeTexBrick")
        brick.offset = 0.5
        brick.inputs["Color1"].default_value = (*srgb_to_linear("#D9A184"), 1)
        brick.inputs["Color2"].default_value = (*srgb_to_linear("#E6B597"), 1)
        brick.inputs["Mortar"].default_value = (*srgb_to_linear("#B67C62"), 1)
        brick.inputs["Scale"].default_value = 1.0
        brick.inputs["Mortar Size"].default_value = 0.008
        brick.inputs["Brick Width"].default_value = 1.2
        brick.inputs["Row Height"].default_value = 0.18
        nt.links.new(tc.outputs["Object"], brick.inputs["Vector"])
        nt.links.new(brick.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.6
    elif name in WOOD:
        hx, r, _ = PALETTE[name]
        col = srgb_to_linear(hx)
        _wood_grain(nt, b, col, WOOD[name])
        b.inputs["Roughness"].default_value = r
    elif name == "rattan":
        hx, r, _ = PALETTE[name]
        col = srgb_to_linear(hx)
        _cane_weave(nt, b, col)
        b.inputs["Roughness"].default_value = r
    else:
        hx, r, mt = PALETTE[name]
        col = srgb_to_linear(hx)
        b.inputs["Base Color"].default_value = (*col, 1)
        b.inputs["Roughness"].default_value = r
        b.inputs["Metallic"].default_value = mt
    m.diffuse_color = (*col, 1)
    return m


# 나무 재질 → 결 굵기(1m에 결 수). 진한 호두나무는 결이 더 촘촘하다.
# 폰 화면(멀리서 작게 보임)에서도 결이 보이게 결을 굵게 둔다.
WOOD = {"oak": 13.0, "oak_light": 12.0, "walnut": 17.0, "walnut_dark": 17.0}


def _scaled(col, k):
    return (*(min(1.0, c * k) for c in col), 1.0)


def _wood_grain(nt, bsdf, col, grain):
    """책상·의자 나뭇결: 노이즈로 일그러진 띠(결)와 가는 섬유 얼룩. 평균 색은 팔레트 그대로.

    좌표는 오브젝트 공간(m)이라 합친 메시에서도 결 간격이 같다. 띠는 Y 방향으로 바뀌어
    긴 판(상판·등받이, X로 길다)에서 결이 길이 방향으로 흐른다."""
    nodes, links = nt.nodes, nt.links
    tc = nodes.new("ShaderNodeTexCoord")
    # 결 좌표 (x, y+z, 0): 상판(XY)에서는 y, 세운 판(XZ)에서는 z로 바뀌어 어느 면에서나
    # 결이 X(긴 방향)로 흐른다.
    split = nodes.new("ShaderNodeSeparateXYZ")
    links.new(tc.outputs["Object"], split.inputs[0])
    across = nodes.new("ShaderNodeMath")
    across.operation = "ADD"
    links.new(split.outputs["Y"], across.inputs[0])
    links.new(split.outputs["Z"], across.inputs[1])
    grain_space = nodes.new("ShaderNodeCombineXYZ")
    links.new(split.outputs["X"], grain_space.inputs["X"])
    links.new(across.outputs["Value"], grain_space.inputs["Y"])
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "Y"
    wave.wave_profile = "SIN"
    wave.inputs["Scale"].default_value = grain / 6.0
    wave.inputs["Distortion"].default_value = 7.0
    wave.inputs["Detail"].default_value = 3.0
    wave.inputs["Detail Scale"].default_value = 1.6
    links.new(grain_space.outputs["Vector"], wave.inputs["Vector"])
    fiber = nodes.new("ShaderNodeTexNoise")
    fiber.inputs["Scale"].default_value = grain * 2.2
    fiber.inputs["Detail"].default_value = 2.0
    stretch = nodes.new("ShaderNodeMapping")
    stretch.inputs["Scale"].default_value = (0.08, 1.0, 1.0)  # 섬유는 결 방향(X)으로 길다
    links.new(tc.outputs["Object"], stretch.inputs["Vector"])
    links.new(stretch.outputs["Vector"], fiber.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = _scaled(col, 0.62)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = _scaled(col, 1.12)
    links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 0.5
    links.new(ramp.outputs["Color"], mix.inputs["A"])
    fiber_ramp = nodes.new("ShaderNodeValToRGB")
    fiber_ramp.color_ramp.elements[0].color = (0.82, 0.82, 0.82, 1.0)
    fiber_ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(fiber.outputs["Fac"], fiber_ramp.inputs["Fac"])
    links.new(fiber_ramp.outputs["Color"], mix.inputs["B"])
    links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])


def _cane_weave(nt, bsdf, col):
    """의자 좌판 등나무: 가로·세로 가닥이 엇갈린 격자(가닥 약 2cm). 가닥 사이는 어둡다."""
    nodes, links = nt.nodes, nt.links
    tc = nodes.new("ShaderNodeTexCoord")
    strands = []
    for direction in ("X", "Y"):
        wave = nodes.new("ShaderNodeTexWave")
        wave.wave_type = "BANDS"
        wave.bands_direction = direction
        wave.wave_profile = "SIN"
        wave.inputs["Scale"].default_value = 7.0
        wave.inputs["Distortion"].default_value = 0.4
        links.new(tc.outputs["Object"], wave.inputs["Vector"])
        strands.append(wave)
    weave = nodes.new("ShaderNodeMath")
    weave.operation = "MAXIMUM"
    links.new(strands[0].outputs["Fac"], weave.inputs[0])
    links.new(strands[1].outputs["Fac"], weave.inputs[1])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = _scaled(col, 0.62)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = _scaled(col, 1.08)
    links.new(weave.outputs["Value"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])


# ---------------------------------------------------------------------------
# 로우폴리 메시 빌더


def _cyl_segments(r):
    if r < 0.025:
        return 4
    if r < 0.1:
        return 6
    return 8


def _rotm(rot):
    return Euler([math.radians(a) for a in rot]).to_matrix().to_4x4()


def _merge(bm, t, mi):
    for f in t.faces:
        f.material_index = mi
    me = bpy.data.meshes.new("_tmp")
    t.to_mesh(me)
    t.free()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)


class MB:
    """부품을 모아 재질 슬롯이 있는 메시 하나를 만든다."""

    def __init__(self):
        self.mats = []
        self.bm = bmesh.new()

    def _i(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def box(self, size, c, m, bevel=0.01, segs=1, rot=(0, 0, 0)):
        t = bmesh.new()
        bmesh.ops.create_cube(t, size=1.0)
        bmesh.ops.scale(t, vec=Vector(size), verts=t.verts)
        if segs > 0:
            bv = min(bevel * 1.3, min(size) * 0.48)
            if bv > 0.0005:
                bmesh.ops.bevel(t, geom=list(t.edges), offset=bv, segments=1, affect="EDGES", profile=0.5, clamp_overlap=True)
        bmesh.ops.transform(t, matrix=Matrix.Translation(Vector(c)) @ _rotm(rot), verts=t.verts)
        _merge(self.bm, t, self._i(m))
        return self

    def cyl(self, r1, r2, h, c, m, segs=None, bevel=0.0, rot=(0, 0, 0)):
        segs = segs or _cyl_segments(max(r1, r2))
        t = bmesh.new()
        bmesh.ops.create_cone(t, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h)
        if bevel > 0:
            caps = [e for e in t.edges if len(e.link_faces) == 2 and any(len(f.verts) > 4 for f in e.link_faces)]
            bmesh.ops.bevel(t, geom=caps, offset=bevel * 1.3, segments=1, affect="EDGES", profile=0.5, clamp_overlap=True)
        bmesh.ops.transform(t, matrix=Matrix.Translation(Vector(c)) @ _rotm(rot), verts=t.verts)
        _merge(self.bm, t, self._i(m))
        return self

    def ico(self, r, c, m, scale=(1, 1, 1), sub=1, rot=(0, 0, 0)):
        t = bmesh.new()
        bmesh.ops.create_icosphere(t, subdivisions=sub, radius=r)
        bmesh.ops.scale(t, vec=Vector(scale), verts=t.verts)
        bmesh.ops.transform(t, matrix=Matrix.Translation(Vector(c)) @ _rotm(rot), verts=t.verts)
        _merge(self.bm, t, self._i(m))
        return self

    def arc(self, R, thick, z0, z1, a0, a1, c, m, n=8):
        """Z축 둘레 굽은 띠(안쪽 반지름 R, 두께 thick, 각도는 도)."""
        n = max(2, n // 2)
        t = bmesh.new()
        rings = []
        for i in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * i / n)
            ca, sa = math.cos(a), math.sin(a)
            rings.append([t.verts.new((r * ca, r * sa, z)) for (r, z) in ((R, z0), (R + thick, z0), (R + thick, z1), (R, z1))])
        for i in range(n):
            A, B = rings[i], rings[i + 1]
            for k in range(4):
                t.faces.new((A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k]))
        t.faces.new(list(reversed(rings[0])))
        t.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
        bmesh.ops.translate(t, vec=Vector(c), verts=t.verts)
        _merge(self.bm, t, self._i(m))
        return self

    def mesh(self, name):
        name = PREFIX + name
        old = bpy.data.meshes.get(name)
        if old:
            old.name = name + "_old"
        me = bpy.data.meshes.new(name)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=0.00001)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(mat(m))
        for p in me.polygons:
            p.use_smooth = False
        return me


class Builder:
    """씬·컬렉션과 오브젝트 배치."""

    def __init__(self, scene):
        self.scene = scene
        self.colls = {}

    def coll(self, name):
        c = self.colls.get(name)
        if c is None:
            full = f"{PREFIX}{name}"
            c = bpy.data.collections.get(full) or bpy.data.collections.new(full)
            if c.name not in self.scene.collection.children:
                self.scene.collection.children.link(c)
            self.colls[name] = c
        return c

    def inst(self, me, name, loc, rz=0, coll="decor", **props):
        ob = bpy.data.objects.new(name, me)
        ob.location = loc
        ob.rotation_euler = (0, 0, math.radians(rz))
        self.coll(coll).objects.link(ob)
        for k, v in props.items():
            ob[k] = v
        return ob

    def mesh(self, name):
        return bpy.data.meshes[PREFIX + name]


# ---------------------------------------------------------------------------
# 씬


def scene_named(name):
    """[name] 씬을 찾거나 만들어 지금 씬으로 둔다(창이 없으면 지금 씬 이름을 바꾼다)."""
    scene = bpy.data.scenes.get(name)
    window = bpy.context.window
    if scene is None:
        if window is None:
            scene = bpy.context.scene
            scene.name = name
        else:
            scene = bpy.data.scenes.new(name)
    if window is not None:
        window.scene = scene
    elif scene != bpy.context.scene:
        raise RuntimeError(f"백그라운드에서는 씬 '{name}'으로 바꿀 수 없습니다(새 Blender로 실행)")
    return scene


def reset_scene():
    scene = scene_named(SCENE_NAME)
    for ob in list(scene.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for blocks in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras, bpy.data.curves):
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)
    return scene


# ---------------------------------------------------------------------------
# 건축: 바닥·벽·창·천장


def _wall(b, name, axis, fixed, a, c_end, height, openings, inward, part="shell", t=0.2):
    """벽 한 면(창 구멍·창틀·걸레받이 포함)과 유리. axis 'x'면 X로 뻗고 Y=fixed."""
    mw, mg = MB(), MB()
    P = (lambda u, n, z: (u, fixed + n, z)) if axis == "x" else (lambda u, n, z: (fixed + n, u, z))
    S = (lambda su, sn, sz: (su, sn, sz)) if axis == "x" else (lambda su, sn, sz: (sn, su, sz))
    openings = [o for o in openings if o[3] <= height + 1e-6 or o[2] < height]
    cuts = sorted({a, c_end} | {o[0] for o in openings} | {o[1] for o in openings})
    for u0, u1 in zip(cuts, cuts[1:]):
        um = (u0 + u1) / 2
        zs = [(0.0, height)]
        for o in openings:
            if o[0] <= um <= o[1]:
                zs = [z for z in ((0.0, min(o[2], height)), (min(o[3], height), height)) if z[1] - z[0] > 1e-4]
        for z0, z1 in zs:
            mw.box(S(u1 - u0, t, z1 - z0), P(um, 0, (z0 + z1) / 2), "wall", segs=0)
    d = inward
    mw.box(S(c_end - a, 0.02, 0.12), P((a + c_end) / 2, d * (t / 2 + 0.01), 0.06), "base_dark", segs=0)
    if height < 1.5:
        mw.box(S(c_end - a + 0.04, t + 0.04, 0.05), P((a + c_end) / 2, 0, height + 0.025), "base_dark", segs=0)
    for o in openings:
        o0, o1, z0, z1 = o[:4]
        z1 = min(z1, height)
        if z1 - z0 < 0.05:
            continue
        w, h = o1 - o0, z1 - z0
        uc, zc = (o0 + o1) / 2, (z0 + z1) / 2
        fw = 0.07
        if z1 < height - 1e-4 or height > 1.5:
            mw.box(S(w + 2 * fw, 0.1, fw), P(uc, 0, z1 - fw / 2), "frame_green", segs=0)
        if z0 > 0:
            mw.box(S(w + 2 * fw, 0.1, fw), P(uc, 0, z0 + fw / 2), "frame_green", segs=0)
        for uu in (o0 + fw / 2, o1 - fw / 2):
            mw.box(S(fw, 0.1, h), P(uu, 0, zc), "frame_green", segs=0)
        # 격자 창(가로세로 약 0.5m 칸).
        n = max(1, round(w / 0.55))
        for k in range(1, n):
            mw.box(S(0.04, 0.08, h), P(o0 + w * k / n, 0, zc), "frame_green", segs=0)
        rows = max(1, round(h / 0.6))
        for k in range(1, rows):
            mw.box(S(w, 0.08, 0.04), P(uc, 0, z0 + h * k / rows), "frame_green", segs=0)
        if z0 > 0.3:
            mw.box(S(w + 0.12, 0.26, 0.05), P(uc, d * 0.06, z0 - 0.025), "wall_trim", segs=0)
        if z0 <= 0 and len(o) > 4:  # 유리 출입문 손잡이
            for side in (1, -1):
                mw.box(S(0.03, 0.06, 0.9), P(o1 - 0.2, side * d * 0.07, 1.05), "metal", segs=0)
        mg.box(S(w, 0.015, h), P(uc, 0, zc), "glass", segs=0)
    if height > 1.5:
        # 걸레받이 위 몰딩과 천장 아래 띠(크림색).
        mw.box(S(c_end - a, 0.03, 0.05), P((a + c_end) / 2, d * (t / 2 + 0.015), 0.95), "wall_trim", segs=0)
    ob = b.inst(mw.mesh(f"wall_{name}"), f"Wall_{name}", (0, 0, 0), coll="architecture", study_room_part=part)
    glass = None
    if openings and mg.mats:
        # 유리는 실내 렌더에만 쓴다. 앱은 창을 열어 두어 밖의 나무·하늘이 보인다.
        glass = b.inst(mg.mesh(f"wall_{name}_glass"), f"Wall_{name}_Glass", (0, 0, 0), coll="architecture", study_room_part="interior")
        glass.visible_shadow = False
    return ob, glass


SOUTH_WINDOWS = [(0.5, 3.4, 1.35, 3.7), (3.9, 9.6, 1.35, 3.7), (10.6, 15.4, 1.0, 3.7)]
WEST_OPENINGS = [(1.1, 4.9, 1.3, 3.7), (5.2, 6.4, 0, 2.7, "door")]


def build_architecture(b):
    # 바닥: L자 판(윗면 콘크리트, 옆면 어두운 받침)
    bm = bmesh.new()
    pts = [(-0.2, -0.2), (16.2, -0.2), (16.2, 12.9), (10.2, 12.9), (10.2, 7.0), (-0.2, 7.0)]
    f = bm.faces.new([bm.verts.new((x, y, 0)) for x, y in pts])
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=(0, 0, -0.35), verts=[e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for fc in bm.faces:
        fc.material_index = 0 if fc.normal.z > 0.5 else 1
    me = bpy.data.meshes.new(PREFIX + "floor")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat("floor_wood"))
    me.materials.append(mat("base_dark"))
    b.inst(me, "Floor", (0, 0, 0), coll="architecture", study_room_part="shell")
    b.inst(MB().box((0.7, 1.1, 0.015), (0.4, 5.8, 0.0075), "base_dark", segs=0).mesh("door_mat"), "Entrance_Mat", (0, 0, 0), coll="architecture", study_room_part="shell")

    H = ROOM_H
    # 남·서 벽: 실내용(천장까지)과 앱용(카메라 쪽을 자른 낮은 벽) 두 벌.
    # 남·서 벽: 천장까지 막힌 벽(앱·실내 렌더)과 위에서 내려다보는 미리보기용 낮은 벽 두 벌.
    # 앱 카메라는 내 자리 둘레(1인칭·3인칭·머리 위)라 사방 벽과 천장이 모두 있어야 한다.
    _wall(b, "South", "x", -0.1, -0.2, 16.0, H, SOUTH_WINDOWS, +1, part="near")
    _wall(b, "West", "y", -0.1, 0.0, 6.8, H, WEST_OPENINGS, +1, part="near")
    _wall(b, "South_Cutaway", "x", -0.1, -0.2, 16.0, CUTAWAY_H, [], +1, part="cutaway")
    _wall(b, "West_Cutaway", "y", -0.1, 0.0, 6.8, CUTAWAY_H, [(5.2, 6.4, 0, CUTAWAY_H)], +1, part="cutaway")
    _wall(b, "North", "x", 6.9, -0.2, 10.4, H, [(0.9, 3.1, 1.1, 3.6), (8.95, 10.05, 1.1, 3.6)], -1)
    _wall(b, "WingWest", "y", 10.3, 6.7, 12.9, H, [], +1)
    _wall(b, "WingNorth", "x", 12.8, 10.2, 16.2, H, [(12.2, 15.4, 1.1, 3.6)], -1)
    _wall(b, "East", "y", 16.1, -0.2, 12.9, H, [(0.4, 3.7, 0.08, 3.9), (4.3, 7.4, 0.08, 3.9), (8.0, 12.2, 0.08, 3.9)], -1)

    # 천장(노출형): 실내 렌더에만 쓰고 앱에는 내보내지 않는다.
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x, y, H)) for x, y in pts])
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=(0, 0, 0.2), verts=[e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(PREFIX + "ceiling")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat("wall"))
    b.inst(me, "Ceiling_Slab", (0, 0, 0), coll="architecture", study_room_part="near")
    c = MB()
    for y in (2.0, 4.8):
        c.box((16.0, 0.3, 0.35), (8.0, y, H - 0.175), "wall", segs=0)
    c.box((0.3, 5.9, 0.35), (13.2, 9.85, H - 0.175), "wall", segs=0)
    c.cyl(0.22, 0.22, 15.0, (8.0, 6.1, H - 0.45), "metal", rot=(0, 90, 0))
    c.cyl(0.22, 0.22, 5.6, (15.0, 9.4, H - 0.45), "metal", rot=(90, 0, 0))
    for x in (2.0, 6.0, 10.0, 14.0):
        c.box((0.03, 0.03, 0.2), (x, 6.1, H - 0.12), "black", segs=0)
    for y in (1.0, 3.4):
        c.box((12.0, 0.05, 0.04), (7.0, y, H - 0.05), "black", segs=0)
        for k in range(6):
            c.cyl(0.035, 0.035, 0.12, (1.8 + k * 2.1, y, H - 0.12), "black", rot=(20, 0, 0))
    b.inst(c.mesh("ceiling_details"), "Ceiling_Details", (0, 0, 0), coll="architecture", study_room_part="interior")


# ---------------------------------------------------------------------------
# 가구 원형(메시 하나를 여러 오브젝트가 공유)

BOOK_COLORS = ["terracotta", "blue", "mustard", "sage", "pink", "lilac", "mint", "cream", "walnut"]


def build_prototypes():
    def bistro_chair(name, seat):
        mb = MB()
        for sx in (-1, 1):
            for sy in (-1, 1):
                mb.box((0.028, 0.028, 0.46), (sx * 0.18, sy * 0.17, 0.23), "black", segs=0, rot=(-sy * 2.5, sx * 2.5, 0))
        mb.box((0.44, 0.42, 0.04), (0, 0, 0.47), seat, bevel=0.016)
        for a in (238, 302):
            x, y = 0.24 * math.cos(math.radians(a)), 0.03 + 0.24 * math.sin(math.radians(a))
            mb.box((0.022, 0.022, 0.27), (x, y, 0.61), "black", segs=0, rot=(-8, 0, 0))
        mb.arc(0.235, 0.025, 0.7, 0.82, 222, 318, (0, 0.045, 0), seat, n=7)
        return mb.mesh(name)

    # 나무 다리에 등나무(라탄) 방석·등받이 카페 의자. 이름은 배치 코드와 맞춘다.
    bistro_chair("bistro_chair_oak", "rattan")
    bistro_chair("bistro_chair_walnut", "oak")

    mb = MB()
    mb.box((6.4, 1.2, 0.06), (0, 0, 0.73), "oak", bevel=0.014)
    for x in (-2.85, 0, 2.85):
        for y in (-0.48, 0.48):
            mb.box((0.06, 0.06, 0.69), (x, y, 0.355), "black", segs=0)
        mb.box((0.06, 1.0, 0.05), (x, 0, 0.685), "black", segs=0)
        mb.box((0.08, 1.06, 0.03), (x, 0, 0.015), "black", segs=0)
    mb.box((5.8, 0.06, 0.06), (0, 0, 0.68), "black", segs=0)
    for x in (-1.9, 0, 1.9):  # 콘센트 박스
        mb.box((0.22, 0.1, 0.015), (x, 0, 0.7675), "black", segs=0)
    mb.mesh("communal_table")

    (MB().box((0.34, 0.24, 0.012), (0, 0, 0.006), "cognac_dark", segs=0)
     .box((0.16, 0.22, 0.016), (-0.083, 0, 0.018), "paper", segs=0, rot=(0, -4, 0))
     .box((0.16, 0.22, 0.016), (0.083, 0, 0.018), "paper", segs=0, rot=(0, 4, 0))).mesh("open_book")
    (MB().cyl(0.04, 0.036, 0.09, (0, 0, 0.045), "ceramic", segs=5)
     .box((0.03, 0.015, 0.05), (0.05, 0, 0.05), "ceramic", segs=0)).mesh("mug")
    lt = MB()
    lt.box((0.32, 0.22, 0.014), (0, 0, 0.007), "steel", segs=0)
    s15, c15 = math.sin(math.radians(15)), math.cos(math.radians(15))
    lt.box((0.32, 0.012, 0.21), (0, -0.105 - 0.1 * s15, 0.105 * c15 + 0.007), "steel", segs=0, rot=(-15, 0, 0))
    lt.box((0.29, 0.002, 0.18), (0, -0.098 - 0.1 * s15, 0.105 * c15 + 0.009), "screen", segs=0, rot=(-15, 0, 0))
    lt.mesh("laptop")
    for seed in range(4):
        rnd = random.Random(seed)
        mb, z = MB(), 0
        for _ in range(3):
            h = rnd.uniform(0.03, 0.05)
            mb.box((rnd.uniform(0.19, 0.25), rnd.uniform(0.14, 0.18), h), (0, 0, z + h / 2), rnd.choice(BOOK_COLORS), segs=0, rot=(0, 0, rnd.uniform(-10, 10)))
            z += h
        mb.mesh(f"book_stack_{seed}")
    tp = MB().cyl(0.06, 0.05, 0.09, (0, 0, 0.045), "pot_white", segs=6)
    for k in range(4):
        a = math.radians(k * 90 + 45)
        tp.ico(0.055, (0.035 * math.cos(a), 0.035 * math.sin(a), 0.13), "leaf", sub=0, scale=(1, 1, 0.75))
    tp.ico(0.06, (0, 0, 0.16), "leaf_light", sub=0, scale=(1, 1, 0.85))
    tp.mesh("tiny_plant")

    d = MB()
    d.box((1.02, 0.58, 0.04), (0, 0, 0.74), "oak", bevel=0.012)
    for sx in (-1, 1):
        for sy in (-1, 1):
            d.box((0.04, 0.04, 0.72), (sx * 0.46, sy * 0.22, 0.36), "black", segs=0)
        d.box((0.04, 0.5, 0.04), (sx * 0.46, 0, 0.7), "black", segs=0)
        d.box((0.04, 0.5, 0.03), (sx * 0.46, 0, 0.015), "black", segs=0)
    for k, bx in enumerate((0.0, 0.06)):
        d.box((0.055, 0.12, 0.17), (bx + 0.3, -0.2, 0.845), BOOK_COLORS[k * 2], segs=0)
    d.mesh("study_desk")
    lamp = MB()
    lamp.cyl(0.065, 0.07, 0.02, (0, 0, 0.01), "black", segs=6)
    lamp.cyl(0.01, 0.01, 0.34, (0, 0, 0.18), "black", segs=4)
    lamp.cyl(0.01, 0.01, 0.16, (0.07, 0, 0.35), "black", segs=4, rot=(0, 75, 0))
    lamp.cyl(0.09, 0.03, 0.08, (0.15, 0, 0.33), "black", segs=6)
    lamp.cyl(0.075, 0.075, 0.005, (0.15, 0, 0.29), "lampglow", segs=6)
    lamp.mesh("desk_lamp")

    def sofa(name, L, fab, n, pillow=None):
        mb = MB()
        mb.box((L - 0.12, 0.78, 0.06), (0, 0, 0.03), "black", segs=0)
        mb.box((L, 0.9, 0.22), (0, 0, 0.17), fab, bevel=0.035)
        w = (L - 0.36) / n
        for k in range(n):
            cx = -L / 2 + 0.18 + w * (k + 0.5)
            mb.box((w - 0.012, 0.66, 0.14), (cx, 0.07, 0.345), fab, bevel=0.04)
            mb.box((w - 0.03, 0.2, 0.38), (cx, -0.2, 0.6), fab, bevel=0.05, rot=(-10, 0, 0))
        mb.box((L, 0.22, 0.44), (0, -0.34, 0.5), fab, bevel=0.05)
        for sx in (-1, 1):
            mb.box((0.19, 0.9, 0.5), (sx * (L / 2 - 0.095), 0, 0.39), fab, bevel=0.05)
        if pillow:
            mb.box((0.38, 0.13, 0.36), (-L / 2 + 0.42, -0.08, 0.58), pillow, bevel=0.05, rot=(-14, 0, 12))
            if n > 1:
                mb.box((0.36, 0.13, 0.34), (L / 2 - 0.42, -0.08, 0.57), "cream", bevel=0.05, rot=(-14, 0, -10))
        return mb.mesh(name)

    sofa("sofa3_cognac", 2.2, "cognac", 3, pillow="pink")
    sofa("sofa3_grey", 2.2, "grey_fab", 3, pillow="lilac")
    sofa("armchair_grey", 0.95, "grey_fab", 1)
    sofa("armchair_cognac", 0.95, "cognac", 1, pillow="cream")

    def shell_chair(name, fab):
        mb = MB()
        for sx in (-1, 1):
            for sy in (-1, 1):
                mb.cyl(0.02, 0.014, 0.3, (sx * 0.24, sy * 0.22, 0.15), "walnut", segs=4, rot=(-sy * 6, sx * 6, 0))
        mb.box((0.66, 0.6, 0.12), (0, 0.02, 0.35), fab, bevel=0.04)
        mb.arc(0.27, 0.07, 0.3, 0.78, 195, 345, (0, 0, 0), fab, n=10)
        mb.arc(0.27, 0.07, 0.3, 0.56, 150, 195, (0, 0, 0), fab, n=4)
        mb.arc(0.27, 0.07, 0.3, 0.56, 345, 390, (0, 0, 0), fab, n=4)
        mb.box((0.48, 0.4, 0.08), (0, 0.06, 0.44), fab, bevel=0.03)
        return mb.mesh(name)

    shell_chair("shell_chair_orange", "orange")
    shell_chair("shell_chair_cognac", "cognac")
    for name, fab, r, h in (("pouf_mustard", "pink", 0.26, 0.4), ("pouf_cognac", "cognac_dark", 0.24, 0.38), ("pouf_grey", "grey_dark", 0.24, 0.38)):
        MB().cyl(r, r, h, (0, 0, h / 2), fab, segs=8, bevel=0.05).mesh(name)
    for name, w, dd, m1, m2 in (("rug_a", 3.6, 2.6, "rug1", "pink"), ("rug_b", 3.3, 2.2, "rug3", "rug1"), ("rug_c", 3.0, 2.0, "rug2", "rug1")):
        MB().box((w, dd, 0.012), (0, 0, 0.006), m1, segs=0).box((w - 0.3, dd - 0.3, 0.004), (0, 0, 0.013), m2, segs=0).mesh(name)
    fl = MB()
    fl.cyl(0.16, 0.17, 0.03, (0, 0, 0.015), "black", segs=8)
    fl.cyl(0.014, 0.014, 1.42, (0, 0, 0.74), "black", segs=4)
    fl.cyl(0.2, 0.17, 0.28, (0, 0, 1.5), "cream", segs=8)
    fl.cyl(0.16, 0.16, 0.01, (0, 0, 1.37), "lampglow_soft", segs=8)
    fl.mesh("floor_lamp")
    (MB().cyl(0.24, 0.24, 0.035, (0, 0, 0.5025), "walnut", segs=8)
     .cyl(0.025, 0.025, 0.48, (0, 0, 0.25), "black", segs=4)
     .cyl(0.16, 0.17, 0.02, (0, 0, 0.01), "black", segs=8)).mesh("side_table")
    ct = MB().box((1.2, 0.65, 0.05), (0, 0, 0.4), "walnut", bevel=0.02).box((1.08, 0.55, 0.025), (0, 0, 0.14), "walnut", segs=0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            ct.box((0.045, 0.045, 0.4), (sx * 0.54, sy * 0.26, 0.2), "black", segs=0)
    ct.mesh("coffee_table_rect")
    (MB().cyl(0.45, 0.45, 0.04, (0, 0, 0.42), "white_top", segs=8, bevel=0.012)
     .cyl(0.05, 0.05, 0.38, (0, 0, 0.21), "black", segs=6)
     .cyl(0.25, 0.27, 0.03, (0, 0, 0.015), "black", segs=8)).mesh("coffee_table_round")


# ---------------------------------------------------------------------------
# 배치

TABLE = (5.4, 3.4)  # 공용 테이블 중심
DESK_X = (1.3, 2.6, 4.4, 5.6, 6.8, 8.0, 9.2)


def build_group_study(b):
    rng = random.Random(11)
    tx, ty = TABLE
    b.inst(b.mesh("communal_table"), "GroupTable", (tx, ty, 0), coll="group")
    oak, walnut = b.mesh("bistro_chair_oak"), b.mesh("bistro_chair_walnut")
    for i in range(6):
        x = tx - 3.2 + 1.0667 * (i + 0.5)
        b.inst(oak if i % 2 else walnut, f"GroupChair_N{i + 1:02d}", (x + rng.uniform(-0.05, 0.05), ty + 0.9, 0), 180 + rng.uniform(-7, 7), coll="group")
        b.inst(walnut if i % 2 else oak, f"GroupChair_S{i + 1:02d}", (x + rng.uniform(-0.05, 0.05), ty - 0.9 + rng.uniform(-0.05, 0), 0), rng.uniform(-7, 7), coll="group")
    top = 0.76
    for i in range(6):
        x = tx - 3.2 + 1.0667 * (i + 0.5)
        side = 1 if i % 2 == 0 else -1
        facing = 180 if side > 0 else 0
        if i in (1, 4):
            b.inst(b.mesh("laptop"), f"Table_Laptop_{i}", (x, ty + side * 0.33, top), facing + rng.uniform(-8, 8), coll="group")
        else:
            b.inst(b.mesh("open_book"), f"Table_Book_{i}", (x, ty + side * 0.32, top), facing + rng.uniform(-12, 12), coll="group")
        b.inst(b.mesh("mug"), f"Table_Mug_{i}", (x + 0.26, ty + side * 0.3, top), rng.uniform(0, 360), coll="group")
        if i in (0, 3, 5):
            b.inst(b.mesh("open_book"), f"Table_Book_Opp_{i}", (x - 0.1, ty - side * 0.32, top), (0 if side > 0 else 180) + rng.uniform(-12, 12), coll="group")
    for k, x in enumerate((tx - 2.6, tx - 0.9, tx + 0.9, tx + 2.6)):
        me = b.mesh("tiny_plant") if k % 2 == 0 else b.mesh(f"book_stack_{k}")
        b.inst(me, f"Table_Center_{k}", (x, ty, top), rng.uniform(0, 40), coll="group")
    # 테이블 위 큰 펜던트(천장에 매달림). 앱 화면은 천장을 잘라 내므로 실내용으로만 쓴다
    # (위에서 내려다보면 앉은 사람 머리를 가린다).
    p = MB()
    for x in (tx - 2.1, tx, tx + 2.1):
        p.cyl(0.006, 0.006, ROOM_H - 1.9, (x, ty, (ROOM_H + 1.9) / 2), "black", segs=3)
        p.cyl(0.3, 0.04, 0.26, (x, ty, 1.85), "black", segs=8)
        p.cyl(0.26, 0.26, 0.006, (x, ty, 1.72), "lampglow", segs=8)
    b.inst(p.mesh("table_pendants"), "Table_Pendants", (0, 0, 0), coll="group", study_room_part="interior")


def build_individual_study(b):
    rng = random.Random(12)
    oak, walnut = b.mesh("bistro_chair_oak"), b.mesh("bistro_chair_walnut")
    for i, x in enumerate(DESK_X):
        n = f"{i + 1:02d}"
        b.inst(b.mesh("study_desk"), f"StudyDesk_{n}", (x, 0.32, 0), coll="individual")
        b.inst(oak if i % 2 else walnut, f"StudyChair_{n}", (x + rng.uniform(-0.06, 0.06), 0.92, 0), 180 + rng.uniform(-9, 9), coll="individual")
        b.inst(b.mesh("desk_lamp"), f"StudyLamp_{n}", (x - 0.38, 0.2, 0.76), rng.uniform(-25, -5), coll="individual")
        work = b.mesh("laptop") if i % 3 == 1 else b.mesh("open_book")
        b.inst(work, f"StudyWork_{n}", (x - 0.02, 0.4, 0.76), 180 + rng.uniform(-10, 10), coll="individual")
        if i % 2 == 0:
            b.inst(b.mesh("mug"), f"StudyMug_{n}", (x + 0.36, 0.45, 0.76), rng.uniform(0, 360), coll="individual")


def build_lounges(b):
    m = b.mesh
    L = "lounge"
    b.inst(m("rug_a"), "Lounge1_Rug", (13.6, 4.7, 0), coll=L)
    b.inst(m("sofa3_cognac"), "Lounge1_Sofa", (13.6, 5.72, 0), 180, coll=L)
    b.inst(m("coffee_table_rect"), "Lounge1_CoffeeTable", (13.6, 4.65, 0), coll=L)
    b.inst(m("shell_chair_orange"), "Lounge1_ShellChair_W", (12.2, 4.55, 0), -80, coll=L)
    b.inst(m("shell_chair_cognac"), "Lounge1_ShellChair_E", (15.0, 4.55, 0), 95, coll=L)
    b.inst(m("pouf_mustard"), "Lounge1_Pouf", (13.6, 3.75, 0), coll=L)
    b.inst(m("mug"), "Lounge1_Mug_A", (13.35, 4.6, 0.425), 30, coll=L)
    b.inst(m("mug"), "Lounge1_Mug_B", (13.9, 4.75, 0.425), 200, coll=L)
    b.inst(m("book_stack_1"), "Lounge1_Books", (13.75, 4.5, 0.425), 15, coll=L)
    b.inst(m("floor_lamp"), "Lounge1_FloorLamp", (15.45, 5.75, 0), coll=L)
    b.inst(m("rug_b"), "Lounge2_Rug", (13.3, 1.25, 0), coll=L)
    b.inst(m("sofa3_grey"), "Lounge2_Sofa", (13.3, 2.2, 0), 180, coll=L)
    b.inst(m("coffee_table_round"), "Lounge2_CoffeeTable", (13.3, 1.2, 0), coll=L)
    b.inst(m("armchair_cognac"), "Lounge2_Armchair_W", (11.95, 1.15, 0), -90, coll=L)
    b.inst(m("armchair_grey"), "Lounge2_Armchair_E", (14.65, 1.15, 0), 90, coll=L)
    b.inst(m("tiny_plant"), "Lounge2_Plant", (13.3, 1.2, 0.44), coll=L)
    b.inst(m("laptop"), "Lounge2_Laptop", (13.1, 1.0, 0.44), -20, coll=L)
    b.inst(m("mug"), "Lounge2_Mug", (13.55, 0.98, 0.44), 90, coll=L)
    b.inst(m("rug_c"), "Wing_Rug", (14.2, 8.3, 0), coll=L)
    b.inst(m("armchair_cognac"), "Wing_Armchair_W", (13.45, 8.7, 0), 180, coll=L)
    b.inst(m("shell_chair_orange"), "Wing_ShellChair_E", (15.0, 8.65, 0), 180, coll=L)
    b.inst(m("pouf_cognac"), "Wing_Ottoman_W", (13.45, 7.65, 0), coll=L)
    b.inst(m("pouf_grey"), "Wing_Ottoman_E", (15.0, 7.65, 0), coll=L)
    b.inst(m("side_table"), "Wing_SideTable", (14.22, 8.95, 0), coll=L)
    b.inst(m("mug"), "Wing_Mug", (14.15, 8.95, 0.52), coll=L)
    b.inst(m("open_book"), "Wing_Book", (14.28, 8.85, 0.52), 40, coll=L)
    b.inst(m("floor_lamp"), "Wing_FloorLamp", (15.6, 9.55, 0), coll=L)
    b.inst(m("armchair_grey"), "West_Armchair_A", (0.62, 2.6, 0), -90, coll=L)
    b.inst(m("armchair_cognac"), "West_Armchair_B", (0.62, 4.35, 0), -90, coll=L)
    b.inst(m("side_table"), "West_SideTable", (0.42, 3.48, 0), coll=L)
    b.inst(m("book_stack_2"), "West_Books", (0.42, 3.48, 0.52), 20, coll=L)
    b.inst(m("floor_lamp"), "West_FloorLamp", (0.3, 1.55, 0), coll=L)


def build_plants(b):
    def pot(mb, r, h, m):
        mb.cyl(r, r * 0.82, h, (0, 0, h / 2), m, segs=8)
        mb.cyl(r * 0.92, r * 0.92, 0.01, (0, 0, h - 0.015), "soil", segs=8)

    def fiddle(name, seed, H=1.7):
        rnd = random.Random(seed)
        mb = MB()
        pot(mb, 0.22, 0.45, "pot_concrete")
        mb.cyl(0.022, 0.016, H - 0.4, (0, 0, 0.45 + (H - 0.4) / 2), "trunk", segs=4)
        for _ in range(14):
            z = rnd.uniform(0.85, H + 0.05)
            a = rnd.uniform(0, 360)
            rr = 0.08 + (H - z) * 0.18 + rnd.uniform(0, 0.12)
            mb.ico(0.14, (rr * math.cos(math.radians(a)), rr * math.sin(math.radians(a)), z), rnd.choice(("leaf", "leaf_dark", "leaf_light")),
                   sub=0, scale=(1, 0.35, 1.3), rot=(rnd.uniform(-35, 35), rnd.uniform(-30, 30), a + 90))
        return mb.mesh(name)

    def snake(name, seed):
        rnd = random.Random(seed)
        mb = MB()
        pot(mb, 0.17, 0.32, "pot_white")
        for k in range(8):
            a = k * 45 + rnd.uniform(-10, 10)
            rr = rnd.uniform(0.02, 0.09)
            h = rnd.uniform(0.45, 0.8)
            mb.cyl(0.045, 0.005, h, (rr * math.cos(math.radians(a)), rr * math.sin(math.radians(a)), 0.3 + h / 2), rnd.choice(("leaf_dark", "leaf")),
                   segs=3, rot=(rnd.uniform(-8, 8), rnd.uniform(-8, 8), a))
        return mb.mesh(name)

    def bush(name, seed, r=0.3):
        rnd = random.Random(seed)
        mb = MB()
        pot(mb, 0.2, 0.38, "pot_terra")
        for _ in range(7):
            a = rnd.uniform(0, 360)
            rr = rnd.uniform(0, r * 0.6)
            mb.ico(rnd.uniform(0.15, 0.21), (rr * math.cos(math.radians(a)), rr * math.sin(math.radians(a)), 0.52 + rnd.uniform(0, 0.33)), rnd.choice(("leaf", "leaf_dark", "leaf_light")))
        return mb.mesh(name)

    f1, f2 = fiddle("plant_fiddle_a", 1), fiddle("plant_fiddle_b", 2, 1.9)
    s1, b1 = snake("plant_snake", 3), bush("plant_bush", 4)
    rng = random.Random(5)
    for name, me, loc in (("Plant_Fiddle_NW", f1, (0.4, 6.5)), ("Plant_Snake_N", s1, (3.42, 6.55)), ("Plant_Fiddle_N", f2, (9.95, 6.45)),
                          ("Plant_Bush_E", b1, (15.62, 4.0)), ("Plant_Fiddle_NE", f2, (15.6, 12.35)), ("Plant_Snake_S", s1, (3.5, 0.28)),
                          ("Plant_Bush_SE", b1, (15.62, 0.35)), ("Plant_Snake_Wing", s1, (12.65, 9.9))):
        b.inst(me, name, (*loc, 0), rng.uniform(0, 360), coll="plants")


def build_counter(b):
    rng = random.Random(9)
    mb = MB()

    def run(x0, x1, y0, y1, slat_side):
        H = 1.05
        cx, cy, w, d = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
        mb.box((w - 0.06, d - 0.06, 0.1), (cx, cy, 0.05), "black", segs=0)
        mb.box((w, d, H - 0.14), (cx, cy, 0.1 + (H - 0.14) / 2), "walnut", segs=0)
        mb.box((w + 0.06, d + 0.06, 0.05), (cx, cy, H - 0.025), "white_top", bevel=0.012)
        if slat_side == "x":
            n = int(d / 0.2)
            for k in range(n):
                mb.box((0.035, 0.07, H - 0.2), (x1 + 0.0175, y0 + 0.06 + k * (d - 0.12) / (n - 1), 0.12 + (H - 0.2) / 2), "oak", segs=0)
        else:
            n = int(w / 0.2)
            for k in range(n):
                mb.box((0.07, 0.035, H - 0.2), (x0 + 0.06 + k * (w - 0.12) / (n - 1), y0 - 0.0175, 0.12 + (H - 0.2) / 2), "oak", segs=0)

    run(11.6, 12.2, 7.95, 11.5, "x")
    run(10.95, 12.2, 7.35, 7.95, "y")
    mb.box((0.55, 4.6, 0.88), (10.68, 9.95, 0.44), "walnut", segs=0)
    mb.box((0.6, 4.65, 0.04), (10.7, 9.95, 0.9), "white_top", segs=0)
    for k in range(8):
        mb.box((0.01, 0.52, 0.7), (10.96, 7.95 + k * 0.575, 0.47), "walnut_dark", segs=0)
    for z in (1.55, 1.95):
        mb.box((0.3, 4.4, 0.04), (10.57, 9.95, z), "oak", segs=0)
    for y in (7.8, 9.95, 12.1):
        mb.box((0.3, 0.03, 0.5), (10.57, y, 1.74), "black", segs=0)
    mb.box((0.04, 1.8, 0.7), (10.42, 9.95, 2.55), "black", segs=0)
    mb.box((0.01, 1.68, 0.58), (10.445, 9.95, 2.55), "chalk", segs=0)
    for r in range(5):
        for c in (-1, 1):
            mb.box((0.005, 0.55 - 0.1 * (r % 2), 0.025), (10.452, 9.95 + c * 0.42, 2.75 - r * 0.1), "cream", segs=0)
    for y in (8.4, 9.6, 10.8):
        mb.cyl(0.006, 0.006, 1.95, (11.9, y, 3.225), "black", segs=3)
        mb.cyl(0.17, 0.03, 0.2, (11.9, y, 2.15), "black", segs=8)
        mb.cyl(0.14, 0.14, 0.006, (11.9, y, 2.05), "lampglow", segs=8)
    b.inst(mb.mesh("counter_body"), "Counter_Body", (0, 0, 0), coll="counter")

    e = MB()
    e.box((0.5, 0.7, 0.42), (0, 0, 0.21), "metal", bevel=0.03)
    e.box((0.52, 0.72, 0.04), (0, 0, 0.44), "black", segs=0)
    for y in (-0.18, 0.18):
        e.cyl(0.04, 0.035, 0.08, (-0.28, y, 0.2), "black", segs=6, rot=(0, 90, 0))
        e.box((0.14, 0.03, 0.025), (-0.38, y, 0.19), "black", segs=0)
    e.box((0.18, 0.6, 0.02), (-0.27, 0, 0.06), "steel", segs=0)
    for k in range(4):
        e.cyl(0.035, 0.032, 0.07, (0.05, -0.24 + k * 0.16, 0.495), "ceramic", segs=6)
    b.inst(e.mesh("espresso"), "Counter_Espresso", (10.7, 10.4, 0.92), 180, coll="counter")
    gr = (MB().box((0.18, 0.2, 0.3), (0, 0, 0.15), "black", bevel=0.02)
          .cyl(0.08, 0.05, 0.2, (0, 0, 0.4), "glass", segs=6).cyl(0.06, 0.06, 0.12, (0, 0, 0.36), "coffee", segs=6))
    b.inst(gr.mesh("grinder"), "Counter_Grinder", (10.7, 11.25, 0.92), coll="counter")
    pos = (MB().box((0.12, 0.14, 0.02), (0, 0, 0.01), "black", segs=0).box((0.02, 0.25, 0.18), (0, 0, 0.11), "black", segs=0, rot=(0, -20, 0))
           .box((0.005, 0.22, 0.15), (0.012, 0, 0.11), "screen", segs=0, rot=(0, -20, 0)))
    b.inst(pos.mesh("pos"), "Counter_POS", (11.85, 10.9, 1.05), coll="counter")
    ck = MB()
    ck.cyl(0.2, 0.2, 0.015, (0, 0, 0.0075), "white_top", segs=8).cyl(0.03, 0.03, 0.08, (0, 0, 0.055), "white_top", segs=4)
    ck.cyl(0.17, 0.17, 0.015, (0, 0, 0.1), "white_top", segs=8).cyl(0.12, 0.12, 0.1, (0, 0, 0.16), "cake", segs=8).cyl(0.12, 0.12, 0.015, (0, 0, 0.215), "cream", segs=8)
    ck.cyl(0.19, 0.19, 0.3, (0, 0, 0.25), "glass", segs=8)
    cake = ck.mesh("cake_dome")
    b.inst(cake, "Counter_CakeDome_A", (11.25, 7.65, 1.05), coll="counter")
    b.inst(cake, "Counter_CakeDome_B", (11.85, 8.35, 1.05), coll="counter")
    for k, y in enumerate((9.2, 9.35, 9.5)):
        b.inst(b.mesh("mug"), f"Counter_Cup_{k}", (11.85, y, 1.05), rng.uniform(0, 360), coll="counter")
    b.inst(b.mesh("tiny_plant"), "Counter_Plant", (11.85, 9.9, 1.05), coll="counter")
    j = MB()
    for k in range(14):
        y = 8.0 + k * 0.3
        z = 1.57 if k % 2 else 1.97
        if k % 3 == 0:
            j.cyl(0.06, 0.06, 0.18, (10.55, y, z + 0.09), "glass", segs=6).cyl(0.055, 0.055, 0.12, (10.55, y, z + 0.06), "coffee", segs=6).cyl(0.062, 0.062, 0.025, (10.55, y, z + 0.19), "oak", segs=6)
        elif k % 3 == 1:
            for i in range(3):
                j.cyl(0.04, 0.036, 0.09, (10.55, y - 0.1 + i * 0.1, z + 0.045), "ceramic", segs=6)
        else:
            j.cyl(0.05, 0.04, 0.14, (10.55, y, z + 0.07), rng.choice(("pot_terra", "sage", "pot_white")), segs=6)
    b.inst(j.mesh("back_bar_items"), "Counter_BackBarItems", (0, 0, 0), coll="counter")


def build_decor(b):
    colors = BOOK_COLORS + ["cognac", "grey_dark"]

    def bookshelf(name, seed, w=1.1, h=2.1, d=0.36):
        rnd = random.Random(seed)
        mb = MB()
        for sx in (-1, 1):
            mb.box((0.035, d, h), (sx * (w / 2 - 0.0175), 0, h / 2), "black", segs=0)
        shelves = [0.06, 0.5, 0.95, 1.4, 1.85]
        for z in shelves + [h - 0.015]:
            mb.box((w - 0.07, d - 0.02, 0.035), (0, 0, z), "oak", segs=0)
        for z in shelves:
            x = -w / 2 + 0.06
            while x < w / 2 - 0.14:
                if rnd.random() < 0.12:
                    mb.cyl(0.05, 0.04, 0.15, (x + 0.06, 0, z + 0.09), rnd.choice(("pot_white", "pot_terra", "ceramic")), segs=6)
                    x += 0.16
                    continue
                if rnd.random() < 0.08:
                    x += 0.14
                    continue
                bw, bh = rnd.uniform(0.07, 0.13), rnd.uniform(0.22, 0.33)
                mb.box((bw, rnd.uniform(0.2, 0.26), bh), (x + bw / 2, 0.02, z + 0.0175 + bh / 2), rnd.choice(colors), segs=0)
                x += bw + 0.005
        return mb.mesh(name)

    for k, x in enumerate((4.55, 6.5, 8.0)):
        b.inst(bookshelf(f"bookshelf_{k}", k + 20), f"Bookshelf_{k + 1:02d}", (x, 6.6, 0), coll="decor")

    def credenza(name, w, d=0.42, h=0.75):
        mb = MB()
        mb.box((w, d, h - 0.18), (0, 0, 0.18 + (h - 0.18) / 2), "walnut", bevel=0.012)
        mb.box((w + 0.02, d + 0.02, 0.035), (0, 0, h), "oak", segs=0)
        n = max(2, round(w / 0.55))
        for k in range(1, n):
            mb.box((0.01, 0.01, h - 0.26), (-w / 2 + w * k / n, -d / 2 - 0.002, 0.18 + (h - 0.18) / 2), "walnut_dark", segs=0)
        for sx in (-1, 1):
            for sy in (-1, 1):
                mb.cyl(0.018, 0.014, 0.18, (sx * (w / 2 - 0.08), sy * (d / 2 - 0.07), 0.09), "black", segs=4)
        return mb.mesh(name)

    b.inst(credenza("credenza_a", 2.2), "Credenza_North", (2.0, 6.55, 0), coll="decor")
    b.inst(credenza("credenza_b", 3.0, 0.38, 0.8), "Credenza_Wing", (13.8, 12.45, 0), coll="decor")
    v = MB()
    v.cyl(0.08, 0.05, 0.3, (0, 0, 0.15), "pot_terra", segs=6).cyl(0.06, 0.08, 0.18, (0.22, 0, 0.09), "ceramic", segs=6)
    v.ico(0.07, (0.42, 0.02, 0.07), "sage", sub=1)
    for k in range(3):
        v.cyl(0.008, 0.005, 0.35, (0, 0, 0.4), "trunk", segs=3, rot=(10 * math.cos(k * 2), 10 * math.sin(k * 2), 0))
    vases = v.mesh("vase_set")
    b.inst(vases, "Credenza_North_Vases", (1.6, 6.55, 0.7675), coll="decor")
    b.inst(b.mesh("book_stack_3"), "Credenza_North_Books", (2.6, 6.5, 0.7675), 10, coll="decor")
    b.inst(b.mesh("tiny_plant"), "Credenza_Wing_Plant_A", (12.7, 12.45, 0.8175), coll="decor")
    b.inst(b.mesh("tiny_plant"), "Credenza_Wing_Plant_B", (14.9, 12.45, 0.8175), coll="decor")
    b.inst(vases, "Credenza_Wing_Vases", (13.4, 12.45, 0.8175), coll="decor")
    b.inst(b.mesh("book_stack_1"), "Credenza_Wing_Books", (14.3, 12.4, 0.8175), -8, coll="decor")

    def frame(name, w, h, art):
        mb = MB()
        mb.box((w, 0.03, h), (0, 0, 0), "oak", segs=0)
        mb.box((w - 0.1, 0.005, h - 0.1), (0, -0.017, 0), "paper", segs=0)
        for aw, ah, ax, az, am in art:
            mb.box((aw, 0.004, ah), (ax, -0.021, az), am, segs=0)
        return mb.mesh(name)

    # 그림(원작을 옮기지 않은 단순한 꽃병·풍경·해 그림). 북쪽 벽 책장 위와 사이에 건다.
    paintings = [
        ("painting_flowers", 0.6, 0.75, [(0.5, 0.65, 0, 0, "mustard"), (0.12, 0.2, 0, -0.18, "terracotta"),
                                          (0.09, 0.09, -0.07, 0.04, "orange"), (0.09, 0.09, 0.07, 0.07, "orange"),
                                          (0.09, 0.09, 0.0, 0.14, "terracotta"), (0.02, 0.18, 0, -0.03, "leaf")]),
        ("painting_hills", 0.8, 0.55, [(0.7, 0.45, 0, 0, "blue"), (0.7, 0.16, 0, -0.14, "leaf_light"),
                                        (0.4, 0.12, -0.12, -0.06, "leaf"), (0.1, 0.1, 0.2, 0.12, "mustard")]),
        ("painting_sun", 0.5, 0.5, [(0.4, 0.4, 0, 0, "pink"), (0.16, 0.16, 0, 0.04, "orange"), (0.4, 0.06, 0, -0.12, "terracotta")]),
    ]
    for name, w, h, art in paintings:
        frame(name, w, h, art)
    for name, x, z in (("painting_flowers", 4.55, 2.75), ("painting_hills", 6.5, 2.8), ("painting_sun", 8.0, 2.75)):
        b.inst(b.mesh(name), f"Painting_{name}_{x}", (x, 6.775, z), coll="decor")
    # 벽 선반(나무 판 + 작은 화분)과 늘어진 덩굴: 날개 북벽·동쪽 창 사이 벽·북쪽 벽.
    shelf = MB()
    shelf.box((0.9, 0.22, 0.04), (0, 0, 0), "oak", segs=0)
    for x in (-0.3, 0.05, 0.32):
        shelf.cyl(0.06, 0.05, 0.1, (x, 0, 0.07), "pot_terra", segs=6)
        shelf.ico(0.08, (x, 0, 0.17), "leaf", sub=0)
    for k, x in enumerate((-0.3, 0.32)):
        for j in range(5):
            shelf.ico(0.045, (x + 0.02 * math.sin(j + k), -0.04, 0.02 - 0.1 * j), "leaf_light" if j % 2 else "leaf", sub=0, scale=(1, 0.6, 1))
    shelf_me = shelf.mesh("plant_shelf")
    for name, loc, rz in (("Shelf_North_A", (5.52, 6.68, 3.45), 0), ("Shelf_North_B", (7.25, 6.68, 3.45), 0),
                          ("Shelf_East_A", (15.88, 3.95, 2.6), 90), ("Shelf_East_B", (15.88, 7.7, 2.6), 90),
                          ("Shelf_Wing", (11.2, 12.58, 2.9), 0)):
        b.inst(shelf_me, name, loc, rz, coll="decor")


def build_cozy(b):
    """감성 소품: 벽을 따라 늘어진 전구 줄(따뜻하게 빛남), 테이블·카운터 위 분홍 튤립 꽃병."""
    bulbs = MB()
    # (시작, 끝, 높이): 북쪽 벽(창 위)·날개 북벽·동쪽 벽 위로 처지게 건다.
    runs = [((0.3, 6.72), (10.1, 6.72), 3.95), ((10.6, 12.62), (15.8, 12.62), 3.95),
            ((15.92, 0.2), (15.92, 12.4), 4.0), ((10.48, 7.0), (10.48, 12.4), 3.6)]
    for (x0, y0), (x1, y1), z in runs:
        length = math.hypot(x1 - x0, y1 - y0)
        n = int(length / 0.32)
        for k in range(n + 1):
            t = k / n
            sag = 0.22 * math.sin(math.pi * ((t * 3) % 1.0))  # 세 번 처진다
            bulbs.ico(0.035, (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z - sag), "lampglow", sub=0)
    b.inst(bulbs.mesh("fairy_lights"), "Fairy_Lights", (0, 0, 0), coll="decor")

    vase = MB()
    vase.cyl(0.05, 0.04, 0.14, (0, 0, 0.07), "pot_white", segs=6)
    rnd = random.Random(41)
    for k in range(5):
        a = k * 72 + rnd.uniform(-15, 15)
        x, y = 0.04 * math.cos(math.radians(a)), 0.04 * math.sin(math.radians(a))
        h = rnd.uniform(0.22, 0.3)
        vase.cyl(0.006, 0.006, h - 0.1, (x, y, 0.1 + (h - 0.1) / 2), "leaf", segs=3)
        vase.ico(0.035, (x * 1.3, y * 1.3, h), "tulip" if k % 3 else "petal_white", sub=0, scale=(1, 1, 1.3))
    tulips = vase.mesh("tulip_vase")
    tx, ty = TABLE
    for k, x in enumerate((tx - 2.6, tx, tx + 2.6)):
        b.inst(tulips, f"Tulips_Table_{k}", (x, ty + 0.12, 0.76), rnd.uniform(0, 360), coll="decor")
    for name, loc in (("Tulips_Counter", (11.85, 10.3, 1.05)), ("Tulips_Lounge", (13.4, 4.7, 0.425)), ("Tulips_Credenza", (2.3, 6.55, 0.7675))):
        b.inst(tulips, name, loc, rnd.uniform(0, 360), coll="decor")


def build_outdoors(b):
    """창 밖: 잔디와 둥근 나무(열어 둔 창으로 보인다). 방 판보다 조금 아래에 깐다."""
    rng = random.Random(21)
    lawn = MB().box((40.0, 34.0, 0.1), (8.0, 6.0, -0.4), "grass", segs=0)
    b.inst(lawn.mesh("lawn"), "Lawn", (0, 0, 0), coll="outdoors")

    def tree(name, seed):
        rnd = random.Random(seed)
        mb = MB()
        h = rnd.uniform(2.6, 3.4)
        mb.cyl(0.12, 0.09, h, (0, 0, h / 2), "bark", segs=5)
        for _ in range(4):
            mb.ico(rnd.uniform(0.9, 1.25), (rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), h + rnd.uniform(-0.3, 0.6)),
                   rnd.choice(("tree_a", "tree_b")), sub=1)
        return mb.mesh(name)

    trees = [tree(f"tree_{k}", k + 30) for k in range(3)]
    spots = [(x, rng.uniform(-1.5, 13.5)) for x in (18.0, 20.5)] + [(rng.uniform(18, 21), y) for y in (1.0, 5.5, 9.5, 12.5)]
    spots += [(x, 8.6) for x in (1.0, 3.6, 6.4, 8.8)] + [(x, 14.6) for x in (11.5, 13.8, 16.0)]
    for i, (x, y) in enumerate(spots):
        tree_ob = b.inst(trees[i % 3], f"Tree_{i:02d}", (x, y, -0.35), rng.uniform(0, 360), coll="outdoors")
        # 창으로 드는 볕을 가리지 않게 그림자는 만들지 않는다.
        tree_ob.visible_shadow = False


# ---------------------------------------------------------------------------
# 자리

# (가구 오브젝트, 가구 로컬 좌표의 방석 윗면 가운데). 가구 앞(사람이 보는 쪽)은 로컬 +Y다.
_CHAIR = (0.0, 0.02, 0.49)
_SHELL = (0.0, 0.06, 0.48)
_ARM = (0.0, 0.05, 0.415)
_SOFA_L, _SOFA_C, _SOFA_R = (-0.613, 0.05, 0.415), (0.0, 0.05, 0.415), (0.613, 0.05, 0.415)

# 채우는 순서. 0번이 내 자리(공용 테이블 북쪽), 1번은 바로 맞은편(나를 보고 앉아 1인칭·
# 3인칭 시점에 보인다). 테이블은 맞은편끼리 짝지어 가운데부터 채운다.
SEATS = [
    ("GroupChair_N03", _CHAIR), ("GroupChair_S03", _CHAIR), ("GroupChair_N04", _CHAIR),
    ("GroupChair_S04", _CHAIR), ("GroupChair_N02", _CHAIR), ("GroupChair_S02", _CHAIR),
    ("GroupChair_N05", _CHAIR), ("GroupChair_S05", _CHAIR), ("GroupChair_N01", _CHAIR),
    ("GroupChair_S01", _CHAIR), ("GroupChair_N06", _CHAIR), ("GroupChair_S06", _CHAIR),
    *[(f"StudyChair_{i:02d}", _CHAIR) for i in (4, 3, 5, 2, 6, 1, 7)],
    ("Lounge1_Sofa", _SOFA_C), ("Lounge1_Sofa", _SOFA_L), ("Lounge1_Sofa", _SOFA_R),
    ("Lounge1_ShellChair_W", _SHELL), ("Lounge1_ShellChair_E", _SHELL),
    ("Lounge2_Sofa", _SOFA_C), ("Lounge2_Sofa", _SOFA_L), ("Lounge2_Sofa", _SOFA_R),
    ("Lounge2_Armchair_W", _ARM), ("Lounge2_Armchair_E", _ARM),
    ("Wing_Armchair_W", _ARM), ("Wing_ShellChair_E", _SHELL),
    ("West_Armchair_A", _ARM), ("West_Armchair_B", _ARM),
]


def build_seats(b):
    """`seat_NN` 빈 노드. 블렌더 로컬 -Y가 glTF 로컬 +Z(보는 방향)가 되도록 돌린다."""
    bpy.context.view_layer.update()
    out = []
    for i, (name, local) in enumerate(SEATS):
        furniture = bpy.data.objects[name]
        world = furniture.matrix_world @ Vector(local)
        ob = bpy.data.objects.new(f"seat_{i:02d}", None)
        ob.empty_display_type = "SINGLE_ARROW"
        ob.empty_display_size = 0.3
        ob.location = world
        ob.rotation_euler = (0, 0, furniture.rotation_euler.z + math.pi)
        ob["study_room_seat"] = i
        b.coll("seats").objects.link(ob)
        out.append(ob)
    return out


def seat_table():
    """앱 자리 표(glTF 좌표·yaw)를 Dart 코드로 찍는다. yaw: 보는 방향 = (sin, 0, cos)."""
    lines = []
    for ob in sorted((o for o in bpy.data.objects if o.get("study_room_seat") is not None), key=lambda o: o["study_room_seat"]):
        x, y, z = ob.location
        yaw = ob.rotation_euler.z  # = 가구 rz + π
        yaw = math.atan2(math.sin(yaw), math.cos(yaw))
        lines.append(f"    StudyRoomSeat({x:.3f}, {z:.3f}, {-y:.3f}, {yaw:.4f}), // {ob.name}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# 조명·카메라(실내 미리보기용. 앱은 구운 텍스처만 쓴다)


def lin_color(hex_value):
    return srgb_to_linear(hex_value)


def build_lights(b, scene):
    def light(name, typ, loc, energy, color="#FFE2B8", size=None, rot=None, radius=None):
        ld = bpy.data.lights.new(PREFIX + name, typ)
        ld.energy = energy
        ld.color = lin_color(color)
        if size is not None:
            ld.size = size
        if radius is not None:
            ld.shadow_soft_size = radius
        ob = bpy.data.objects.new(name, ld)
        ob.location = loc
        if rot:
            ob.rotation_euler = [math.radians(a) for a in rot]
        b.coll("lights").objects.link(ob)
        return ob

    sun = light("Sun_Daylight", "SUN", (20, 4, 12), 5.0, "#FFEBD2", rot=(0, 55, 25))
    sun.data.angle = math.radians(10)
    k = 0
    for x in (2.0, 5.4, 8.8, 12.6):
        for y in (1.6, 4.6):
            light(f"Area_Ceiling_{k}", "AREA", (x, y, ROOM_H - 0.4), 200, "#FFEBD0", size=2.2)
            k += 1
    for x, y in ((13.2, 8.6), (13.6, 11.2)):
        light(f"Area_Ceiling_{k}", "AREA", (x, y, ROOM_H - 0.4), 200, "#FFEBD0", size=2.2)
        k += 1
    light("Area_WindowBounce", "AREA", (15.7, 6.3, 2.2), 220, "#E6F0FA", size=4, rot=(0, -90, 0))
    for name in ("Lounge1_FloorLamp", "Wing_FloorLamp", "West_FloorLamp"):
        o = bpy.data.objects[name]
        light("PL_" + name, "POINT", (o.location.x, o.location.y, 1.42), 35, radius=0.15)
    for y in (8.4, 9.6, 10.8):
        light(f"PL_CounterPendant_{y}", "POINT", (11.9, y, 1.98), 30, radius=0.1)
    for i, x in enumerate((TABLE[0] - 2.1, TABLE[0], TABLE[0] + 2.1)):
        light(f"PL_TablePendant_{i}", "POINT", (x, TABLE[1], 1.68), 45, radius=0.15)
    for o in list(b.coll("individual").objects):
        if o.name.startswith("StudyLamp"):
            p = o.matrix_world @ Vector((0.15, 0, 0.26))
            light("PL_" + o.name, "POINT", p, 6, radius=0.05)

    world = scene.world or bpy.data.worlds.new(PREFIX + "world")
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*lin_color("#E9DCCB"), 1)
    bg.inputs["Strength"].default_value = 0.6

    scene.render.engine = "BLENDER_EEVEE"
    try:
        scene.eevee.use_raytracing = True
        scene.eevee.taa_render_samples = 64
    except Exception:
        pass
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.render.resolution_x, scene.render.resolution_y = 1920, 1080

    def camera(name, lens, loc, target):
        cd = bpy.data.cameras.new(PREFIX + name)
        cd.lens = lens
        cd.clip_end = 200
        ob = bpy.data.objects.new(name, cd)
        b.coll("lights").objects.link(ob)
        ob.location = loc
        ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        return ob

    camera("Camera_Overview", 24, (6.0, -8.6, 13.4), (8.7, 5.4, 0.6))
    scene.camera = camera("Camera_Interior", 17, (0.7, 6.1, 2.3), (12.5, 3.2, 0.9))
    set_view(scene, "interior")


def set_view(scene, mode):
    """보이는 오브젝트를 고른다.

    - "app": 앱에 내보내는 방. 사방 벽·천장이 있고, 유리·천장 설비·펜던트(실내 렌더 전용)와
      낮은 미리보기 벽은 뺀다.
    - "interior": 실내 렌더. 유리·천장 설비까지 모두.
    - "overview": 위에서 내려다보는 미리보기. 남·서 벽과 천장을 낮은 벽으로 바꾼다.
    """
    for ob in scene.objects:
        part = ob.get("study_room_part")
        if part == "interior":
            hidden = mode != "interior"
        elif part == "cutaway":
            hidden = mode != "overview"
        elif part == "near":
            hidden = mode == "overview"
        else:
            continue
        ob.hide_render = hidden
        ob.hide_viewport = hidden
    cam = bpy.data.objects.get("Camera_Overview" if mode == "overview" else "Camera_Interior")
    if cam is not None:
        scene.camera = cam


def stats(scene):
    tris = 0
    for ob in scene.objects:
        if ob.type == "MESH" and not ob.hide_render:
            ob.data.calc_loop_triangles()
            tris += len(ob.data.loop_triangles)
    return tris


def run_all():
    scene = reset_scene()
    b = Builder(scene)
    build_architecture(b)
    build_prototypes()
    build_group_study(b)
    build_individual_study(b)
    build_lounges(b)
    build_plants(b)
    build_counter(b)
    build_decor(b)
    build_cozy(b)
    build_outdoors(b)
    build_seats(b)
    build_lights(b, scene)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)
    return scene


if __name__ == "__main__":
    run_all()
