"""StudyVillage v2 카툰 카페 가구·소품 키트(둥글고 통통한 로우폴리).

원본: PocketTime `tool/blender/study_room/build_study_room.py`(파일 마지막 변경 f6865a86, 복사 시점
f574f242)의 `MB` 빌더와 가구 치수. v2는 치수 계약(방석 윗면 0.49m, 책상 윗면 0.76m, 소파·안락의자
방석 0.415m, 셸 의자 0.48m, 자리 로컬 좌표)을 그대로 두고 형태·색만 바꾼다.

- 모서리: 반지름 3–9cm 베벨. 큰 부품은 2세그먼트, 작은 부품(짧은 변 5cm 미만 또는 긴 변 30cm 미만)은
  1세그먼트로 삼각형 예산을 지킨다. 베벨 띠는 매끈(smooth), 큰 평면과의 경계는 날카롭게(sharp edge)
  둬서 웹 셀 셰이딩이 큰 면은 평평하게, 모서리는 둥글게 읽는다.
- 원기둥은 8각 이상(전선만 4각), 옆면 매끈 + 뚜껑 경계 날카롭게.
- 색은 단색 재질(가는 결·체크 무늬 없음). 상판 가장자리 하이라이트 띠는 색으로 만든다.
- 법선은 모두 바깥(recalc). 반투명 재질 없음.

Blender 5.x. 씬을 직접 만들지 않는다(`build_study_room_v2.py`·`preview_prototypes.py`가 쓴다).
"""

import math
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

PREFIX = "sv2_"

# ---------------------------------------------------------------------------
# 색: 주 색 4가지(크림·오렌지 우드·잎 초록·하늘) + 소품 포인트(코랄·버터).


def srgb_to_linear(hex_value):
    h = hex_value.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# 이름: (sRGB 헥스, 발광 세기). 발광 0이면 일반 표면.
PALETTE = {
    # ① 크림(벽·큰 면)
    "cream": ("#FBF1DC", 0), "cream_deep": ("#F1DEBC", 0), "ceiling": ("#FBF1DC", 0.35), "paper": ("#FFF9EC", 0), "page": ("#EEDFC3", 0), "wainscot": ("#CFE3B4", 0),
    # ② 오렌지 우드(가구). wood_hi는 상판 가장자리 하이라이트 띠. 오래 보는 책상 면이라 채도·노란빛을 낮춘다
    # (사용자 관점 리뷰 2026-11-23, 두 번: 넓은 주황 책상·바닥이 2~3시간 보기에 진하다).
    "wood": ("#D89A72", 0), "wood_mid": ("#E2A67E", 0), "wood_light": ("#EAB48C", 0),
    "wood_hi": ("#F4D6B6", 0), "wood_deep": ("#B97A53", 0),
    # ③ 잎 초록
    "leaf": ("#6DB35E", 0), "leaf_light": ("#8CC56A", 0), "leaf_deep": ("#4E9A4E", 0), "sage": ("#A8CC8C", 0),
    "sage_deep": ("#86B470", 0), "stem": ("#5E8A3E", 0), "grass": ("#9BCB6E", 0), "bark": ("#A8673A", 0),
    # ④ 하늘(창밖·소품 포인트로도)
    "sky": ("#8CCBF2", 0), "sky_deep": ("#6FB4E2", 0),
    # 소품 포인트
    "coral": ("#F07A6A", 0), "coral_deep": ("#D9614F", 0), "coral_soft": ("#F6A598", 0),
    "butter": ("#F8D66A", 0), "butter_deep": ("#E8BE48", 0), "lilac": ("#C9B6E4", 0),
    "terracotta": ("#E07F55", 0), "soil": ("#7A4E33", 0), "ink": ("#5B4A6B", 0), "coffee": ("#8A5634", 0),
    # 바닥: 따뜻한 큰 타일 + 또렷한 줄눈(텍스처에서 4px 이상)
    "floor_tile": ("#E8D6C0", 0), "floor_tile_b": ("#E1CCB2", 0), "grout": ("#D3BC9F", 0),
    # 빛: 전구·스탠드 갓 안쪽(베이크에서 #FFE9A8 이상으로 남긴다)
    "glow": ("#FFE9A8", 6.0), "glow_soft": ("#FFE9A8", 2.0),
}

BOOK_COLORS = ("coral", "butter", "sage", "sky", "lilac", "cream", "wood_light", "coral_soft")
CUSHION_COLORS = ("coral_soft", "butter", "sage", "sky", "lilac", "cream")


def _bsdf(m):
    return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def _new_mat(full):
    m = bpy.data.materials.new(full)
    try:
        m.use_nodes = True
    except Exception:
        pass
    return m


def mat(name):
    """`sv2_src_<name>` 원본 재질(베이크 입력). 바닥은 큰 타일 무늬, 나머지는 단색."""
    full = f"{PREFIX}src_{name}"
    m = bpy.data.materials.get(full)
    if m:
        return m
    m = _new_mat(full)
    b = _bsdf(m)
    b.inputs["Roughness"].default_value = 0.8
    b.inputs["Metallic"].default_value = 0.0
    if name == "floor":
        # 큰 벽돌 깔기 타일(0.8×0.4m, 줄눈 5cm). 두 톤을 번갈아 둬 칸이 읽힌다.
        nt = m.node_tree
        tc = nt.nodes.new("ShaderNodeTexCoord")
        brick = nt.nodes.new("ShaderNodeTexBrick")
        brick.offset = 0.5
        brick.inputs["Color1"].default_value = (*srgb_to_linear(PALETTE["floor_tile"][0]), 1)
        brick.inputs["Color2"].default_value = (*srgb_to_linear(PALETTE["floor_tile_b"][0]), 1)
        brick.inputs["Mortar"].default_value = (*srgb_to_linear(PALETTE["grout"][0]), 1)
        brick.inputs["Scale"].default_value = 1.0
        brick.inputs["Mortar Size"].default_value = 0.025
        brick.inputs["Mortar Smooth"].default_value = 0.0
        brick.inputs["Bias"].default_value = 0.0
        brick.inputs["Brick Width"].default_value = 0.8
        brick.inputs["Row Height"].default_value = 0.4
        nt.links.new(tc.outputs["Object"], brick.inputs["Vector"])
        nt.links.new(brick.outputs["Color"], b.inputs["Base Color"])
        col = srgb_to_linear(PALETTE["floor_tile"][0])
    else:
        hx, emit = PALETTE[name]
        col = srgb_to_linear(hx)
        b.inputs["Base Color"].default_value = (*col, 1)
        if emit > 0:
            b.inputs["Emission Color"].default_value = (*col, 1)
            b.inputs["Emission Strength"].default_value = emit
    m.diffuse_color = (*col, 1)
    return m


# ---------------------------------------------------------------------------
# 메시 빌더


def _rotm(rot):
    return Euler([math.radians(a) for a in rot]).to_matrix().to_4x4()


def _shade(t, smooth_faces):
    """[smooth_faces]끼리 맞닿은 모서리만 매끈, 나머지 모서리는 날카롭게. 면은 모두 smooth로 둔다
    (sharp edge가 법선을 나눈다)."""
    smooth_faces = set(smooth_faces)
    for f in t.faces:
        f.smooth = True
    for e in t.edges:
        lf = e.link_faces
        e.smooth = len(lf) == 2 and lf[0] in smooth_faces and lf[1] in smooth_faces


class MB:
    """부품을 모아 재질 슬롯이 있는 메시 하나를 만든다."""

    def __init__(self):
        self.mats = []
        self.bm = bmesh.new()

    def _i(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _merge(self, t, m, matrix):
        bmesh.ops.transform(t, matrix=matrix, verts=t.verts)
        for f in t.faces:
            f.material_index = self._i(m)
        me = bpy.data.meshes.new("_tmp")
        t.to_mesh(me)
        t.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        return self

    def box(self, size, c, m, r=0.03, segs=None, rot=(0, 0, 0)):
        """둥근 상자: 모서리 반지름 r(최대 짧은 변의 48%). segs None이면 크기로 고른다."""
        if segs is None:
            segs = 2 if min(size) >= 0.05 and max(size) >= 0.3 else 1
        t = bmesh.new()
        bmesh.ops.create_cube(t, size=1.0)
        bmesh.ops.scale(t, vec=Vector(size), verts=t.verts)
        smooth = []
        bv = min(r, min(size) * 0.48)
        if segs > 0 and bv > 0.001:
            res = bmesh.ops.bevel(t, geom=list(t.edges), offset=bv, segments=segs, affect="EDGES", profile=0.5, clamp_overlap=True)
            smooth = res["faces"]
        _shade(t, smooth)
        return self._merge(t, m, Matrix.Translation(Vector(c)) @ _rotm(rot))

    def cyl(self, r1, r2, h, c, m, segs=10, r=0.0, rot=(0, 0, 0), caps=True):
        """원기둥(원뿔대). r>0이면 뚜껑 둘레를 2세그먼트로 둥글린다."""
        t = bmesh.new()
        bmesh.ops.create_cone(t, cap_ends=caps, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h)
        sides = [f for f in t.faces if len(f.verts) == 4]
        smooth = list(sides)
        if r > 0 and caps:
            capf = [e for e in t.edges if any(len(f.verts) > 4 for f in e.link_faces)]
            lim = min(r1, r2) * 0.45 if min(r1, r2) > 0 else r
            res = bmesh.ops.bevel(t, geom=capf, offset=min(r, h * 0.45, lim), segments=2, affect="EDGES", profile=0.5, clamp_overlap=True)
            smooth += res["faces"]
            smooth = [f for f in smooth if f.is_valid]
        _shade(t, smooth)
        return self._merge(t, m, Matrix.Translation(Vector(c)) @ _rotm(rot))

    def ball(self, rad, c, m, scale=(1, 1, 1), sub=1, rot=(0, 0, 0)):
        t = bmesh.new()
        bmesh.ops.create_icosphere(t, subdivisions=sub, radius=rad)
        bmesh.ops.scale(t, vec=Vector(scale), verts=t.verts)
        _shade(t, t.faces)
        return self._merge(t, m, Matrix.Translation(Vector(c)) @ _rotm(rot))

    def capsule(self, rad, length, c, m, segs=10, rot=(0, 0, 0)):
        """Z축 캡슐(통통한 팔걸이·롤 쿠션·커튼 주름). 반구는 2단."""
        t = bmesh.new()
        half = length / 2
        profile = [(-half - rad, 0.0)]
        for k in (1, 2):
            a = math.radians(90 - 30 * k)
            profile.append((-half - rad * math.sin(a), rad * math.cos(a)))
        profile += [(-half, rad), (half, rad)]
        for k in (1, 2):
            a = math.radians(30 * k)
            profile.append((half + rad * math.sin(a), rad * math.cos(a)))
        profile.append((half + rad, 0.0))
        bottom = t.verts.new((0, 0, profile[0][0]))
        top = t.verts.new((0, 0, profile[-1][0]))
        rings = []
        for z, rr in profile[1:-1]:
            rings.append([t.verts.new((rr * math.cos(2 * math.pi * i / segs), rr * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)])
        for i in range(segs):
            j = (i + 1) % segs
            t.faces.new((bottom, rings[0][j], rings[0][i]))
            t.faces.new((top, rings[-1][i], rings[-1][j]))
            for a, b in zip(rings, rings[1:]):
                t.faces.new((a[i], a[j], b[j], b[i]))
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
        _shade(t, t.faces)
        return self._merge(t, m, Matrix.Translation(Vector(c)) @ _rotm(rot))

    def arc(self, R, thick, z0, z1, a0, a1, c, m, n=8, rz=0.0):
        """Z축 둘레 굽은 띠(안쪽 반지름 R, 두께 thick, 각도는 도). 굽은 면은 매끈."""
        t = bmesh.new()
        rings = []
        for i in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * i / n)
            ca, sa = math.cos(a), math.sin(a)
            rings.append([t.verts.new((rr * ca, rr * sa, z)) for (rr, z) in ((R, z0), (R + thick, z0), (R + thick, z1), (R, z1))])
        curved = []
        for i in range(n):
            A, B = rings[i], rings[i + 1]
            for k in range(4):
                f = t.faces.new((A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k]))
                if k in (1, 3):
                    curved.append(f)
        t.faces.new(list(reversed(rings[0])))
        t.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
        res = bmesh.ops.bevel(t, geom=[e for e in t.edges if all(f in curved for f in e.link_faces) is False and len(e.link_faces) == 2
                                       and any(f in curved for f in e.link_faces) and abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6],
                              offset=min(thick, z1 - z0) * 0.4, segments=2, affect="EDGES", profile=0.5, clamp_overlap=True)
        curved = [f for f in curved if f.is_valid] + res["faces"]
        _shade(t, curved)
        return self._merge(t, m, Matrix.Translation(Vector(c)) @ _rotm((0, 0, rz)))

    def leaf(self, length, width, c, m, yaw, pitch, roll=0.0, fold=0.25, thick=0.012):
        """넓은 잎 한 장(두께 있는 판, 가운데 잎맥을 따라 V로 접힘). 잎자루 끝이 [c], 잎은 로컬 +X로
        뻗고 yaw(도)만큼 돌고 pitch(도)만큼 들린다(+면 위로)."""
        t = bmesh.new()
        ts = (0.0, 0.18, 0.42, 0.68, 0.88, 1.0)
        ws = (0.0, 0.62, 1.0, 0.86, 0.45, 0.0)
        top, bot = [], []
        for tt, ww in zip(ts, ws):
            x = tt * length
            sag = -0.18 * length * tt * tt  # 끝으로 갈수록 처진다
            hw = ww * width / 2
            lift = fold * hw
            if ww == 0:
                top.append([t.verts.new((x, 0, sag + thick / 2))])
                bot.append([t.verts.new((x, 0, sag - thick / 2))])
            else:
                top.append([t.verts.new((x, -hw, sag + lift + thick / 2)), t.verts.new((x, 0, sag + thick / 2)), t.verts.new((x, hw, sag + lift + thick / 2))])
                bot.append([t.verts.new((x, -hw, sag + lift - thick / 2)), t.verts.new((x, 0, sag - thick / 2)), t.verts.new((x, hw, sag + lift - thick / 2))])

        def strip(rows, flip):
            for a, b in zip(rows, rows[1:]):
                if len(a) == 1 and len(b) == 3:
                    quads = [(a[0], b[1], b[0]), (a[0], b[2], b[1])]
                elif len(a) == 3 and len(b) == 1:
                    quads = [(a[0], a[1], b[0]), (a[1], a[2], b[0])]
                else:
                    quads = [(a[0], a[1], b[1], b[0]), (a[1], a[2], b[2], b[1])]
                for q in quads:
                    t.faces.new(tuple(reversed(q)) if flip else q)

        strip(top, False)
        strip(bot, True)
        for side in (0, -1):
            et = [r[side] for r in top]
            eb = [r[side] for r in bot]
            for k in range(len(et) - 1):
                vs = [et[k], et[k + 1], eb[k + 1], eb[k]]
                if len(set(vs)) == 4:
                    t.faces.new(vs)
        bmesh.ops.remove_doubles(t, verts=t.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(t, faces=t.faces)
        _shade(t, t.faces)
        mx = Matrix.Translation(Vector(c)) @ _rotm((roll, -pitch, yaw))
        return self._merge(t, m, mx)

    def mesh(self, name):
        name = PREFIX + name
        old = bpy.data.meshes.get(name)
        if old:
            old.name = name + "_old"
        me = bpy.data.meshes.new(name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(mat(m))
        return me


def tris(me):
    me.calc_loop_triangles()
    return len(me.loop_triangles)


# ---------------------------------------------------------------------------
# 가구. 앞(앉은 사람이 보는 쪽)은 로컬 +Y, 등받이는 -Y. 자리 로컬 좌표는 원본과 같다.

CHAIR_SEAT = (0.0, 0.02, 0.49)
ARM_SEAT = (0.0, 0.05, 0.415)
SHELL_SEAT = (0.0, 0.06, 0.48)
SOFA_SEATS = ((-0.613, 0.05, 0.415), (0.0, 0.05, 0.415), (0.613, 0.05, 0.415))
TABLE_TOP = 0.76


def _top(mb, w, d):
    """두툼한 상판(두께 7cm, 윗면 0.76): 가장자리는 밝은 띠(wood_hi, 2mm 낮음), 가운데는 오렌지 우드."""
    mb.box((w, d, 0.07), (0, 0, TABLE_TOP - 0.002 - 0.035), "wood_hi", r=0.03, segs=2)
    mb.box((w - 0.1, d - 0.1, 0.01), (0, 0, TABLE_TOP - 0.005), "wood", r=0, segs=0)


def cafe_chair(name, cushion):
    """나무 카페 의자: 굵은 다리, 두툼한 좌판 + 파스텔 방석(윗면 0.49), 가로 슬랫 등받이."""
    mb = MB()
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.cyl(0.03, 0.026, 0.42, (sx * 0.17, sy * 0.16 + 0.02, 0.21), "wood_deep", segs=8, rot=(-sy * 2.0, sx * 2.0, 0), caps=False)
    mb.box((0.46, 0.44, 0.06), (0, 0.02, 0.43), "wood", r=0.03, segs=2)
    mb.box((0.40, 0.38, 0.035), (0, 0.03, 0.4725), cushion, r=0.016, segs=1)
    for sx in (-1, 1):
        mb.cyl(0.026, 0.026, 0.46, (sx * 0.19, -0.185, 0.66), "wood_deep", segs=8, rot=(8, 0, 0), caps=False)
    for k, z in enumerate((0.66, 0.82)):
        mb.box((0.42, 0.045, 0.08), (0, -0.19 - (z - 0.46) * 0.14, z), "wood_light" if k == 1 else "wood", r=0.02, segs=1, rot=(8, 0, 0))
    return mb.mesh(name)


def communal_table(name, length=6.4, depth=1.2):
    """공용 테이블: 두께 7cm 상판(가장자리 밝은 띠) + 굵은 둥근 다리 셋 쌍 + 가로대."""
    mb = MB()
    _top(mb, length, depth)
    end = length / 2 - 0.35  # 원본 6.4m 테이블: ±2.85
    for x in (-end, 0.0, end):
        for y in (-0.42, 0.42):
            mb.cyl(0.055, 0.045, 0.69, (x, y, 0.345), "wood_deep", segs=10)
        mb.box((0.09, 0.95, 0.08), (x, 0, 0.62), "wood_mid", r=0.03, segs=1)
        mb.box((0.12, 1.0, 0.05), (x, 0, 0.025), "wood_deep", r=0.02, segs=1)
    mb.box((2 * end - 0.1, 0.08, 0.08), (0, 0, 0.62), "wood_mid", r=0.03, segs=1)
    return mb.mesh(name)


def study_desk(name):
    """개인 책상(1.02×0.58, 윗면 0.76): 두툼한 상판 + 밝은 띠, 서랍 하나, 굵은 다리, 작은 선반.
    의자는 로컬 +Y 쪽에 놓인다."""
    mb = MB()
    _top(mb, 1.04, 0.6)
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.cyl(0.04, 0.034, 0.69, (sx * 0.44, sy * 0.22, 0.345), "wood_deep", segs=8, caps=False)
        mb.box((0.06, 0.48, 0.06), (sx * 0.44, 0, 0.12), "wood_mid", r=0, segs=0)
    mb.box((0.42, 0.44, 0.09), (0.18, 0.02, 0.645), "wood_mid", r=0, segs=0)
    mb.box((0.36, 0.02, 0.055), (0.18, 0.245, 0.645), "cream", r=0, segs=0)
    mb.box((0.08, 0.025, 0.02), (0.18, 0.262, 0.645), "wood_deep", r=0, segs=0)
    mb.box((0.94, 0.16, 0.035), (0, -0.2, 1.02), "wood_light", r=0, segs=0)
    for sx in (-1, 1):
        mb.box((0.035, 0.16, 0.26), (sx * 0.45, -0.2, 0.89), "wood", r=0, segs=0)
    return mb.mesh(name)


def desk_lamp(name):
    """버터 노랑 스탠드(둥근 갓, 안쪽 빛)."""
    mb = MB()
    mb.cyl(0.075, 0.08, 0.03, (0, 0, 0.015), "butter_deep", segs=10)
    mb.cyl(0.013, 0.013, 0.30, (0, 0, 0.18), "butter_deep", segs=6, rot=(0, 12, 0))
    mb.cyl(0.012, 0.012, 0.16, (0.1, 0, 0.36), "butter_deep", segs=6, rot=(0, 70, 0))
    mb.cyl(0.10, 0.045, 0.10, (0.19, 0, 0.33), "butter", segs=10, rot=(0, -10, 0))
    mb.cyl(0.085, 0.085, 0.01, (0.181, 0, 0.279), "glow", segs=8, rot=(0, -10, 0))
    return mb.mesh(name)


def sofa(name, fab, fab_deep, length=2.2, n=3, pillows=()):
    """두툼한 둥근 소파: 둥근 받침, 칸 방석(윗면 0.415), 통통한 등쿠션, 캡슐 팔걸이."""
    mb = MB()
    L = length
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.cyl(0.035, 0.028, 0.1, (sx * (L / 2 - 0.16), sy * 0.3, 0.05), "wood_deep", segs=8, caps=False)
    mb.box((L - 0.04, 0.84, 0.22), (0, -0.03, 0.2), fab_deep, r=0.06, segs=1)
    w = (L - 0.36) / n
    for k in range(n):
        cx = -L / 2 + 0.18 + w * (k + 0.5)
        mb.box((w - 0.015, 0.74, 0.15), (cx, 0.07, 0.34), fab, r=0.065, segs=2)
        mb.box((w - 0.03, 0.22, 0.46), (cx, -0.24, 0.63), fab, r=0.09, segs=2, rot=(12, 0, 0))
    mb.box((L - 0.04, 0.18, 0.4), (0, -0.37, 0.5), fab_deep, r=0.07, segs=1)
    for sx in (-1, 1):
        mb.box((0.2, 0.84, 0.3), (sx * (L / 2 - 0.1), -0.03, 0.4), fab_deep, r=0, segs=0)
        mb.capsule(0.12, 0.62, (sx * (L / 2 - 0.1), -0.01, 0.6), fab, segs=8, rot=(90, 0, 0))
    for px, col, rz in pillows:
        mb.box((0.36, 0.14, 0.34), (px, -0.08, 0.62), col, r=0.065, segs=1, rot=(16, 0, rz))
    return mb.mesh(name)


def armchair(name, fab, fab_deep, pillow=None):
    """통통한 1인 안락의자(폭 0.95): 둥근 등받이 + 캡슐 팔걸이(방석 윗면 0.415)."""
    mb = MB()
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.cyl(0.035, 0.028, 0.1, (sx * 0.33, sy * 0.3, 0.05), "wood_deep", segs=8, caps=False)
    mb.box((0.92, 0.84, 0.22), (0, -0.03, 0.2), fab_deep, r=0.07, segs=1)
    mb.box((0.56, 0.74, 0.15), (0, 0.07, 0.34), fab, r=0.065, segs=2)
    mb.box((0.66, 0.2, 0.56), (0, -0.35, 0.58), fab_deep, r=0.09, segs=1)
    mb.box((0.54, 0.22, 0.44), (0, -0.23, 0.63), fab, r=0.09, segs=2, rot=(12, 0, 0))
    for sx in (-1, 1):
        mb.box((0.2, 0.84, 0.3), (sx * 0.36, -0.03, 0.4), fab_deep, r=0, segs=0)
        mb.capsule(0.12, 0.62, (sx * 0.36, -0.01, 0.6), fab, segs=8, rot=(90, 0, 0))
    if pillow:
        mb.box((0.32, 0.13, 0.3), (0.05, -0.08, 0.62), pillow, r=0.06, segs=1, rot=(16, 0, 8))
    return mb.mesh(name)


def basket_chair(name, body, cushion):
    """둥근 바구니 의자(원본 셸 의자 자리, 방석 윗면 0.48 · 로컬 (0, 0.06)): 둥근 통 + 굽은 등받이."""
    mb = MB()
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.cyl(0.024, 0.02, 0.2, (sx * 0.2, sy * 0.2, 0.1), "wood_deep", segs=8, rot=(-sy * 8, sx * 8, 0))
    mb.cyl(0.36, 0.32, 0.26, (0, 0.02, 0.33), body, segs=12, r=0.05)
    mb.cyl(0.3, 0.3, 0.06, (0, 0.05, 0.45), cushion, segs=12)
    mb.arc(0.26, 0.09, 0.38, 0.86, 195, 345, (0, 0.02, 0), body, n=6)
    return mb.mesh(name)


def coffee_table_round(name, rad=0.48, top=0.42):
    mb = MB()
    mb.cyl(rad, rad, 0.06, (0, 0, top - 0.03), "wood_hi", segs=14, r=0.025)
    mb.cyl(rad - 0.04, rad - 0.04, 0.03, (0, 0, top - 0.075), "wood", segs=12)
    for k in range(3):
        a = math.radians(90 + k * 120)
        mb.cyl(0.035, 0.03, top - 0.06, (rad * 0.6 * math.cos(a), rad * 0.6 * math.sin(a), (top - 0.06) / 2), "wood_deep", segs=8)
    return mb.mesh(name)


def side_table(name, top=0.52):
    mb = MB()
    mb.cyl(0.25, 0.25, 0.05, (0, 0, top - 0.025), "wood_hi", segs=12, r=0.02)
    mb.cyl(0.04, 0.05, top - 0.05, (0, 0, (top - 0.05) / 2), "wood_deep", segs=8)
    mb.cyl(0.17, 0.19, 0.04, (0, 0, 0.02), "wood", segs=12)
    return mb.mesh(name)


def floor_lamp(name):
    """버터 갓 스탠드(키 1.6m). 갓 아래 빛 원판."""
    mb = MB()
    mb.cyl(0.17, 0.18, 0.04, (0, 0, 0.02), "wood_deep", segs=12)
    mb.cyl(0.018, 0.018, 1.36, (0, 0, 0.72), "wood_deep", segs=8)
    mb.cyl(0.24, 0.16, 0.28, (0, 0, 1.5), "butter", segs=12)
    mb.cyl(0.2, 0.2, 0.01, (0, 0, 1.365), "glow", segs=12)
    return mb.mesh(name)


def rug_round(name, rad, cols):
    """동그란 러그: 고리 무늬(가운데로 갈수록 한 단씩 얇게 겹침)."""
    mb = MB()
    for k, col in enumerate(cols):
        rr = rad * (1 - k / (len(cols) + 0.6))
        mb.cyl(rr, rr, 0.012, (0, 0, 0.006 + k * 0.004), col, segs=16)
    return mb.mesh(name)


def rug_dots(name, w, d, base, dot):
    """네모 러그 + 굵은 물방울 점(지름 20cm)."""
    mb = MB()
    mb.box((w, d, 0.014), (0, 0, 0.007), base, r=0.006, segs=1)
    rnd = random.Random(name)
    for i in range(int(w / 0.5)):
        for j in range(int(d / 0.5)):
            if (i + j) % 2 == 0:
                x = -w / 2 + 0.3 + i * 0.5
                y = -d / 2 + 0.3 + j * 0.5
                if abs(x) < w / 2 - 0.15 and abs(y) < d / 2 - 0.15:
                    mb.cyl(0.1, 0.1, 0.004, (x, y, 0.016), dot, segs=8)
    return mb.mesh(name)


# ---------------------------------------------------------------------------
# 탁자 위 소품(바닥 z=0이 탁자 윗면)


def mug(name, col="cream", saucer="cream_deep"):
    mb = MB()
    mb.cyl(0.075, 0.075, 0.014, (0, 0, 0.007), saucer, segs=8)
    mb.cyl(0.042, 0.038, 0.09, (0, 0, 0.059), col, segs=8)
    mb.box((0.03, 0.014, 0.05), (0.052, 0, 0.06), col, r=0, segs=0)
    return mb.mesh(name)


def book_stack(name, seed, n=3):
    rnd = random.Random(seed)
    mb, z = MB(), 0.0
    for k in range(n):
        h = rnd.uniform(0.035, 0.05)
        col = BOOK_COLORS[(seed * 3 + k) % len(BOOK_COLORS)]
        mb.box((rnd.uniform(0.2, 0.25), rnd.uniform(0.15, 0.18), h), (0, 0, z + h / 2), col, r=0, segs=0, rot=(0, 0, rnd.uniform(-12, 12)))
        z += h
    return mb.mesh(name)


def open_book(name, cover="sky"):
    mb = MB()
    mb.box((0.34, 0.24, 0.014), (0, 0, 0.007), cover, r=0, segs=0)
    # 종이는 아이보리(순백은 1인칭에서 빈 흰 판처럼 보인다). 가운데는 두 쪽을 V로 더 기울여 접힌 곳이
    # 그늘로 읽히게 한다(따로 띠를 얹으면 1인칭에서 떠 보이는 흰·노란 줄이 된다).
    for sx in (-1, 1):
        mb.box((0.16, 0.22, 0.016), (sx * 0.084, 0, 0.022), "page", r=0, segs=0, rot=(0, -sx * 7, 0))
    return mb.mesh(name)


def notebook(name, cover="coral"):
    mb = MB()
    mb.box((0.2, 0.27, 0.016), (0, 0, 0.008), cover, r=0, segs=0)
    mb.box((0.16, 0.03, 0.004), (0, 0.08, 0.018), "paper", r=0, segs=0)
    mb.cyl(0.006, 0.006, 0.15, (0.06, -0.02, 0.022), "butter_deep", segs=6, rot=(90, 0, 30))
    return mb.mesh(name)


def pencil_cup(name, col="sky"):
    mb = MB()
    mb.cyl(0.04, 0.036, 0.1, (0, 0, 0.05), col, segs=8)
    for k, pc in enumerate(("coral", "butter", "sage")):
        a = math.radians(k * 120)
        mb.cyl(0.007, 0.007, 0.16, (0.014 * math.cos(a), 0.014 * math.sin(a), 0.13), pc, segs=6, rot=(8 * math.sin(a), 8 * math.cos(a), 0))
    return mb.mesh(name)


def flower_vase(name, vase="sky", petals=("butter", "coral_soft", "cream")):
    """작은 화병 + 둥근 꽃 세 송이."""
    rnd = random.Random(name)
    mb = MB()
    mb.cyl(0.035, 0.05, 0.14, (0, 0, 0.07), vase, segs=8)
    for k, pc in enumerate(petals):
        a = math.radians(k * 120 + rnd.uniform(-20, 20))
        x, y, h = 0.035 * math.cos(a), 0.035 * math.sin(a), rnd.uniform(0.22, 0.29)
        mb.cyl(0.005, 0.005, h - 0.1, (x * 0.6, y * 0.6, 0.1 + (h - 0.1) / 2), "stem", segs=4)
        mb.ball(0.038, (x, y, h), pc, scale=(1, 1, 0.75), sub=0)
    return mb.mesh(name)


def tiny_plant(name, pot="coral_soft"):
    mb = MB()
    mb.cyl(0.06, 0.048, 0.09, (0, 0, 0.045), pot, segs=8)
    for k in range(3):
        a = math.radians(k * 120)
        mb.ball(0.055, (0.03 * math.cos(a), 0.03 * math.sin(a), 0.12 + 0.02 * k), "leaf_light" if k % 2 else "leaf", scale=(1, 1, 0.85), sub=0)
    return mb.mesh(name)


def laptop(name, col="sky"):
    mb = MB()
    mb.box((0.32, 0.22, 0.016), (0, 0, 0.008), col, r=0, segs=0)
    s15, c15 = math.sin(math.radians(15)), math.cos(math.radians(15))
    mb.box((0.32, 0.014, 0.21), (0, -0.105 - 0.1 * s15, 0.105 * c15 + 0.008), col, r=0, segs=0, rot=(-15, 0, 0))
    mb.box((0.28, 0.003, 0.17), (0, -0.096 - 0.1 * s15, 0.105 * c15 + 0.012), "paper", r=0, segs=0, rot=(-15, 0, 0))
    return mb.mesh(name)


def cake_stand(name):
    mb = MB()
    mb.cyl(0.16, 0.16, 0.014, (0, 0, 0.09), "cream", segs=10)
    mb.cyl(0.03, 0.05, 0.085, (0, 0, 0.042), "cream", segs=8)
    mb.cyl(0.11, 0.11, 0.08, (0, 0, 0.137), "butter", segs=10)
    mb.cyl(0.112, 0.112, 0.02, (0, 0, 0.187), "cream", segs=10)
    for k in range(4):
        a = math.radians(k * 90)
        mb.ball(0.02, (0.07 * math.cos(a), 0.07 * math.sin(a), 0.2), "coral", sub=0)
    return mb.mesh(name)


# ---------------------------------------------------------------------------
# 식물


def big_plant(name, seed, pot_col="cream", band="coral", leaves=9, height=1.25, pot_r=0.24):
    """큰 화분: 둥근 화분(띠) + 줄기 + 넓은 잎(연두/진초록 번갈아)."""
    rnd = random.Random(seed)
    mb = MB()
    mb.cyl(pot_r, pot_r * 0.8, 0.42, (0, 0, 0.21), pot_col, segs=12)
    mb.cyl(pot_r + 0.015, pot_r + 0.015, 0.07, (0, 0, 0.36), band, segs=12)
    mb.cyl(pot_r - 0.025, pot_r - 0.025, 0.02, (0, 0, 0.405), "soil", segs=12)
    for s in range(4):
        a = s * 90 + rnd.uniform(-15, 15)
        tilt = rnd.uniform(6, 14)
        h = height - 0.42 - rnd.uniform(0.0, 0.25)
        mb.cyl(0.014, 0.01, h, (0.05 * math.cos(math.radians(a)), 0.05 * math.sin(math.radians(a)), 0.41 + h / 2), "stem", segs=6,
               rot=(-tilt * math.sin(math.radians(a)), tilt * math.cos(math.radians(a)), 0))
    for k in range(leaves):
        a = k * 360 / leaves * 2.0 + rnd.uniform(-20, 20)
        z = 0.62 + (k / max(1, leaves - 1)) * (height - 0.62) + rnd.uniform(-0.05, 0.05)
        rr = 0.04 + rnd.uniform(0.0, 0.05)
        c = (rr * math.cos(math.radians(a)), rr * math.sin(math.radians(a)), z)
        length = rnd.uniform(0.36, 0.48) * (1.1 - 0.3 * k / leaves)
        pitch = rnd.uniform(10, 35) + (1 - k / leaves) * 10
        mb.leaf(length, length * 0.62, c, "leaf_light" if k % 2 else "leaf_deep", yaw=a, pitch=pitch, roll=rnd.uniform(-12, 12))
    return mb.mesh(name)


def bush_plant(name, seed, pot_col="terracotta", blobs=5, sub=1):
    """덩어리 잎 화분(둥근 잎 덩어리, 두 톤). 가까이 보이는 것은 덩어리를 줄이고 더 둥글게(sub=2)."""
    rnd = random.Random(seed)
    mb = MB()
    mb.cyl(0.2, 0.16, 0.36, (0, 0, 0.18), pot_col, segs=12, r=0.025)
    for k in range(blobs):
        a = rnd.uniform(0, 360)
        rr = rnd.uniform(0.0, 0.14)
        mb.ball(rnd.uniform(0.15, 0.2) * (1.25 if blobs < 5 else 1.0), (rr * math.cos(math.radians(a)), rr * math.sin(math.radians(a)), 0.48 + rnd.uniform(0, 0.25)),
                "leaf_light" if k % 2 else "leaf", sub=sub)
    return mb.mesh(name)


def hanging_plant(name, seed, pot="cream"):
    """매달린 화분: 끈 세 가닥 + 둥근 화분 + 늘어진 잎 줄기."""
    rnd = random.Random(seed)
    mb = MB()
    mb.cyl(0.11, 0.08, 0.13, (0, 0, -0.065), pot, segs=10, r=0.015)
    for k in range(3):
        a = math.radians(k * 120)
        mb.cyl(0.004, 0.004, 0.62, (0.05 * math.cos(a), 0.05 * math.sin(a), 0.31), "wood_deep", segs=4, rot=(-5 * math.sin(a), 5 * math.cos(a), 0))
    for k in range(3):
        a = k * 120 + rnd.uniform(-10, 10)
        for j in range(2):
            x = (0.09 + 0.015 * j) * math.cos(math.radians(a))
            y = (0.09 + 0.015 * j) * math.sin(math.radians(a))
            mb.ball(0.04, (x, y, 0.0 - 0.1 * j), "leaf_light" if (j + k) % 2 else "leaf", scale=(1, 1, 0.8), sub=0)
    return mb.mesh(name)


# ---------------------------------------------------------------------------
# 벽·방 장식


def picture_frame(name, w, h, art, frame="wood"):
    """둥근 모서리 액자 + 파스텔 그림(색 블록). art: (w, h, x, z, 색)."""
    mb = MB()
    mb.box((w, 0.04, h), (0, 0, 0), frame, r=0.03, segs=1)
    mb.box((w - 0.08, 0.01, h - 0.08), (0, -0.02, 0), "paper", r=0.0, segs=0)
    for aw, ah, ax, az, am in art:
        if aw == ah and am.startswith("~"):
            mb.cyl(aw / 2, aw / 2, 0.01, (ax, -0.026, az), am[1:], segs=12, rot=(90, 0, 0))
        else:
            mb.box((aw, 0.01, ah), (ax, -0.026, az), am, r=0.0, segs=0)
    return mb.mesh(name)


def curtain(name, height=2.6, width=0.62, col="coral_soft", folds=6):
    """두툼한 커튼 한 폭: 주름(캡슐) [folds]개 + 묶음 띠. 로컬 -Y가 방 안쪽(앞)."""
    mb = MB()
    step = width / folds
    for k in range(folds):
        x = -width / 2 + step * (k + 0.5)
        mb.cyl(step * 0.62, step * 0.62, height, (x, -0.04 * (k % 2), height / 2), col, segs=8)
    mb.box((width + 0.04, 0.12, 0.08), (0, -0.04, height * 0.42), "butter", r=0.03, segs=1)
    return mb.mesh(name)


def curtain_rod(name, length):
    mb = MB()
    mb.cyl(0.022, 0.022, length, (0, 0, 0), "wood_deep", segs=8, rot=(0, 90, 0))
    for sx in (-1, 1):
        mb.ball(0.04, (sx * length / 2, 0, 0), "wood", sub=1)
    return mb.mesh(name)


def wall_shelf(name, seed, w=0.9):
    """벽 선반: 두툼한 판 + 화분·책."""
    rnd = random.Random(seed)
    mb = MB()
    mb.box((w, 0.24, 0.05), (0, 0, 0), "wood", r=0.02, segs=1)
    for sx in (-1, 1):
        mb.box((0.04, 0.16, 0.14), (sx * (w / 2 - 0.12), 0.06, -0.08), "wood_deep", r=0.01, segs=1)
    mb.cyl(0.065, 0.05, 0.11, (-w / 2 + 0.16, 0, 0.08), "coral_soft", segs=10)
    mb.ball(0.08, (-w / 2 + 0.16, 0, 0.17), "leaf", sub=1)
    for j in range(4):
        mb.ball(0.04, (-w / 2 + 0.16 + 0.03 * math.sin(j), -0.07, 0.0 - 0.09 * j), "leaf_light" if j % 2 else "leaf", sub=0)
    x = -0.05
    for k in range(4):
        bw = 0.05 + 0.015 * (k % 2)
        bh = rnd.uniform(0.17, 0.22)
        mb.box((bw, 0.16, bh), (x, 0.01, 0.025 + bh / 2), BOOK_COLORS[(seed + k) % len(BOOK_COLORS)], r=0, segs=0, rot=(0, -12 if k == 3 else 0, 0))
        x += bw + 0.006
    mb.cyl(0.05, 0.05, 0.1, (w / 2 - 0.12, 0, 0.075), "sky", segs=10)
    return mb.mesh(name)


def bookshelf(name, seed, w=1.1, h=2.1, d=0.36):
    """책장: 두툼한 둥근 판 + 굵은 책(소품 색) + 화분 몇 개."""
    rnd = random.Random(seed)
    mb = MB()
    for sx in (-1, 1):
        mb.box((0.06, d, h), (sx * (w / 2 - 0.03), 0, h / 2), "wood", r=0.025, segs=1)
    mb.box((w - 0.08, 0.03, h - 0.06), (0, d / 2 - 0.015, h / 2), "wood_hi", r=0, segs=0)
    shelves = [0.06, 0.52, 0.98, 1.44]
    for z in shelves + [h - 0.03]:
        mb.box((w - 0.06, d - 0.02, 0.05), (0, 0, z), "wood_mid", r=0, segs=0)
    for z in shelves:
        x = -w / 2 + 0.08
        while x < w / 2 - 0.16:
            roll = rnd.random()
            if roll < 0.14:
                mb.cyl(0.06, 0.05, 0.13, (x + 0.07, 0, z + 0.09), rnd.choice(("coral_soft", "sky", "cream")), segs=10)
                mb.ball(0.07, (x + 0.07, 0, z + 0.19), "leaf_light", sub=1)
                x += 0.17
                continue
            if roll < 0.22:
                x += 0.12
                continue
            bw, bh = rnd.uniform(0.07, 0.11), rnd.uniform(0.25, 0.34)
            mb.box((bw, 0.24, bh), (x + bw / 2, 0.01, z + 0.025 + bh / 2), rnd.choice(BOOK_COLORS), r=0, segs=0)
            x += bw + 0.008
    return mb.mesh(name)


def credenza(name, w, d=0.42, h=0.75):
    mb = MB()
    mb.box((w, d, h - 0.16), (0, 0, 0.16 + (h - 0.16) / 2), "wood", r=0.03, segs=1)
    mb.box((w + 0.03, d + 0.03, 0.04), (0, 0, h - 0.0), "wood_hi", r=0.02, segs=1)
    n = max(2, round(w / 0.55))
    for k in range(n):
        x = -w / 2 + w * (k + 0.5) / n
        mb.box((w / n - 0.06, 0.02, h - 0.3), (x, -d / 2 - 0.005, 0.16 + (h - 0.16) / 2), "cream" if k % 2 else "sage", r=0, segs=0)
        mb.ball(0.018, (x, -d / 2 - 0.02, 0.16 + (h - 0.16) / 2), "wood_deep", sub=0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.cyl(0.025, 0.02, 0.16, (sx * (w / 2 - 0.08), sy * (d / 2 - 0.07), 0.08), "wood_deep", segs=8)
    return mb.mesh(name)


def string_lights(name, runs, spacing=0.36, bulb=0.04):
    """줄 전구: (시작, 끝, 높이, 처짐 횟수) 줄마다 처진 전선 + 둥근 전구."""
    mb = MB()
    count = 0
    for (x0, y0), (x1, y1), z, swags in runs:
        length = math.hypot(x1 - x0, y1 - y0)
        n = max(2, int(length / spacing))
        pts = []
        for k in range(n + 1):
            t = k / n
            sag = 0.2 * math.sin(math.pi * ((t * swags) % 1.0))
            pts.append(Vector((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z - sag)))
        for a, b in zip(pts, pts[1:]):
            mid, d = (a + b) / 2, b - a
            q = d.to_track_quat("Z", "Y").to_euler()
            mb.cyl(0.006, 0.006, d.length, tuple(mid), "wood_deep", segs=4, rot=tuple(math.degrees(v) for v in q), caps=False)
        for p in pts:
            mb.ball(bulb, (p.x, p.y, p.z - 0.05), "glow", scale=(1, 1, 1.25), sub=0)
            count += 1
    return mb.mesh(name), count


# ---------------------------------------------------------------------------
# 바깥(창밖)


def tree(name, seed, height=2.8, blobs=7):
    """둥근 잎 덩어리 나무: 두툼한 줄기 + 아이코스피어 덩어리(연두/진초록 번갈아)."""
    rnd = random.Random(seed)
    mb = MB()
    mb.cyl(0.2, 0.14, height, (0, 0, height / 2), "bark", segs=8)
    for k in range(2):
        a = rnd.uniform(0, 360)
        mb.cyl(0.07, 0.05, 0.7, (0.25 * math.cos(math.radians(a)), 0.25 * math.sin(math.radians(a)), height - 0.25), "bark", segs=6,
               rot=(35 * math.sin(math.radians(a)) * -1, 35 * math.cos(math.radians(a)), 0))
    for k in range(blobs):
        a = k * 360 / blobs + rnd.uniform(-20, 20)
        rr = 0.0 if k == 0 else rnd.uniform(0.55, 0.85)
        z = height + (0.55 if k == 0 else rnd.uniform(-0.1, 0.45))
        mb.ball(rnd.uniform(0.7, 0.95) if k else 1.0, (rr * math.cos(math.radians(a)), rr * math.sin(math.radians(a)), z),
                "leaf_light" if k % 2 else "leaf", sub=2)
    return mb.mesh(name)


def flower_bush(name, seed):
    """꽃 덤불: 초록 덩어리 셋 + 노란 꽃."""
    rnd = random.Random(seed)
    mb = MB()
    for k in range(3):
        a = k * 120 + rnd.uniform(-20, 20)
        mb.ball(rnd.uniform(0.38, 0.5), (0.35 * math.cos(math.radians(a)), 0.35 * math.sin(math.radians(a)), 0.3), "leaf" if k % 2 else "leaf_deep",
                scale=(1, 1, 0.8), sub=1)
    for k in range(6):
        a = rnd.uniform(0, 360)
        rr = rnd.uniform(0.2, 0.6)
        mb.ball(0.08, (rr * math.cos(math.radians(a)), rr * math.sin(math.radians(a)), rnd.uniform(0.5, 0.7)), "butter" if k % 3 else "cream", sub=0)
    return mb.mesh(name)


def fence(name, length, post_every=1.2):
    """낮은 나무 울타리(높이 0.7m): 둥근 기둥 + 가로대 둘."""
    mb = MB()
    n = max(1, round(length / post_every))
    for k in range(n + 1):
        x = -length / 2 + length * k / n
        mb.cyl(0.06, 0.06, 0.75, (x, 0, 0.375), "wood", segs=8)
    for z in (0.28, 0.56):
        mb.box((length, 0.05, 0.1), (0, 0.06, z), "wood_light", r=0, segs=0)
    return mb.mesh(name)
