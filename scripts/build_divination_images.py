# scripts/build_divination_images.py
# 格局の絵と飾りの絵を、アプリで使える形に整える（小さく・軽く）。
#
#   元の絵:   image/divination/*.png （リポジトリには入れない。1枚 1〜2MB あるため）
#             別の場所にあるときは、引数で渡す: python scripts/build_divination_images.py <フォルダ>
#   実行:     python scripts/build_divination_images.py
#   出力:     public/divination/*.webp
#
#   格局の絵（背景は透明・正方形 320px。画面では 56〜120px で出す）
#     seiryu-henko 青龍返首 / asuka-gekketsu 飛鳥跌穴 / tento 天遁 / chito 地遁 / jinto 人遁 / futo 風遁
#     unto 雲遁 / ryuto 龍遁 / koto 虎遁 / shinto-icon 神遁 / kito 鬼遁 / gyokunyo 玉女守門
#   大きい絵   shinto-hero（神遁。幅 1280px）
#   飾り       mountain-bg（幅 1200px）/ botanical-branch（幅 900px）/ cloud-ornament（幅 800px）
#
# 絵を足したら、src/reverseDirection/kakkyokuSearch.js の KAKKYOKU_GUIDE の image に名前を書く。
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'divination'

SYMBOLS = [
    'seiryu-henko', 'asuka-gekketsu', 'tento', 'chito', 'jinto', 'futo',
    'unto', 'ryuto', 'koto', 'shinto-icon', 'kito', 'gyokunyo',
]
SYMBOL_SIZE = 320
WIDE = {'shinto-hero': 1280, 'mountain-bg': 1200, 'botanical-branch': 900, 'cloud-ornament': 800}


def square(im):
    """透明な余白を切り落として、正方形のまん中に置く（背景は透明のまま）"""
    box = im.getchannel('A').getbbox()
    if box:
        im = im.crop(box)
    side = round(max(im.size) * 1.04)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    return canvas.resize((SYMBOL_SIZE, SYMBOL_SIZE), Image.LANCZOS)


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'image' / 'divination'
    if not src.exists():
        print(f'元の絵のフォルダがありません: {src}')
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    done, missing = [], []
    for name in SYMBOLS:
        path = src / f'{name}.png'
        if not path.exists():
            missing.append(name)
            continue
        square(Image.open(path).convert('RGBA')).save(OUT / f'{name}.webp', 'WEBP', quality=86, method=6)
        done.append(name)
    for name, width in WIDE.items():
        path = src / f'{name}.png'
        if not path.exists():
            missing.append(name)
            continue
        im = Image.open(path)
        im = im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
        if im.mode == 'RGBA':
            box = im.getchannel('A').getbbox()
            if box:
                im = im.crop(box)
        if im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        im.save(OUT / f'{name}.webp', 'WEBP', quality=82, method=6)
        done.append(name)
    total = sum((OUT / f'{name}.webp').stat().st_size for name in done)
    print(f'{len(done)}枚を書き出しました（合計 {total // 1024}KB）→ {OUT}')
    if missing:
        print('元の絵が無いもの: ' + ', '.join(missing))
    return 0


if __name__ == '__main__':
    sys.exit(main())
