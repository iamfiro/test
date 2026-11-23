"""구운 조명의 명암 대비를 v1·v2 GLB에서 같은 방법으로 잰다(열린 Blender 또는 -b).

바닥(큰 홀 X 0.3–15.7 · Y 0.3–6.5, 10cm 격자)과 북쪽 벽 안쪽 면(X 0.3–10, Z 0.2–3.8)에서 껍데기 메시를
광선으로 맞혀 UV 자리의 텍스처 명도(sRGB 루마)를 읽고, 5%·50%·95% 분위와 폭(95%−5%)을 찍는다.
가구가 드리운 그늘·창으로 든 볕·전등 빛 번짐이 모두 바닥 텍스처에 들어 있으므로 이 폭이 조명 대비다.

    blender -b --factory-startup --python tool/blender/study_room/measure_bake_contrast.py
"""

import os

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

_HERE = os.path.dirname(os.path.abspath(__file__))
_ASSETS = os.path.join(_HERE, "..", "..", "..", "frontend", "public", "assets", "study_themes", "cafe_room_3d")


def _load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    shell = next(o for o in new if o.type == "MESH" and o.name.startswith("room_shell"))
    bpy.context.view_layer.update()
    return shell, new


def _sampler(shell):
    me = shell.data
    mw = shell.matrix_world
    verts = [mw @ v.co for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons]
    bvh = BVHTree.FromPolygons(verts, polys)
    uv = me.uv_layers.active.data
    image = next(n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE")
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)[:, :, :3]
    # 바이트 sRGB 이미지의 pixels는 선형으로 풀려 나온다 → 다시 sRGB(표시 명도)로.
    s = np.where(px <= 0.0031308, px * 12.92, 1.055 * np.power(np.clip(px, 0, None), 1 / 2.4) - 0.055)
    luma = s @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

    def at(origin, direction):
        hit = bvh.ray_cast(Vector(origin), Vector(direction))
        if hit[0] is None:
            return None
        loc, _, idx, _ = hit
        poly = me.polygons[idx]
        # 다각형 꼭짓점 UV의 무게중심 보간(삼각형 팬 근사)
        ids = list(poly.loop_indices)
        pts = [verts[me.loops[i].vertex_index] for i in ids]
        best = None
        for k in range(1, len(ids) - 1):
            a, b, c = pts[0], pts[k], pts[k + 1]
            v0, v1, v2 = b - a, c - a, loc - a
            d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
            den = d00 * d11 - d01 * d01
            if abs(den) < 1e-12:
                continue
            bv = (d11 * d20 - d01 * d21) / den
            bw = (d00 * d21 - d01 * d20) / den
            bu = 1 - bv - bw
            if min(bu, bv, bw) >= -1e-4:
                best = bu * uv[ids[0]].uv + bv * uv[ids[k]].uv + bw * uv[ids[k + 1]].uv
                break
        if best is None:
            return None
        x = min(w - 1, max(0, int(best.x * w)))
        y = min(h - 1, max(0, int(best.y * h)))
        return float(luma[y, x])

    return at


def measure(path):
    shell, new = _load(path)
    at = _sampler(shell)
    # glTF(Y 위)로 들어오면 블렌더 좌표 = 원래 좌표 그대로(가져오기가 Y 위 → Z 위로 되돌린다)
    floor = [at((x, y, 2.0), (0, 0, -1)) for x in np.arange(0.3, 15.7, 0.1) for y in np.arange(0.3, 6.5, 0.1)]
    wall = [at((x, 6.0, z), (0, 1, 0)) for x in np.arange(0.3, 10.0, 0.1) for z in np.arange(0.2, 3.8, 0.1)]
    out = {}
    for name, vals in (("floor", floor), ("north_wall", wall)):
        v = np.array([x for x in vals if x is not None])
        # 거의 검정(<0.02)은 UV 섬 가장자리 틈을 읽은 것이라 뺀다(개수는 남긴다).
        gaps = int((v < 0.02).sum())
        v = v[v >= 0.02]
        p5, p50, p95 = np.percentile(v, [5, 50, 95])
        out[name] = {"n": int(v.size), "gaps": gaps, "p5": round(float(p5), 3), "p50": round(float(p50), 3), "p95": round(float(p95), 3), "range": round(float(p95 - p5), 3)}
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    return out


if __name__ == "__main__":
    res = {f: measure(os.path.join(_ASSETS, f)) for f in ("study_room.glb", "study_room_v2.glb")}
    for f, r in res.items():
        print(f"[contrast] {f}: {r}")
    for part in ("floor", "north_wall"):
        a, b = res["study_room.glb"][part]["range"], res["study_room_v2.glb"][part]["range"]
        print(f"[contrast] {part}: v1 range {a} → v2 range {b} ({b / a:.2f}×)")
