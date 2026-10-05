# 地図・円盤まわりで使う、飾りの小さな線画（方位星・テーマのしるし など）を作る。
#
#   実行: uv run --with resvg-py --with pillow python scripts/build_direction_ui_assets.py
#   出力: public/direction-ui/<名前>.svg と <名前>.png（1024×1024・背景は透明）
#         docs/direction_ui_preview.png（32px / 48px に縮めた確認用。アプリでは使わない）
#
# 8方位の扇・色・点数・方位名・選択中の表示など、データで変わるものはここでは作らない（アプリが描く）。
# 線画は、すべて同じ決まりで描く: 64×64 の枠・同じ線の太さ・同じ金色・塗りなし・丸い線の端。
# 画像生成AIの絵をなぞったものではなく、線を1本ずつ書いた SVG。
import io
import os
import sys

import resvg_py
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'direction-ui')
PREVIEW = os.path.join(ROOT, 'docs', 'direction_ui_preview.png')

GOLD = '#C79A38'   # 落ち着いた古金
STROKE = 1.6       # 64 の枠での線の太さ（全部同じ）
SIZE = 1024


def rot(shape, steps, step_deg):
    return ''.join(f'<g transform="rotate({i * step_deg} 32 32)">{shape}</g>' for i in range(steps))


# 針は中央の円の手前で止める（中央で線が重なって、小さくしたときに潰れないように）
LONG_NEEDLE = '<path d="M32 7 L33.7 26.6 L32 28.2 L30.3 26.6 Z"/>'
SHORT_NEEDLE = '<path d="M32 18 L33.2 26.8 L32 27.9 L30.8 26.8 Z"/>'

ICONS = {
    # 01 中央の円に置く方位星（八方向の細い針＋中央の小さな円）
    'compass-rose': (
        rot(LONG_NEEDLE, 4, 90)
        + f'<g transform="rotate(45 32 32)">{rot(SHORT_NEEDLE, 4, 90)}</g>'
        + '<circle cx="32" cy="32" r="2"/>'
    ),
    # 02 その日の一番良い方位に付ける小さな印（光の印。王冠やトロフィーにはしない）
    'best-direction': (
        '<path d="M32 9 C33 22 42 31 55 32 C42 33 33 42 32 55 C31 42 22 33 9 32 C22 31 31 22 32 9 Z"/>'
        '<path d="M19.5 19.5 L24.5 24.5 M44.5 19.5 L39.5 24.5 M19.5 44.5 L24.5 39.5 M44.5 44.5 L39.5 39.5"/>'
    ),
    # 08 総合（方位星をさらに簡単にしたもの）
    'theme-general': (
        '<path d="M32 9 L35.2 28.8 L55 32 L35.2 35.2 L32 55 L28.8 35.2 L9 32 L28.8 28.8 Z"/>'
        '<circle cx="32" cy="32" r="1.6"/>'
    ),
    # 03 ご縁（一筆で描いたようなハート。下で線が少し行き過ぎる）
    'theme-love': (
        '<path d="M33.5 53.5 C19 43.5 10 34 10 23.5 C10 16.5 15.2 11.5 21.5 11.5 C26.5 11.5 30.5 14.8 32 19.5 '
        'C33.5 14.8 37.5 11.5 42.5 11.5 C48.8 11.5 54 16.5 54 23.5 C54 33.5 45 43 30.5 53"/>'
    ),
    # 04 仕事（小さな昔ながらのかばん。角はやわらかく）
    'theme-work': (
        '<rect x="10" y="22" width="44" height="28" rx="5"/>'
        '<path d="M24 22 V18.5 C24 16 26 14 28.5 14 H35.5 C38 14 40 16 40 18.5 V22"/>'
        '<path d="M10 34.5 H28.5 M35.5 34.5 H54"/>'
        '<rect x="28.5" y="31.5" width="7" height="6" rx="1.4"/>'
    ),
    # 05 金運（まんなかに四角い穴のある古銭）
    'theme-money': (
        '<circle cx="32" cy="32" r="22"/>'
        '<circle cx="32" cy="32" r="17.5" stroke-dasharray="1.2 3.4"/>'
        '<rect x="26.5" y="26.5" width="11" height="11" rx="1.2"/>'
    ),
    # 06 健康（一枚の葉）
    'theme-health': (
        '<path d="M13 51 C12 29 27 12 51 12 C52 35 36 51 13 51 Z"/>'
        '<path d="M13 51 C23 40 35 27 46 17"/>'
        '<path d="M24 39.5 C24 34 25 30 27 26.5 M24 39.5 C29.5 39.5 33.5 38.5 37 36.5 M33.5 30 C33.5 26 34.5 23 36 20.5 M33.5 30 C37.5 30 40.5 29.2 43 27.8"/>'
    ),
    # 07 勉強（開いた本。文字は描かない）
    'theme-study': (
        '<path d="M32 19.5 C26 14.5 17 13.5 9 15.5 V46 C17 44 26 45 32 50"/>'
        '<path d="M32 19.5 C38 14.5 47 13.5 55 15.5 V46 C47 44 38 45 32 50"/>'
        '<path d="M32 19.5 V50"/>'
    ),
    # 09 地図で見る（折りたたんだ地図＋小さな方位の印）
    'map-direction': (
        '<path d="M9 18.5 L24 13 L40 18.5 L55 13 V45.5 L40 51 L24 45.5 L9 51 Z"/>'
        '<path d="M24 13 V45.5 M40 18.5 V51"/>'
        '<path d="M32 23.5 L33.4 30.6 L40.5 32 L33.4 33.4 L32 40.5 L30.6 33.4 L23.5 32 L30.6 30.6 Z"/>'
    ),
    # 10 「今日のポイント」の横に置く、小さな方位磁針（方位星より少し飾りがある）
    'daily-point': (
        '<circle cx="32" cy="35" r="20"/>'
        '<circle cx="32" cy="35" r="15.5" stroke-dasharray="1.2 3.2"/>'
        '<circle cx="32" cy="10.2" r="3"/>'
        '<path d="M32 13.2 V15"/>'
        '<g transform="translate(0 3)">'
        '<path d="M32 19.5 L33.8 30.2 L32 32 L30.2 30.2 Z"/><path d="M32 44.5 L30.2 33.8 L32 32 L33.8 33.8 Z"/>'
        '<path d="M19.5 32 L30.2 30.2 L32 32 L30.2 33.8 Z"/><path d="M44.5 32 L33.8 33.8 L32 32 L33.8 30.2 Z"/>'
        '<circle cx="32" cy="32" r="1.6"/>'
        '</g>'
    ),
    # 11〜15 飾り（とても簡単に）
    'sun': (
        '<circle cx="32" cy="32" r="9.5"/>'
        + rot('<path d="M32 8 V16"/>', 4, 90)
        + '<g transform="rotate(45 32 32)">' + rot('<path d="M32 11.5 V16.5"/>', 4, 90) + '</g>'
    ),
    'moon': '<path d="M41 9.5 C28 10.5 18 21 18 34 C18 46 27 55 39 55 C45 55 50 52.5 54 48.5 C40 50.5 29 41 29 28 C29 20.5 33.5 13.5 41 9.5 Z"/>',
    'cloud': (
        '<path d="M14 45 H46.5 C52.5 45 57 40.8 57 35.5 C57 30.5 53 26.8 48.5 27 C48.5 18.5 38 14.5 31.5 21.5 '
        'C24.5 17.5 16.5 23.5 17.5 31.5 C12.5 30.5 7.5 34 7.5 38.8 C7.5 42.3 10.5 45 14 45"/>'
        '<path d="M38.5 36.5 C39.5 32.5 44.5 31.5 47 34.5 C49 37 47 40 44.5 39.2"/>'
    ),
    'mountain': (
        '<path d="M6 50 L24 19 L33.5 35.5 L41 25.5 L58 50"/>'
        '<path d="M19 27.5 L22.2 30 L24.6 27 L27.4 30.2 L29.5 28.5"/>'
        '<path d="M12 50 H52"/>'
    ),
    'wave': (
        '<path d="M6 39 C13 26.5 27 26 30.5 37 C32.5 43.5 28 48 23.5 46 C20 44.4 20.8 39.5 24.5 39.6"/>'
        '<path d="M30.5 37 C36 28 48 27.5 58 38.5"/>'
        '<path d="M8 51 C20 46.5 42 46.5 56 51"/>'
    ),
}

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


def svg_of(body):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" '
        f'stroke="{GOLD}" stroke-width="{STROKE}" stroke-linecap="round" stroke-linejoin="round">'
        f'{body}</svg>\n'
    )


def render(svg, size):
    data = bytes(resvg_py.svg_to_bytes(svg_string=svg, width=size, height=size))
    return Image.open(io.BytesIO(data)).convert('RGBA')


def check(name, image):
    """背景が透明か・大きさ・余白・色がそろっているかを確かめる。だめなら止める。"""
    assert image.size == (SIZE, SIZE), (name, image.size)
    assert image.mode == 'RGBA', (name, image.mode)
    alpha = image.getchannel('A')
    corners = [alpha.getpixel(p) for p in [(0, 0), (SIZE - 1, 0), (0, SIZE - 1), (SIZE - 1, SIZE - 1), (4, SIZE // 2), (SIZE // 2, 4)]]
    assert all(a == 0 for a in corners), (name, 'the background is not transparent', corners)
    box = alpha.getbbox()
    margin = min(box[0], box[1], SIZE - box[2], SIZE - box[3]) / SIZE
    assert margin >= 0.07, (name, 'too little padding', margin)
    opaque = sum(1 for a in alpha.get_flattened_data() if a > 0) / (SIZE * SIZE)
    assert 0.01 < opaque < 0.2, (name, 'line coverage looks wrong', opaque)
    # 色は金の1色だけ（はっきり描かれている点を調べる）
    solid = [px[:3] for px in image.get_flattened_data() if px[3] == 255]
    wanted = tuple(int(GOLD[i:i + 2], 16) for i in (1, 3, 5))
    off = sum(1 for px in solid if max(abs(px[i] - wanted[i]) for i in range(3)) > 3)
    assert off == 0, (name, 'unexpected colours', off)
    return margin, opaque


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = []
    small = {}
    for name, body in ICONS.items():
        svg = svg_of(body)
        with open(os.path.join(OUT, f'{name}.svg'), 'w', encoding='utf-8', newline='\n') as handle:
            handle.write(svg)
        image = render(svg, SIZE)
        margin, opaque = check(name, image)
        image.save(os.path.join(OUT, f'{name}.png'), optimize=True)
        small[name] = {size: render(svg, size * 2) for size in (16, 24, 32, 48, 64)}  # 2倍で描いて、くっきり見せる
        rows.append((name, margin, opaque))
        print(f'{name:16s} 余白 {margin:.0%}  線の割合 {opaque:.1%}  {USES[name]}')

    # 確認用の一覧: 明るい地と暗い地の両方に、16 / 24 / 32 / 48 / 64px で並べる（アプリでは使わない）
    sizes = (16, 24, 32, 48, 64)
    cell_w, cell_h = 150, 2 * sum(s + 14 for s in sizes) + 40
    sheet = Image.new('RGB', (cell_w * len(ICONS), cell_h), '#F8F4EA')
    draw = ImageDraw.Draw(sheet)
    half = (cell_h - 40) // 2
    draw.rectangle([0, 40 + half, sheet.width, cell_h], fill='#1C1A18')
    for column, name in enumerate(ICONS):
        x0 = column * cell_w
        draw.text((x0 + 6, 12), name, fill='#57504A')
        for band, top in enumerate((40, 40 + half)):
            y = top + 8
            for size in sizes:
                icon = small[name][size].resize((size, size), Image.LANCZOS)
                sheet.paste(icon, (x0 + (cell_w - size) // 2, y), icon)
                y += size + 14
    sheet.save(PREVIEW, optimize=True)
    print(f'\n{len(rows)} 個を {os.path.relpath(OUT, ROOT)} に保存。確認用の一覧: {os.path.relpath(PREVIEW, ROOT)}')


if __name__ == '__main__':
    main()
