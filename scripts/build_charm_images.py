# scripts/build_charm_images.py
# お守りの画像を、アプリで使える形に整える。
#
#   置き場所: image/charms/<ID>.png（または .jpg / .webp）   例: image/charms/son-1.png
#   実行:     python scripts/build_charm_images.py
#   出力:     public/charms/<ID>.webp（正方形 480px・背景は透明・軽量化）
#             src/kimon/charmImages.js（画像があるお守りの一覧。CharmCard はここにあるものだけ画像を出す）
#
# ID は「方位-番号」。方位は kan(北) gon(北東) shin(東) son(南東) ri(南) kun(南西) da(西) ken(北西)、
# 番号は src/kimon/charm.js の CHARM_LIBRARY に書いてある順（1〜6）。一覧は docs/charm_images.md。
# 画像が無いお守りは、今までどおり文字だけで表示される（何枚からでも始められる）。
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'image' / 'charms'
OUT = ROOT / 'public' / 'charms'
LIST = ROOT / 'src' / 'kimon' / 'charmImages.js'
SIZE = 480
ID_RE = re.compile(r'^(kan|gon|shin|son|ri|kun|da|ken)-[1-6]$')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ids = []
    skipped = []
    for path in sorted(SRC.glob('*')) if SRC.exists() else []:
        if path.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        if not ID_RE.match(path.stem):
            skipped.append(path.name)
            continue
        im = Image.open(path).convert('RGBA')
        # 透明な余白を切り落として物を大きく見せ、正方形の中央に置く（背景は透明のまま）
        box = im.getchannel('A').getbbox()
        if box:
            im = im.crop(box)
        side = round(max(im.size) * 1.06)
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
        im = canvas.resize((SIZE, SIZE), Image.LANCZOS)
        im.save(OUT / f'{path.stem}.webp', 'WEBP', quality=80, method=6)
        ids.append(path.stem)
    # 元の画像が無くなったものは、出力からも消す
    for old in OUT.glob('*.webp'):
        if old.stem not in ids:
            old.unlink()
    body = ''.join(f"  '{i}',\n" for i in ids)
    LIST.write_text(
        '// 自動生成（scripts/build_charm_images.py）。手で編集しないこと。\n'
        '// 画像があるお守りの ID（public/charms/<ID>.webp）。\n'
        f'export const CHARM_IMAGE_IDS = new Set([\n{body}]);\n',
        encoding='utf-8', newline='\n')
    print(f'画像 {len(ids)} 枚 → public/charms/')
    if skipped:
        print('名前が ID の形でないため使わなかったもの:', ', '.join(skipped))


if __name__ == '__main__':
    main()
