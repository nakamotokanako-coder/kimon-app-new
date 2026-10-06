# 線画アイコンと、格局の絵 v1

2026-10-06。画面の操作・用途・状態の印を、1つの決まりで描いた線画アイコンにそろえる。

## 決まり

- viewBox `0 0 24 24`（格局の印 `symbol-*` だけ `0 0 48 48`）
- 線 1.6 ／ 丸い端・丸い角 ／ 塗りなし
- 色は固定しない（`currentColor`）。色は置く場所の CSS の `color` で決める
  - ふだん … 文字の色のまま
  - 選択中 … 親に `color: var(--accent)` を付ける
- 塗りが要るのは評価の星（`filled`）だけ
- 色で用途を分けない（神社＝赤、恋愛＝桃色、などにしない）。形とラベルで見分ける

## 使い方

```jsx
import { Icon, Decoration } from './components/icons/index.js';

<Icon name="purpose-shrine" />              // 24px
<Icon name="star" size={16} filled />       // 塗った星
<Icon name="symbol-shendun" size={48} />    // 格局の印
<Decoration name="mountains" />             // 背景の飾り（色と濃さは CSS で）
```

## 置き場所

| 場所 | 中身 |
|---|---|
| `src/components/icons/Icon.jsx` | アイコンを出す部品（`<Icon name="..." />`） |
| `src/components/icons/purposeIcons.jsx` | 用途（13）: shrine, love, work, money, study, home, travel, purification, broadcast, people, negotiate, result, sea |
| `src/components/icons/actionIcons.jsx` | 操作（11）: search, arrow-left, arrow-right, chevron-down, chevron-up, bookmark, share, edit, close, reset, filter |
| `src/components/icons/resultIcons.jsx` | 結果・評価（10）: crown, star, calendar, compass, map, location, check-circle, info, clock, direction |
| `src/components/icons/navIcons.jsx` | 下のメニュー（5）: nav-home, nav-board, nav-map, nav-search, nav-more |
| `src/components/icons/qimenIcons.jsx` | 奇門遁甲らしい補助（6）: yin-yang, nine-grid, direction, sun, moon, cloud |
| `src/components/icons/symbolIcons.jsx` | 格局の印（12）: qinglong, feiniao, tiandun, didun, rendun, yundun, fengdun, longdun, hudun, shendun, guidun, yunv |
| `src/components/icons/Decoration.jsx` | 背景の飾りを出す部品 |
| `src/assets/decorations/*.svg` | 背景の飾り（4）: cloud, mountains, branch, celestial |

用途の `broadcast` `people` `negotiate` `result` `sea` は、格局検索の「何をしたい？」（発信・宣伝／人脈・協力／交渉・駆け引き／成果を形にする／海・海外・流通）のために足したもの。

## いま使っている所

| 所 | アイコン |
|---|---|
| 下のメニュー（`src/App.jsx`） | nav-home / nav-board / nav-map / nav-search / nav-more（中に書いてあった SVG を置き換えた。「その他」は歯車から三つの点へ） |
| 目的で選ぶ（`ThemeBestView.jsx`） | crown（BEST 1）/ star（評価）/ calendar（日時）/ arrow-right（地図で見る）/ chevron-down・up（2位・3位） |
| 格局検索の「何をしたい？」（`KakkyokuSearchView.jsx`） | purpose-broadcast / love / work / study / people / negotiate / result / sea / shrine |
| 格局の案内（同上） | check-circle（こんな日に）/ calendar・arrow-right（この格局が出る日時を探す）/ chevron-down・up（くわしく） |

まだ使っていないもの: purpose-money / home / travel / purification、bookmark / share / edit / close / reset / filter / search / arrow-left、
compass / map / location / info / clock / direction、qimen-*、背景の飾りの SVG 4つ、格局の印 symbol-*（下の絵が無いときの代わり）。

## 格局の絵（運営者が用意した絵）

格局の一覧と案内には、線画の印ではなく、運営者が用意した絵を出す。

- 元の絵（PNG・1枚 1〜2MB）はリポジトリに入れない。`image/divination/` に置く（`public/` の下には置かない。そのまま配信されてしまうため）
- `python scripts/build_divination_images.py [元の絵のフォルダ]` で、`public/divination/*.webp` を作る（16枚で合計 約520KB）
- 格局と絵の対応は `src/reverseDirection/kakkyokuGuide.js` の `image`

| 絵 | 格局・使う所 |
|---|---|
| seiryu-henko / asuka-gekketsu / tento / chito / jinto / futo / unto / ryuto / koto / shinto-icon / kito / gyokunyo | 青龍返首 / 飛鳥跌穴 / 天遁 / 地遁 / 人遁 / 風遁 / 雲遁 / 龍遁 / 虎遁 / 神遁 / 鬼遁 / 玉女守門（一覧の絵） |
| shinto-hero | 神遁の案内を開いたときの大きい絵 |
| mountain-bg | 格局検索のいちばん上の、背景の山 |
| botanical-branch / cloud-ornament | 書き出してあるが、まだ使っていない |
