"""生成应用图标：build/icon.ico (多尺寸) + build/tray.png"""
from PIL import Image, ImageDraw
import math, os

BASE = os.path.dirname(os.path.abspath(__file__))
OUT_ICO = os.path.join(BASE, "icon.ico")
OUT_TRAY = os.path.join(BASE, "tray.png")
OUT_PNG = os.path.join(BASE, "icon.png")

S = 1024  # 超采样


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def make_icon(size=256, simple=False):
    SZ = S if size >= 128 else 512
    img = Image.new("RGBA", (SZ, SZ), (0, 0, 0, 0))

    # 背景渐变（深色玻璃）
    grad = Image.new("RGBA", (SZ, SZ))
    gd = ImageDraw.Draw(grad)
    top = (40, 44, 56)
    bot = (12, 14, 20)
    for y in range(SZ):
        t = y / (SZ - 1)
        # 轻微对角感
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        gd.line([(0, y), (SZ, y)], fill=c + (255,))

    # 顶部高光
    hl = Image.new("RGBA", (SZ, SZ), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.ellipse([-SZ * 0.3, -SZ * 0.75, SZ * 1.1, SZ * 0.45], fill=(255, 255, 255, 26))
    grad = Image.alpha_composite(grad, hl)

    mask = rounded_mask(SZ, int(SZ * 0.235))
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)

    # 内描边
    d.rounded_rectangle(
        [SZ * 0.012, SZ * 0.012, SZ * 0.988, SZ * 0.988],
        radius=int(SZ * 0.225),
        outline=(255, 255, 255, 30),
        width=max(2, int(SZ * 0.008)),
    )

    # 上涨折线
    pts = [
        (SZ * 0.20, SZ * 0.69),
        (SZ * 0.385, SZ * 0.495),
        (SZ * 0.545, SZ * 0.585),
        (SZ * 0.775, SZ * 0.305),
    ]
    lw = int(SZ * 0.075) if not simple else int(SZ * 0.10)
    d.line(pts, fill=(255, 91, 91, 255), width=lw, joint="curve")
    # 圆头
    r = lw / 2
    for p in (pts[0], pts[-1]):
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(255, 91, 91, 255))

    # 箭头三角
    ax, ay = pts[-1]
    s = SZ * 0.115
    d.polygon(
        [(ax + s * 0.55, ay - s * 0.62), (ax - s * 0.62, ay + s * 0.52), (ax + s * 0.72, ay + s * 0.72)],
        fill=(255, 91, 91, 255),
    )

    # 底部基线（微弱）
    d.line(
        [(SZ * 0.20, SZ * 0.80), (SZ * 0.80, SZ * 0.80)],
        fill=(255, 255, 255, 46),
        width=max(2, int(SZ * 0.014)),
    )

    return img.resize((size, size), Image.LANCZOS)


sizes = [16, 24, 32, 48, 64, 128, 256]
frames = [make_icon(s, simple=s <= 32) for s in sizes]
big = make_icon(256).resize((256, 256), Image.LANCZOS)
big.save(OUT_ICO, format="ICO", sizes=[(s, s) for s in sizes])
big.save(OUT_PNG)
make_icon(32, simple=True).save(OUT_TRAY)
print("ok:", OUT_ICO, OUT_TRAY, OUT_PNG)
