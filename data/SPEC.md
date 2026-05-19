# 奇門遁甲Webアプリ 仕様書 v3 LITE

## 0. プロジェクト概要

日本語で毎日・毎時間チェックできる本格的な奇門遁甲Webアプリ。
**◯◯先生（流派監修・共同開発）と一緒に開発**。

**スタック**: 純HTML/CSS/JS 単一ファイル → GitHub → Vercel（命名鑑定書アプリと同じデプロイ流）。

---

## 🆕 v3 LITE版の特徴

プロジェクトナレッジに乗せられるサイズに最適化した軽量版（合計1MB）。

| 変更点 | v2 → v3 LITE |
|---|---|
| 暦DBサイズ | 12.4MB JSON → **713KB CSV** |
| 期間 | 1900-2044（144年）→ **2020-2044（24年）** |
| 必須列のみ | 全49項目 → 13項目に絞り |
| 完全展開盤 | 1.2MB JSON → **313KB CSV** |
| 形式 | gzip → **テキストCSV** |

期間を後で延ばす場合、元エクセル「奇門遁甲Pro5_5.xlsx」から再抽出可能。

---

## 1. ファイル構成

| ファイル | サイズ | 役割 |
|---|---|---|
| `koyomi.csv` | 713KB | 万年暦（2020-2044の24年分、13列） |
| `chito_ase_to_namida.csv` | 313KB | 1080パターンの完全展開盤テーブル（先生提供） |
| `kimon_tables.json` | 6.3KB | 紫白星9パターン（年・月・日盤の紫白星表示用） |
| `test_case_2025-12-05.json` | 8KB | エクセル正解値（年盤・月盤・日盤の3盤） |
| `SPEC.md` | - | この仕様書 |
| `README.md` | - | クイックスタート |

## 2. データソース

### 2.1 `koyomi.csv` 暦データ

CSV列（13項目）:

| 列名 | 例 | 意味 |
|---|---|---|
| date | 2025-12-05 | 日付 |
| eto_year | 乙巳 | 年干支 |
| eto_month | 丁亥 | 月干支 |
| eto_day | 戊申 | 日干支 |
| kyusei_year | 二黒土星 | 年九星 |
| kyusei_month | 二 | 月九星 |
| kyusei_day | 七 | 日九星 |
| inton_youton | 陰 | 陰遁/陽遁 |
| day_kyokusu2 | 陰7局 | 日盤局数 |
| month_kyokusu | 陰7局 | 月盤局数 |
| time_kyokusu | 陰2局 | 時盤局数 |
| sangen | 下元 | 三元（上元/中元/下元） |
| sekki24_2 | 小雪 | 二十四節気 |

JSで読む場合は PapaParse 推奨：

```js
import Papa from 'papaparse';
const csv = await fetch('./koyomi.csv').then(r => r.text());
const { data } = Papa.parse(csv, { header: true });
const koyomi = Object.fromEntries(data.map(r => [r.date, r]));
// → koyomi['2025-12-05'] で当日のデータが取れる
```

### 2.2 `chito_ase_to_namida.csv` 完全展開盤テーブル 🆕

**先生提供の流派固有データ。1080パターン全展開済み。**

CSV列構造:

| 列名パターン | 内容 |
|---|---|
| `key` | 局数+干支（例：陰7局戊申） |
| `junshu` | 旬首（戊/己/庚/辛/壬/癸のいずれか） |
| `tenban_junshu_palace` | 天盤旬首の宮（坎/艮/震/巽/離/坤/兌/乾/中） |
| `chiban_junshu_palace` | 地盤旬首の宮 |
| `chokufu` | 直符（天盤星：天蓬/天任/天衝/天輔/天英/天芮/天柱/天心） |
| `chokushi` | 直使（八門：休門/生門/傷門/杜門/景門/死門/驚門/開門） |
| `futatsu_no_tokoro` | 旬首が中宮にある場合の「2つの値が入る宮」 |
| `p1_tenban_kan`〜`p9_tenban_kan` | 各宮の天盤干（中宮p5は無し） |
| `p1_chiban_kan`〜`p9_chiban_kan` | 各宮の地盤干 |
| `p1_hasshin`〜 | 各宮の八神 |
| `p1_hachimon`〜 | 各宮の八門 |
| `p1_kyusei`〜 | 各宮の九星（天盤星） |
| `p1_tenban_kan2`〜 | 中宮処理用の2つ目の天盤干（通常は空） |
| `p5_chiban_kan` / `p5_chiban_kan2` | 中宮の地盤干（2つ目は中宮処理用） |

JSで読む場合：

```js
import Papa from 'papaparse';
const csv = await fetch('./chito_ase_to_namida.csv').then(r => r.text());
const { data } = Papa.parse(csv, { header: true });
const banTable = Object.fromEntries(data.map(r => [r.key, r]));
// → banTable['陰7局戊申'] で盤データ取得
```

### 2.3 中宮処理について

奇門遁甲では旬首が中宮に入ると特殊配置になる：
- `futatsu_no_tokoro`: 「2つの値が入る宮」を示す（例：「艮」）
- `p?_tenban_kan2`: その宮のもう1つの天盤干（通常時は空文字）
- `p5_chiban_kan2`: 中宮の2つ目の地盤干

通常はこれらの2系列フィールドは空。**旬首が中宮にある特殊ケースのみ**値が入る。
UI実装時は値があるときだけ第2要素を表示すればOK。

## 3. 盤の構造

3×3グリッドの9宮、標準洛書順：

```
┌────┬────┬────┐
│ 巽4│ 離9│ 坤2│
├────┼────┼────┤
│ 震3│ 中5│ 兌7│
├────┼────┼────┤
│ 艮8│ 坎1│ 乾6│
└────┴────┴────┘
```

宮番号: 1=坎(北), 2=坤(南西), 3=震(東), 4=巽(南東), 5=中宮, 6=乾(北西), 7=兌(西), 8=艮(北東), 9=離(南)

各宮セルに乗せる要素：天盤干・八神・天盤星・地盤干・八門・紫白星・吉凶判定（中宮は地盤干のみ）。

## 4. 計算ロジック（盤組立エンジン）

### 4.1 入力

```js
{
  date: "2025-12-05",
  hour: 6,
  boardType: "日"  // "年" | "月" | "日" | "時"
}
```

### 4.2 ステップ

```
[1] 暦DBルックアップ → 局数・干支を取得
    koyomi["2025-12-05"] → { day_kyokusu2: "陰7局", eto_day: "戊申", ... }

[2] 局数+干支キー組立
    年盤 → year_kyokusu + eto_year   ※年盤局数は別途確認要
    月盤 → month_kyokusu + eto_month
    日盤 → day_kyokusu2 + eto_day
    時盤 → time_kyokusu + 時干支（要計算）

[3] 完全展開盤テーブル lookup
    board = banTable[`${kyokusu}${eto}`]
    → 盤の全要素が一発で取れる

[4] 紫白星の付与（年・月・日盤のみ）
    main_kyusei = koyomi.kyusei_(year|month|day)
    各宮の紫白星 = kimon_tables.shisei_9pattern[main_kyusei][palace_num]

[5] レンダリング
```

### 4.3 出力

```js
{
  meta: { date, hour, boardType, kyokusu, eto, sangen,
          chokufu, chokushi, junshu, futatsu_no_tokoro },
  palaces: {
    1: {tenban_kan, chiban_kan, hasshin, hachimon, kyusei,
        shisei, tenban_kan2, kikkyo},
    ...
  }
}
```

## 5. テスト方針（TDD）

### 5.1 期待値ファイル

`test_case_2025-12-05.json` の `boards.日盤` と完全一致するまで実装。

### 5.2 検証順位

```
P1: chito_ase_to_namida からの lookup が正しく動くか
P2: test_case の3盤と完全一致するか（年・月・日）
P3: 紫白星の付与
P4: 吉凶判定（Dフェーズ）
```

## 6. 実装手順（v3推奨）

```
Step 1: PapaParse で koyomi.csv / chito_ase_to_namida.csv を読み込み
Step 2: lookupKoyomi(date) 関数（dateをキーにO(1)アクセス）
Step 3: buildBoard({date, boardType}) 関数
Step 4: テスト1: 日盤が test_case と一致するか
Step 5: 月盤・年盤も同じテストで通す
Step 6: 紫白星の追加付与
Step 7: 時盤対応（時干支の計算ロジック追加）
Step 8: 吉凶判定（Dフェーズ）
```

## 7. 注意点

- **流派の絶対基準**: 共同開発者の◯◯先生提供のデータが真実。理論計算とズレた場合は先生のデータ優先。
- **「天衝」と「天冲」**: 同字異体。検証時はどちらかに正規化推奨。
- **時盤の時干支計算**: 「血と汗と涙の暦」のキーには時干支が必要。日干支から五子元遁により時干支を導出するロジックは要実装（or 暦DBに含めて頂くよう先生に追加依頼）。
- **十干剋テーブル**: 吉凶判定の元データは元エクセルの「十干剋」シート（88行）にある。Dフェーズで抽出予定。
- **クレジット表記**: UI/READMEに「共同開発：◯◯先生」「暦データ：◯◯先生提供」を必ず明記。
- **期間延長**: 2020-2044の24年分なので、それより前の鑑定や2044/2/1以降の予測は元エクセルから再抽出が必要。

## 8. 参考：これまでの経緯

- A. 暦DBのJSON化実証 ✅
- B. 配置テーブル抽出 ✅
- B+. 「血と汗と涙の暦」（先生提供）取得→1080パターン完全展開 ✅
- v3 LITE: プロジェクトナレッジ用に軽量化（合計1MB） ✅
- C: 盤組立エンジン実装 ← 今ここ

---

**作成日**: 2025-12-05  
**v3 LITE更新**: プロジェクトナレッジ用の軽量CSV版  
**作成元**: Claude Web（Anthropic）  
**移行先**: Claude Code（Windows、命名鑑定書アプリと並行運用）  
**監修・共同開発**: ◯◯先生
