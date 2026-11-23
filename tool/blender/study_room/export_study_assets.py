"""3D 스터디룸 에셋을 창 없이(백그라운드) 다시 만든다.

    blender -b --factory-startup --python tool/blender/study_room/export_study_assets.py -- room

인자(한 번에 하나): `room`(study_room.glb, 라운지 카페 방), `characters`(study_characters.glb, 앉은 사람 두 벌 + 연필).
`--preview <폴더>`를 주면 내보낸 뒤 무대를 PNG로 찍어 둔다(확인용, 커밋하지 않는다).
`--cache <폴더>`를 주면 방의 톤 매핑 전 선형 베이크를 EXR로 남긴다(색만 다시 맞출 때).

방은 Cycles GPU로 굽는다(RTX급에서 몇 분). 굽기 결과는 실행마다 조금씩 다르다.

에셋 하나마다 Blender를 새로 띄운다(백그라운드에서는 씬을 바꿀 수 없다).
"""

import math
import os
import runpy
import sys

import bpy
from mathutils import Vector

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.abspath(os.path.join(_HERE, "..", "..", ".."))
_OUT = os.path.join(_ROOT, "assets", "study_themes", "cafe_room_3d")


def _use_gpu():
    """CUDA/OptiX가 있으면 Cycles 베이크를 GPU로 돌린다(없으면 CPU)."""
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


def _preview(scene, path, target, distance, pitch_deg=30.0, yaw_deg=0.0, ortho=None):
    cam = bpy.data.cameras.new("preview_camera")
    if ortho:
        cam.type = "ORTHO"
        cam.ortho_scale = ortho
    else:
        cam.lens = 35
    ob = bpy.data.objects.new("preview_camera", cam)
    scene.collection.objects.link(ob)
    pitch, yaw = math.radians(pitch_deg), math.radians(yaw_deg)
    direction = Vector((math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), -math.sin(pitch)))
    ob.location = Vector(target) - direction * distance
    ob.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = ob
    scene.render.resolution_x = 720
    scene.render.resolution_y = 960
    scene.cycles.samples = 48
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main(argv):
    targets = [a for a in argv if not a.startswith("--")]
    preview = cache = None
    if "--preview" in argv:
        preview = argv[argv.index("--preview") + 1]
        targets = [t for t in targets if t != preview]
    if "--cache" in argv:
        cache = argv[argv.index("--cache") + 1]
        targets = [t for t in targets if t != cache]
    if len(targets) != 1:
        raise SystemExit("에셋은 한 번에 하나만 만든다: room 또는 characters")
    device = _use_gpu()
    print(f"[study-assets] cycles device: {device}")
    target = targets[0]
    if target == "characters":
        # 앉은 사람 두 벌(남자·여자)과 연필. 원본은 `figures/*.glb`(Meshy).
        ns = runpy.run_path(os.path.join(_HERE, "build_figures.py"), run_name="study_figures")
        stats = ns["run_all"](out_glb=os.path.join(_OUT, "study_characters.glb"))
        print(f"[study-assets] characters: {sum(stats.values())} tris")
        if preview:
            _preview(bpy.context.scene, os.path.join(preview, "characters.png"), (2.1, -2.6, 0.4), 9.0, pitch_deg=40, ortho=6.0)
    elif target == "room":
        build = runpy.run_path(os.path.join(_HERE, "build_study_room.py"), run_name="study_room_build")
        scene = build["run_all"]()
        print(build["seat_table"]())
        bake = runpy.run_path(os.path.join(_HERE, "bake_and_export.py"), run_name="study_room_bake")
        stats = bake["run_all"](out_glb=os.path.join(_OUT, "study_room.glb"), cache_dir=cache)
        print(f"[study-assets] room: {stats}")
        if preview:
            _preview(scene, os.path.join(preview, "room.png"), (8.0, 4.0, 0.0), 18.0, pitch_deg=56)
    else:
        raise SystemExit(f"모르는 에셋: {target}")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
