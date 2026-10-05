# 紹介ページ（LP）の画像

紹介ページ（`src/components/IntroPage.jsx`）で使う画像は `public/lp/` に置く。

## 風景・墨絵・飾り

元の画像は `奇門遁甲用イメージ/`（リポジトリには入れない。`.git/info/exclude` で外している）。
そこから、幅を小さくして WebP にしたものを `public/lp/` に置く。

| ファイル | 使う場所 | 元の画像 |
|---|---|---|
| hero-ink.webp | いちばん上の背景 | 霧に浮かぶ山水と孤塔 |
| compass.webp / crane.webp | いちばん上・「盤は簡略化しない」の飾り | 黄金コンパスローズ紋章 / 金彩丹頂鶴 |
| now-street.webp | 「今から吉方位へ」のカード | 夕暮れの古都、五重塔への坂道 |
| plan-sea.webp / spot-sea.webp | 「休みの日から旅先を探す」のカード・スポットの例 | 青空に広がる碧い入り江と島々 |
| spot-cafe.webp / spot-shrine.webp / spot-shop.webp | スポットの例・4ステップの04 | 珈琲時間 / 朱色の神社参道 / 窓辺カフェ |
| ink-mountain.webp / lotus.webp | 飾り | 墨絵の山並み / 水彩蓮の花 |
| final-sunset.webp | いちばん下の背景 | 夕陽を受ける山あいの手 |

## アプリの画面

`screen-home.webp` `screen-map.webp` `step-date.webp` `step-reason.webp` `step-map.webp` は、
**実際のアプリの画面を撮ったもの**（架空の画面は描かない）。

画面の見た目を変えたら、撮り直す。手元のプレビュー（`kimon-dev-login`）をスマホ幅（375×812）で開き、
ホーム・地図・日時を選ぶ帯・方位の詳しいカードを撮って、必要な部分を切り出す。
基準点は「東京」、アカウントはプレビュー用のもので撮る（個人の情報が写らないように）。

`screen-map.webp` `screen-spots.webp` `step-map.webp` `step-reason.webp` は、本番のアプリの画面（場所を検索してピンが立った状態・解説の文章が出ている状態）を撮ったもの。
手元のプレビューには検索と解説の入口が無く、これらの画面は撮れないため。基準点は公共の場所（皇居外苑）にして撮っている。
