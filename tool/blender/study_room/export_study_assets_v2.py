"""v2 공부방(`study_room_v2.glb`)을 창 없이(백그라운드)다시 만든다.

    blender -b --factory-startup --python tool/blender/study_room/export_study_assets_v2.py -- [옵션]

옵션:
- `--cache <폴더>`: 톤 매핑 전 선형 베이크를 EXR로 남긴다.
- `--from-cache <폴더>`: 굽지 않고 남긴 EXR로 톤·내보내기만 다시 한다(UV 펼침은 같은 결과가 나온다).
- `--tone k=v,k=v`: 톤 값(`bake_and_export_v2.TONE`)을 이번 실행에서만 바꾼다(예: contrast=1.5).
- `--samples <n>`: Cycles 샘플(기본 384). 먼저 낮게(64) 확인하고 마지막에 올린다.

원본: PocketTime `tool/blender/study_room/export_study_assets.py`(f6865a86). 결과는
`frontend/public/assets/study_themes/cafe_room_3d/study_room_v2.glb`. 원래 `study_room.glb`는 덮어쓰지 않는다.
"""

import os
import runpy
import sys

import bpy

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.abspath(os.path.join(_HERE, "..", "..", ".."))
_OUT = os.path.join(_ROOT, "frontend", "public", "assets", "study_themes", "cafe_room_3d", "study_room_v2.glb")


def _use_gpu():
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
    except KeyError:
        return "CPU"
    for kind in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        devices = [d for d in prefs.devices if d.type == kind]
        if devices:
            for d in prefs.devices:
                d.use = d.type == kind
            return kind
    return "CPU"


def _arg(argv, flag, default=None):
    return argv[argv.index(flag) + 1] if flag in argv else default


def main(argv):
    print(f"[study-assets-v2] cycles device: {_use_gpu()}")
    samples = int(_arg(argv, "--samples", "384"))
    cache = _arg(argv, "--cache")
    from_cache = _arg(argv, "--from-cache")
    build = runpy.run_path(os.path.join(_HERE, "build_study_room_v2.py"), run_name="study_room_v2_build")
    build["run_all"]()
    bake = runpy.run_path(os.path.join(_HERE, "bake_and_export_v2.py"), run_name="study_room_v2_bake")
    tone = dict(bake["TONE"])
    for kv in filter(None, (_arg(argv, "--tone", "") or "").split(",")):
        k, v = kv.split("=")
        tone[k] = v if k == "shade_tint" else float(v)
    print(f"[study-assets-v2] tone: {tone}")
    stats = bake["run_all"](out_glb=_OUT, samples=samples, cache_dir=from_cache or cache, from_cache=bool(from_cache), tone=tone)
    print(f"[study-assets-v2] room: {stats}")
    print(f"[study-assets-v2] glb: {_OUT} {os.path.getsize(_OUT)} bytes")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
