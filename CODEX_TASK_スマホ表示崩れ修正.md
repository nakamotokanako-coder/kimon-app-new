# 🎯 Codex タスク：スマホ表示で宮セル内レイアウトが崩れる不具合の修正

**作成**: 2026-05-24 / Claude Web
**実行**: Codex（kimon-app ローカル `C:\dev\kimon-app`）
**種別**: バグ修正（CSSレスポンシブ）
**最重要制約**: **PC表示（現状の正しい表示）を絶対に壊さないこと**

---

## 🐛 症状

スマホ幅（実機）で盤を表示すると、**宮セル内の要素配置が崩れて重なる**。
特に **八神＋九星（右上の縦2段）が本来の右上位置に収まらず、九星名が縦に折り返したり他要素と重なって見える**。

- PC幅：正常（宮名＋点数＝上、天地盤干＝左、八神九星＝右上に縦2段、八門＝中央下、格局象意＝左下）
- スマホ幅：上記の左右配置が崩れ、八神九星が縦に潰れる／重なる

※ 八神と九星が「縦2段で右上」に出るのは**正しい仕様**。これを横並びにするのではなく、PC版と同じ縦2段配置をスマホでも維持したい（縮小再現）。

---

## 🎯 ゴール

スマホ幅でも、PC版と同じ宮セル内レイアウト（下記）を**縮小して再現**する：
- 左上：宮名・五行・点数バッジ（`.cell-header`）
- 左：天盤干・地盤干（`.kan-stack`）
- 右上：八神・九星を縦2段（`.cell-meta-right` > `.hasshin` / `.kyusei`）
- 中央下寄り：八門ピル（`.cell-mon-row` > `.mon-pill`）
- 左下：格局・十干剋応の象意リスト（`.info-list` > `.info-item`）

要素が重ならず、各宮セル内に収まっていればよい。フォントは小さくなってOK。

---

## 📍 関連ファイル・該当箇所（調査済み）

### JSX
- `src/components/BoardGrid.jsx`（8宮＋中央の配置、L92〜）
- `src/components/PalaceCell.jsx`（宮セルの中身）
  - 宮セル内配置：L114〜165
  - 中央宮：L69（`.cell-center` / `.cell-center-body` / `.center-alerts` / `.cell-empty`）
  - ヘッダー：L116（`.cell-header` / `.palace-label` / `.palace-element` / `.score-badge`）
  - 天地盤干：L128（`.cell-row-top` / `.kan-stack` / `.kan-tenban` / `.kan-chiban`）
  - 八神九星：L138（`.cell-meta-right` / `.hasshin` / `.kyusei`）
  - 八門：L152（`.cell-mon-row` / `.mon-pill`）
  - 象意リスト：L159（`.info-list` / `.info-item` / `.info-prefix` / `.info-name`）

### CSS（`src/styles.css`）
- 盤グリッド `.board-grid`：L311
- 宮セル `.cell`：L393
- ヘッダー系：L423
- 天地盤干 `.cell-row-top` / `.kan-stack` / `.kan-tenban` / `.kan-chiban`：L462
- **八神九星 `.cell-meta-right` / `.hasshin` / `.kyusei`：L490** ← 崩れの中心
- 八門 `.cell-mon-row` / `.mon-pill`：L509
- 象意リスト `.info-list` / `.info-item`：L547
- 中央宮：L618
- **`@media (max-width: 900px)`：L920**（board-area 1カラム化、内側3列 repeat(3, minmax(0,1fr))）
- **`@media (max-width: 640px)`：L940**（gap/padding、`.cell` padding & min-height:170px、各フォント縮小）

---

## 🔬 まず原因を特定（推定→現物で確認）

**推定原因**（要・現物確認）：
宮セル内の左右配置（天地盤干＝左／八神九星＝右上）は、PC では `.cell-row-top` の flex か `.cell-meta-right` の `position: absolute` 等で実現しているはず。
**640px の `@media` で `.cell` の min-height/padding/font だけ調整しており、この左右配置を支える指定が（セル幅縮小により）破綻している**可能性が高い。具体的には：
- `.cell-meta-right` が absolute 配置なら、親 `.cell` の幅縮小＋padding変更で右上アンカーがズレて重なる
- flex 配置なら、幅不足で `.hasshin`/`.kyusei` のテキストが折り返している（`white-space` 未指定）
- `min-height:170px` が情報量に対して不足し、八門・info-list が八神九星の領域へかぶる

**確認手順**：
1. L490 周辺で `.cell-meta-right` の配置方式（absolute か flex か）を確認
2. L940 の 640px `@media` で `.cell-meta-right` / `.hasshin` / `.kyusei` に触れているか確認（触れていない＝PC前提のまま破綻、が濃厚）
3. ブラウザのデバイスエミュレーション（375〜414px幅）で重なりを再現し、どの要素がどこへはみ出すか特定

---

## 🛠 修正方針（PC を壊さない形で）

**原則：PC幅のルールは触らず、`@media (max-width: 640px)`（および必要なら 480px の追加ブレークポイント）の中だけで調整する。**

想定される具体策（現物確認後に取捨選択）：
- `.hasshin` / `.kyusei` に `white-space: nowrap` を効かせ、九星名（3文字）が折り返さないようフォント/字間を縮小
- `.cell-meta-right` が absolute なら、640px で `top`/`right` を padding に合わせて再アンカー。flex なら親の `min-width: 0` と子の縮小許可（`flex-shrink`）を調整
- `.cell` の `min-height` を情報量に合わせて引き上げ or `height:auto` 許容（要素の重なり解消を優先）
- 八門 `.cell-mon-row` と `.info-list` が右上領域へ侵入しないよう、セル内を縦フロー（header → 干/八神九星の行 → 八門 → info-list）として破綻しないグリッド/フローに整える
- 必要なら 480px 以下の追加 `@media` で更にフォント縮小

**やらないこと**：
- 八神九星を横並びに変える（縦2段が正しい）
- PC幅（>900px）のレイアウト・配置・フォントの変更
- データ・JSXのロジック変更（配置の構造変更が要る場合も、表示クラスの範囲にとどめ、表示内容は変えない）

---

## 🔍 チェック項目

- [ ] スマホ幅（375px / 390px / 414px で確認）で、全9宮セル内の要素が**重ならず収まる**
- [ ] 八神・九星が**右上に縦2段**で表示される（PC版と同じ並び、折り返し・潰れなし）
- [ ] 天地盤干・八門ピル・格局象意リストがそれぞれ正しい位置に出る
- [ ] 中央宮（星反吟/門反吟 等のアラート、または空宮）も崩れない
- [ ] 点数バッジ・順利バッジがヘッダー右に出る
- [ ] **PC幅（デスクトップ）で表示が一切変わっていない**（リグレッションなし。修正前後でPC表示を見比べる）
- [ ] 900px / 640px の各ブレークポイント前後で破綻がない
- [ ] `npm run build` 成功 / `npm run dev` で実寸確認

---

## 📌 完了条件

1. スマホ幅で宮セル内レイアウトがPC版同様（縮小再現）になり、重なりが解消
2. PC幅のレイアウトが無変更（リグレッションなし）
3. build成功 / dev目視（複数幅）OK
4. commit（例: `fix(board): keep palace cell layout intact on mobile widths`）
5. PR → マージ

---

## 💡 補足

- 修正は基本 `src/styles.css` の `@media` 内で完結するはず。JSX（PalaceCell.jsx）の構造変更は最終手段とし、必要なら最小限に。
- 確認用に、PC幅とスマホ幅のスクショを修正前後で残すとレビューしやすい。
