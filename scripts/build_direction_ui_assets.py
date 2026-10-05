# 地図・円盤まわりで使う飾りの線画（方位星・テーマのしるし など）の、PNG と確認用の一覧を作る。
#
#   実行: uv run --with resvg-py --with pillow python scripts/build_direction_ui_assets.py
#   もと: public/direction-ui/<名前>.svg（線の色は currentColor。使う側の文字色で色が決まる）
#   出力: public/direction-ui/<名前>.png（1024×1024・背景は透明・古金色）
#         docs/direction_ui_preview.png（16〜64px に縮めた確認用。アプリでは使わない）
#
# 8方位の扇・色・点数・方位名・選択中の表示など、データで変わるものはここでは作らない（アプリが描く）。
# SVG は書き換えない（読むだけ）。SVG を直したら、このスクリプトを動かして PNG と一覧を作り直す。
import io
import os
import sys

import resvg_py
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'direction-ui')
PREVIEW = os.path.join(ROOT, 'docs', 'direction_ui_preview.png')

GOLD = '#C79A38'   # 落ち着いた古金（PNG にするときの色）
INK = '#34302B'    # 墨色（確認用）
SIZE = 1024

USES = {
    'compass-rose': '円盤の中央に置く方位星',
    'best-direction': 'その日の一番良い方位の印',
    'theme-general': '総合',
    'theme-love': 'ご縁',
    'theme-work': '仕事',
    'theme-money': '金運',
    'theme-health': '健康',
    'theme-study': '勉強',
    'map-direction': '「地図で見る」',
    'daily-point': '「今日のポイント」の飾り',
    'sun': '飾り（太陽）',
    'moon': '飾り（三日月）',
    'cloud': '飾り（雲）',
    'mountain': '飾り（山）',
    'wave': '飾り（波）',
}


def render(svg, size, color=GOLD):
    data = bytes(resvg_py.svg_to_bytes(svg_string=svg.replace('currentColor', color), width=size, height=size))
    return Image.open(io.BytesIO(data)).convert('RGBA')


def inspect(name, svg, image):
    """決まりを確かめる。守れていないと困るものは止め、気をつけたいものは注意として返す。"""
    assert image.size == (SIZE, SIZE) and image.mode == 'RGBA', (name, image.size, image.mode)
    assert 'viewBox="0 0 64 64"' in svg, (name, 'viewBox')
    assert 'currentColor' in svg and '<text' not in svg and 'filter' not in svg and 'Gradient' not in svg, (name, 'svg rules')
    alpha = image.getchannel('A')
    corners = [alpha.getpixel(p) for p in [(0, 0), (SIZE - 1, 0), (0, SIZE - 1), (SIZE - 1, SIZE - 1)]]
    assert all(a == 0 for a in corners), (name, 'the background is not transparent', corners)
    wanted = tuple(int(GOLD[i:i + 2], 16) for i in (1, 3, 5))
    solid = [px[:3] for px in image.get_flattened_data() if px[3] == 255]
    assert all(max(abs(px[i] - wanted[i]) for i in range(3)) <= 3 for px in solid), (name, 'unexpected colours')
    box = alpha.getbbox()
    margin = min(box[0], box[1], SIZE - box[2], SIZE - box[3]) / SIZE
    notes = []
    if margin <= 0.001:
        notes.append('線が枠の端に届いていて、端で切れている')
    elif margin < 0.07:
        notes.append(f'余白が少ない（{margin:.0%}）')
    return margin, notes


def main():
    missing = [name for name in USES if not os.path.exists(os.path.join(OUT, f'{name}.svg'))]
    assert not missing, ('missing svg', missing)
    names = list(USES)
    small = {}
    warnings = []
    for name in names:
        with open(os.path.join(OUT, f'{name}.svg'), encoding='utf-8') as handle:
            svg = handle.read()
        image = render(svg, SIZE)
        margin, notes = inspect(name, svg, image)
        image.save(os.path.join(OUT, f'{name}.png'), optimize=True)
        small[name] = {
            (size, color): render(svg, size * 2, color)  # 2倍で描いて、くっきり見せる
            for size in (16, 24, 32, 48, 64)
            for color in (GOLD, INK)
        }
        print(f'{name:16s} 余白 {margin:.0%}  {USES[name]}' + (f'  ※ {"・".join(notes)}' if notes else ''))
        warnings += [(name, note) for note in notes]

    # 確認用の一覧: 金（明るい地）・金（暗い地）・墨色（白い地）に、16 / 24 / 32 / 48 / 64px で並べる
    sizes = (16, 24, 32, 48, 64)
    band = sum(s + 14 for s in sizes) + 16
    bands = [('#F8F4EA', GOLD), ('#1C1A18', GOLD), ('#FFFFFF', INK)]
    cell_w = 150
    sheet = Image.new('RGB', (cell_w * len(names), 40 + band * len(bands)), '#F8F4EA')
    draw = ImageDraw.Draw(sheet)
    for index, (background, _) in enumerate(bands):
        draw.rectangle([0, 40 + band * index, sheet.width, 40 + band * (index + 1)], fill=background)
    for column, name in enumerate(names):
        x0 = column * cell_w
        draw.text((x0 + 6, 12), name, fill='#57504A')
        for index, (_, color) in enumerate(bands):
            y = 40 + band * index + 8
            for size in sizes:
                icon = small[name][(size, color)].resize((size, size), Image.LANCZOS)
                sheet.paste(icon, (x0 + (cell_w - size) // 2, y), icon)
                y += size + 14
    sheet.save(PREVIEW, optimize=True)
    print(f'\n{len(names)} 個の PNG を {os.path.relpath(OUT, ROOT)} に保存。確認用の一覧: {os.path.relpath(PREVIEW, ROOT)}')
    if warnings:
        print('注意:', '; '.join(f'{name}（{note}）' for name, note in warnings))


if __name__ == '__main__':
    main()
