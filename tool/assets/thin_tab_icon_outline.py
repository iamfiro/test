"""study_tab_*.png의 바깥 흰 테두리를 얇게 하고 줄어든 여백만큼 그림을 키운다.

    python3 tool/assets/thin_tab_icon_outline.py <입력폴더> <출력폴더> <남길 두께 px, 200px 기준(8)>
"""
import sys, glob, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, dst, keep = sys.argv[1], sys.argv[2], float(sys.argv[3])
os.makedirs(dst, exist_ok=True)
for f in sorted(glob.glob(os.path.join(src, 'study_tab_*.png'))):
    im0 = Image.open(f).convert('RGBA')
    # 캔버스 가장자리까지 닿은 테두리(집)도 바깥과 이어지도록 투명 여백을 둘러 처리한다.
    pad = 40
    im = Image.new('RGBA', (im0.width + 2 * pad, im0.height + 2 * pad), (0, 0, 0, 0))
    im.paste(im0, (pad, pad))
    scale = max(im0.size) / 200.0
    k = keep * scale
    a = np.array(im).astype(float)
    alpha = a[..., 3]
    rgb = a[..., :3]
    # 거의 순백이고 채도가 낮은 픽셀만 테두리로 본다(크림색 집 벽·연한 안쪽 면은 제외).
    whitish = (rgb.min(axis=2) > 236) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 14) & (alpha > 100)
    outside = alpha <= 128
    lab, _ = ndi.label(whitish | outside)
    outer = set(lab[outside].ravel()) - {0}
    outline = np.isin(lab, list(outer)) & whitish
    content = (alpha > 128) & ~outline
    # 본체와 떨어진 작은 조각(바깥에 흩어진 흰 점·번짐)은 그림이 아니므로 뺀다.
    clab, cn = ndi.label(content)
    sizes = ndi.sum(content, clab, range(1, cn + 1))
    big = [i + 1 for i, v in enumerate(sizes) if v > 0.01 * content.size / 4]
    content = np.isin(clab, big)
    dist = ndi.distance_transform_edt(~content)
    # 안쪽에서 k만큼만 남기고 바깥은 투명(경계 1px는 부드럽게).
    # 그림 바깥(흰 띠·그림자·번짐 전부)은 안쪽에서 k만큼만 남긴다.
    new_alpha = np.where(content, alpha, np.clip(k + 1.0 - dist, 0, 1) * alpha)
    a[..., 3] = new_alpha
    out = Image.fromarray(a.astype(np.uint8), 'RGBA')
    # 줄어든 여백을 잘라 그림을 키운다(정사각 캔버스, 원래 크기 유지, 가장자리 여백 4%).
    bbox = out.getbbox()
    out = out.crop(bbox)
    size = max(im0.size)
    inner = int(size * 0.96)
    ratio = inner / max(out.size)
    out = out.resize((max(1, round(out.width * ratio)), max(1, round(out.height * ratio))), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(out, ((size - out.width) // 2, (size - out.height) // 2), out)
    canvas.save(os.path.join(dst, os.path.basename(f)), optimize=True)
    print(os.path.basename(f), im0.size, '->', canvas.size)
