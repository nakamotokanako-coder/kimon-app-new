# Codex実装指示：時盤に「簡易グリッド（中身プレビュー）」を追加

> 対象：吉方位タブ＝時盤お散歩モードの「逆引き方位検索」画面。
> やること2つ：
> 1. **「本日の時間帯別ベスト」の各行をタップ → その時辰の盤を簡易グリッドで展開（アコーディオン）**。
> 2. **「今の時盤」（上の扇マップ）の下にも、同じ簡易グリッドを常時表示**。
> 目的：一覧の点数だけでは「2時間後どの方位に何（八門）があるか」が分からない。盤の中身をその場でパッと確認できるようにする。本物の盤は作盤タブで見れるので**ここはあくまで簡易プレビュー**。
> レイアウトの正解：モック **`grid_size_compare.html` の「M 中」サイズ**。

---

## 0. 大原則（必読）

- **既存の判定エンジンには一切手を入れない**。`src/kimon/` 配下（buildBoard, scoreEngine, kakkyoku, jukkanKokuou, banLevel, junri, timeKanshi）は**呼ぶだけ・改変禁止**。点数・八門・八神は既存出力をそのまま使う。
- **AIは使わない**。全て既存の自前エンジン。
- 作業は**新しいブランチ**。必ず最新mainから切る：`git checkout main && git pull && git checkout -b feat-jiban-grid`
  - push前に `git log --oneline origin/main..feat-jiban-grid` で差分が想定どおりか確認（前回のブランチ混線の教訓）。
- 各ステップ後に `npm test`（既存 369件green維持）と `npm run build`（成功）を必ず確認。
- 実機確認は**Vercelプレビュー**で。
- **この指示書の範囲を超えて実装しない**（§6の「やらないこと」厳守）。
- **地図連動の扇（DirectionMap / mapFan）には触らない**。扇は今のまま残す。グリッドは扇とは別物として追加するだけ。先行セッションでデグレゼロ達成した地図ナビ（現在地マーク・追っかけ線）を壊さないこと。

---

## 1. 再利用する既存ロジック（呼ぶだけ・改変禁止）

すべて `src/reverseDirection/reverseDirection.js`（※実ファイルパスは要確認）と `src/kimon/` に既にある。

| 必要なもの | どこから取るか |
|---|---|
| その時辰の8方位フル情報 | `buildReverseBoard({date, hour, purposeName})` の戻り値 `.rankings`（8要素の配列） |
| 各方位の方位名 | `rankings[i].label`（'北'…）／`.palace`（'kan'…）／`.angle`（0,45,…） |
| 各方位の点数 | `rankings[i].score`（目的ボーナス込み最終点） |
| 各方位の八門 | `rankings[i].palaceData.hachimon`（'開門'…） |
| 各方位の八神 | `rankings[i].palaceData.hasshin`（'六合'…） |
| 最大吉（ベスト）方位 | `rankings[0]`（rankingsは既にscore降順ソート済み） |
| 点数→色トーン | `getScoreTone(score)`（既存・reverseDirection.js でexport済み） |

- **重要**：`buildReverseBoard` は既に8方位フルを返している。**「本日の時間帯別ベスト」を作る `buildTimeline()` が、その `rankings` を捨てて `best`（1位）だけ取り出している**のが現状。→ §2-1 でこの捨てている `rankings` を timeline に含めるだけで、グリッドの材料が手に入る（新規計算ゼロ）。

---

## 2. 実装の中身

### 2-1. `buildTimeline()` に各時辰の全方位を含める（最小改修）

現状（`reverseDirection.js`）：
```js
export function buildTimeline({ date, purposeName, goodOnly }) {
  return TIME_SLOTS.map((slot) => {
    const result = buildReverseBoard({ date, hour: slot.hour, purposeName });
    const visible = filterGoodRankings(result.rankings, goodOnly);
    return {
      ...slot,
      best: visible[0] || null,
      rawBest: result.rankings[0] || null,
    };
  });
}
```

変更後（`rankings` 全件を追加で持たせるだけ。既存フィールドは触らない）：
```js
export function buildTimeline({ date, purposeName, goodOnly }) {
  return TIME_SLOTS.map((slot) => {
    const result = buildReverseBoard({ date, hour: slot.hour, purposeName });
    const visible = filterGoodRankings(result.rankings, goodOnly);
    return {
      ...slot,
      best: visible[0] || null,
      rawBest: result.rankings[0] || null,
      rankings: result.rankings, // ★追加：8方位フル（グリッド描画用）
    };
  });
}
```
- `goodOnly`（吉のみ表示）でフィルタするのは `best`（一覧行の表示）まで。**`rankings` は常に全8方位を持たせる**（§Q2の確定：グリッドは常に全方位＝盤の全体像）。

### 2-2. 宮→グリッド配置のマッピング（新規・小さなユーティリティ）

定位の9宮配置（北が上、時計回り）。`PALACE_DIRECTIONS` の `palace` キーで対応づける。**新規計算ではなく既存の方位対応を並べ替えるだけ**。

```
グリッド3×3（行→列）:
  [ 北西(ken)  北(kan)   北東(gon) ]
  [ 西(da)     中宮       東(shin)  ]
  [ 南西(kun)  南(ri)    南東(son) ]
```
- 中央セルは「基準点」固定表示（点数なし）。
- 各セルは rankings から該当 palace の要素を引いて描画。

### 2-3. 簡易グリッドのコンポーネント（新規）

`MiniBoardGrid`（仮名）を新規作成。props は `{ rankings }` のみ（8方位フル）。

各セルに表示：
- **方位名**（北・北東…）
- **点数**（`+100` / `-40` など、符号付き。0は `0`）
- **八門**（開門・休門…）← Mサイズなので入る
- 八神は**出さない**（一覧行に「開門・六合」が既出のため重複回避。Mサイズに八門+八神は窮屈）

色（背景）＝点数を4段階に集約：
```
score >= 40        → 大吉  背景 var(--kichi-strong) #185FA5（白文字）
0 <  score < 40    → 小吉  背景 var(--kichi-weak)   #85B7EB（濃紺文字 #0a1626）
score === 0        → 中立  背景 var(--neutral)      #6f6c5e（白文字）
score < 0          → 凶    背景 var(--kyo)          #c2554f（白文字）
```
- ※この4段階は `getScoreTone()`（great/good/weak/neutral/bad-strong/bad）の集約。great/good/weak のうち **great(≥40)=大吉、good+weak(>0)=小吉**、neutral=中立、bad系=凶、にまとめる。トーン関数は呼ぶだけで判定に使い、色集約はグリッド側で行う。
- **最大吉**（rankings[0]＝その時辰の最強）のセルは**金枠ハイライト**（`outline:2px var(--best-ring)#e6c34a` + 淡いglow）。扇の「最大吉」表現と揃える。

サイズ＝モック `grid_size_compare.html` の **`.size-M`**：
```
グリッド最大幅 215px / gap 5px / 角丸7px
方位名 11px(700) / 点数 15px(900) / 八門 8px
```
- **サイズは1箇所のCSS変数（または定数）で持たせ、後からS/SSに縮小できるようにする**（かなこ要望：「いらなければ小さくできる」）。マジックナンバー散在禁止。

### 2-4. 「本日の時間帯別ベスト」にアコーディオン展開を追加

- 各時辰の行を**タップ可能**にする。タップで、その行の直下に `MiniBoardGrid`（その時辰の `rankings`）を展開。
- **同時に開くのは1つ**（ある行を開くと他は閉じる）。モック `jiban_expand_compare_mock.html` の挙動を参照。
- 開閉状態は行タップで切替。開いている行は枠を金（`--gong`）に。
- グリッドの下に **「この盤を地図で見る →」** リンク（任意・後述§6で範囲外なら省略可）。今回は**まず展開グリッドまで**でよい。地図遷移リンクは次段階。

### 2-5. 「今の時盤」（上の扇マップ）の下に常時グリッド

- 扇マップ（DirectionMap）の**下に**、`MiniBoardGrid` を**常時表示**（トグルなし＝§Q1の確定A）。
- 渡すデータ：今の時刻の `buildReverseBoard({date:now, hour:現在時辰, purposeName})` の `.rankings`。
  - 現在時辰の算出は既存 `getTimeSlotHour(date)` を使う（自然時補正後の時刻で。既存の扇マップが使っているのと同じ now/補正ロジックを流用すること）。
- 「今の時盤」グリッドも**全8方位表示**（吉のみ表示トグルの影響を受けない）。
- 見出し：グリッド上に小さく「今の時盤（◯-◯時）」程度のラベル。

---

## 3. データの確認ポイント（実装前に報告）

実装前に以下を実コードで確認し、**現状報告してから着手**：
1. `buildReverseBoard` / `buildTimeline` の実ファイルパス（指示書では `src/reverseDirection/` 想定だが要確認）。
2. 「本日の時間帯別ベスト」を描画している**画面コンポーネント名と場所**（ここにアコーディオンを足す）。
3. 「今の時盤」の扇マップ（DirectionMap）に **now/自然時補正後の時刻** をどう渡しているか（同じ値をグリッドにも使う）。
4. `rankings[i].palaceData.hachimon` / `.hasshin` が実際に時盤で値を持つか（1時辰ぶん `console.log` で確認）。

---

## 4. 触ってよい / 触ってはいけない

### 触ってよい（新規 or 最小追加）
- **新規**：`MiniBoardGrid` コンポーネント＋そのCSS（サイズ変数で持つ）。宮→グリッド配置マップのユーティリティ。
- **最小改修**：`buildTimeline()` に `rankings` を1行追加（§2-1）。
- **追加**：時間帯ベストの画面にアコーディオン状態管理（useState）。今の時盤画面にグリッド1つ設置。
- 上記に対応するテスト。

### 触ってはいけない
- `src/kimon/` 配下のエンジン群＝**呼ぶだけ**。
- 各種CSV / `shoui_dict.json` / `purposeFilters.json` ＝**読むだけ**。
- **扇マップ（DirectionMap / mapFan）の中身**＝触らない。グリッドは扇の外に追加するだけ。`.is-fullscreen` の invalidateSize effect・現在地レイヤー（liveLayerRef）・扇レイヤー（layerGroupRef）には一切手を出さない。
- `best` / `rawBest` など `buildTimeline` の既存フィールド＝**温存**（追加のみ）。

---

## 5. テスト
- **宮→グリッド配置マップの単体テスト**：8宮が定位の正しいマス（北=上中央、北東=右上…）に入ること。中宮セルが中央であること。
- **色集約の単体テスト**：score 40→大吉 / 39→小吉 / 0→中立 / -1→凶 の4分類が正しいこと。最大吉（rankings[0]）に金枠フラグが立つこと。
- **`buildTimeline` が各 slot に `rankings`（長さ8）を含むこと**。`goodOnly=true` でも `rankings` は8件のまま（best だけ吉フィルタ）。
- 既存 **369件green維持**（エンジン・扇に触らないので壊れないはず）。

---

## 6. やらないこと（範囲外）
- scoreEngineの配点変更・エンジン改変（厳禁）。
- 扇マップ（DirectionMap/mapFan）の表示ロジック変更。
- 八神のグリッド表示（Mサイズでは八門まで。要望が出たら別段階）。
- グリッドから地図への遷移リンクの本接続（§2-4のリンクは今回プレースホルダ可。実遷移は次段階）。
- 日盤側（遠出）へのグリッド追加（今回は時盤のみ）。日盤にも将来同じものを足せる作りにはしておく（コンポーネントを時盤専用に密結合させない）。
- グリッドのサイズ最終調整（まずMで出す。S/SSはCSS変数1箇所で変えられる状態にしておけば後で即対応）。

---

## 7. 進め方
1. §3の現状確認（実ファイルパス・画面コンポーネント・now時刻の渡し方・hachimon/hasshinの実値）を**報告**してから着手。
2. `buildTimeline` に `rankings` 追加（§2-1）→ 単体テスト（§5の timeline 部分）green。
3. 宮→配置マップ＋色集約ユーティリティ＋単体テスト → green。
4. `MiniBoardGrid` 実装（Mサイズ・サイズ変数化）。
5. 時間帯ベストにアコーディオン展開（§2-4）→ build → Vercelプレビュー実機確認。
6. 今の時盤の下に常時グリッド（§2-5）→ build → 実機確認。
7. 実機確認ポイント：①各行タップでその時辰のグリッドが開く・他行は閉じる ②グリッドが定位（北上）で全8方位・点数・八門が読める ③最大吉が金枠 ④今の時盤の下にも同じグリッドが常時出る ⑤扇の地図連動（現在地マーク・追っかけ線・全画面）がデグレしていない ⑥色（大吉濃青/小吉水色/中立灰/凶赤）が和テーマと揃う。
8. PR作成（base=main）。**マージはかなこが手動**。

---

## 8. 確定仕様まとめ（迷ったらここ）
- グリッド＝**簡易プレビュー**。本物の盤は作盤タブ。
- サイズ＝**M**（`grid_size_compare.html` の .size-M）。後でS/SSに縮小可能な作りに。
- 中身＝**方位名・点数・八門**（八神なし）。
- 色＝点数4段階（大吉/小吉/中立/凶）＋最大吉に金枠。
- 時間帯ベスト＝**タップでアコーディオン展開・1つずつ**。
- 今の時盤＝**扇の下に常時グリッド**（Q1=A）。
- グリッドは**常に全8方位**（吉のみ表示の影響を受けない・Q2=A）。
- **扇は残す**（地図連動ナビとして）。グリッドは中身を読む用＝役割で使い分け。

*展開挙動の参照実装：`jiban_expand_compare_mock.html`。サイズの正解：`grid_size_compare.html` の .size-M。*
