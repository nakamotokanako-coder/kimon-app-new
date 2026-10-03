# scripts/build_brand_images.py
# アプリのアイコンと、SNS で共有したときに出る画像（OGP）を作る。
#   実行: python scripts/build_brand_images.py   （Pillow と、Windows の游明朝 Demibold が必要）
#   出力: public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, favicon.png, og.png
# 見た目はアプリのヘッダー（黒地に金の丸「遁」）に合わせる。作り直したら public/ の画像をコミットする。
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent.parent / 'public'
FONT = 'C:/Windows/Fonts/yumindb.ttf'
BG = (8, 8, 12)
GOLD_STOPS = [(0.0, (156, 115, 34)), (0.25, (215, 171, 77)), (0.44, (252, 239, 196)),
              (0.55, (236, 208, 131)), (0.74, (197, 148, 51)), (1.0, (156, 115, 34))]
INK = (40, 28, 6)


def gold(t):
    for (t0, c0), (t1, c1) in zip(GOLD_STOPS, GOLD_STOPS[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            return tuple(round(a + (b - a) * k) for a, b in zip(c0, c1))
    return GOLD_STOPS[-1][1]


def gold_gradient(size):
    """斜め（左上→右下）の金のグラデーション"""
    w, h = size
    strip = Image.new('RGB', (256, 1))
    strip.putdata([gold(i / 255) for i in range(256)])
    big = strip.resize((w + h, h))
    return big.transform((w, h), Image.AFFINE, (1, 0.45, 0, 0, 1, 0), resample=Image.BICUBIC)


def disc(diameter, char='遁'):
    """金の丸に墨色の一文字"""
    s = diameter * 4  # 4倍で描いて縮小（縁をなめらかに）
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    img.paste(gold_gradient((s, s)), (0, 0), mask)
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, round(s * 0.56))
    d.text((s / 2, s / 2), char, font=font, fill=INK, anchor='mm')
    return img.resize((diameter, diameter), Image.LANCZOS)


def glow(canvas, center, radius):
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    x, y = center
    ImageDraw.Draw(layer).ellipse((x - radius, y - radius, x + radius, y + radius), fill=(215, 171, 77, 70))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(radius * 0.45)))


def icon(size, disc_ratio):
    canvas = Image.new('RGBA', (size, size), BG + (255,))
    glow(canvas, (size // 2, size // 2), round(size * disc_ratio * 0.5))
    d = disc(round(size * disc_ratio))
    canvas.alpha_composite(d, ((size - d.width) // 2, (size - d.height) // 2))
    return canvas.convert('RGB')


def gold_text(canvas, xy, text, font, anchor='la'):
    """金のグラデーションで文字を描く"""
    mask = Image.new('L', canvas.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=font, fill=255, anchor=anchor)
    canvas.paste(gold_gradient(canvas.size), (0, 0), mask)


def og():
    w, h = 1200, 630
    canvas = Image.new('RGBA', (w, h), BG + (255,))
    glow(canvas, (250, 315), 230)
    d = disc(300)
    canvas.alpha_composite(d, (100, 165))
    rgb = canvas.convert('RGB')
    draw = ImageDraw.Draw(rgb)
    gold_text(rgb, (460, 150), 'KIMON TONKO', ImageFont.truetype(FONT, 34))
    gold_text(rgb, (456, 200), '奇門遁甲Z', ImageFont.truetype(FONT, 132))
    sub = ImageFont.truetype(FONT, 38)
    draw.text((460, 390), '時盤・日盤をすぐに引ける。', font=sub, fill=(235, 228, 210))
    draw.text((460, 446), '吉方位を地図で確かめられる。', font=sub, fill=(235, 228, 210))
    draw.line((460, 366, 1100, 366), fill=(120, 96, 40), width=2)
    return rgb


def main():
    OUT.mkdir(exist_ok=True)
    icon(192, 0.78).save(OUT / 'icon-192.png')
    icon(512, 0.78).save(OUT / 'icon-512.png')
    icon(512, 0.60).save(OUT / 'icon-maskable-512.png')  # Android が丸や角丸に切り抜いても欠けない余白
    icon(180, 0.78).save(OUT / 'apple-touch-icon.png')
    icon(64, 0.92).save(OUT / 'favicon.png')
    og().save(OUT / 'og.png')
    print('ok:', ', '.join(sorted(p.name for p in OUT.glob('*.png'))))


if __name__ == '__main__':
    main()
