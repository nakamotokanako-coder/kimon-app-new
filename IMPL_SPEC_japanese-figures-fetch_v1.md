# IMPL_SPEC_japanese-figures-fetch_v1.md

太占数霊 鑑定研究用 — 日本の著名人・偉人データ大規模取得スクリプト v1
（旧 `IMPL_SPEC_celebrity-fetch_v1.md` の後継・拡張版）

---

## 🎯 目的

太占数霊の流派ルール検証のため、Wikidata から **日本の著名人＋偉人** の氏名・生年月日・性別を **3500件以上** 取得して CSV 出力する。

**2層構造**で取得：
- **メイン層**：明治以降生まれ（数霊計算が完全に確実）
- **サブ層**：江戸以前生まれで「年月日」が揃ってる人（武将・幕末志士・初期実業家など、暦の注意付き）

旧 `celebrity-fetch_v1` は廃止せず参考として残置するが、**新規実装はこの v1 を採用する**。

---

## 📂 配置

```
meimei-kantei/
├── scripts/
│   ├── verify-search-v2.mjs              # 既存
│   └── fetch-japanese-figures.py         # 新規
└── data/
    └── japanese_figures_YYYYMMDD.csv     # 出力先
```

---

## 🎭 対象ジャンル一覧

国籍：日本（Wikidata `Q17`）。以下の職業（`P106`）の OR で取得。

### 既存：芸能・スポーツ・創作系（celebrity-fetch v1 から継承）

| ジャンル | Wikidata QID | カテゴリタグ |
|---|---|---|
| 俳優 | Q33999 | entertainer |
| 映画俳優 | Q10800557 | entertainer |
| 舞台俳優 | Q3282637 | entertainer |
| テレビ俳優 | Q10798782 | entertainer |
| 声優 | Q2405480 | entertainer |
| 歌手 | Q177220 | entertainer |
| シンガーソングライター | Q488205 | entertainer |
| ミュージシャン | Q639669 | entertainer |
| アイドル | Q15295720 | entertainer |
| お笑い芸人 | Q806798 | entertainer |
| モデル | Q4610556 | entertainer |
| タレント | Q21195422 | entertainer |
| YouTuber | Q17125263 | entertainer |
| サッカー選手 | Q937857 | athlete |
| 野球選手 | Q10871364 | athlete |
| プロレスラー | Q13474373 | athlete |
| 格闘家 | Q11338576 | athlete |
| 作家 | Q36180 | creator |
| 漫画家 | Q1114448 | creator |
| 小説家 | Q6625963 | creator |
| 映画監督 | Q2526255 | creator |

### 新規追加：偉人系（6グループ）

| ジャンル | Wikidata QID | カテゴリタグ | 備考 |
|---|---|---|---|
| 実業家・経営者 | Q43845 | business | businessperson |
| 起業家 | Q1075651 | business | entrepreneur |
| CEO | Q484876 | business | chief executive officer |
| 政治家 | Q82955 | politics | politician |
| 政府の長 | Q372436 | politics | head of government |
| 国家元首 | Q14705 | politics | statesperson |
| 科学者 | Q901 | academic | scientist |
| 数学者 | Q170790 | academic | mathematician |
| 物理学者 | Q169470 | academic | physicist |
| 化学者 | Q593644 | academic | chemist |
| 生物学者 | Q864503 | academic | biologist |
| 研究者 | Q205375 | academic | researcher |
| 大学教員 | Q1622272 | academic | university teacher |
| 医師 | Q39631 | academic | physician |
| 発明家 | Q205375 | inventor | ⚠️ 正確なQIDを実装時に再確認 |
| エンジニア | Q5482740 | inventor | engineer |
| 武士 | Q183571 | samurai | samurai（江戸以前メイン） |
| 武将 | Q14773 | samurai | warlord |
| 軍人 | Q108159 | samurai | military officer |
| 哲学者 | Q5152 | religious | philosopher |
| 神学者 | Q1234713 | religious | theologian |
| 宗教指導者 | Q4504549 | religious | religious leader |
| 宗教家 | Q1399869 | religious | religious figure |
| 宗教の創始者 | Q11774202 | religious | founder of a religion |

**⚠️ 実装注意**：Wikidata の QID は時々変動するため、各 QID は **実装前に Wikidata Query Service で生存確認** すること。特に `inventor` の QID は要確認。

---

## 🔱 2層構造の取得戦略

### メイン層（modern）
- **対象**：`birthDate >= 1868-01-01`（明治元年以降）
- **要件**：年月日完全（日まで揃ってる）
- **数霊計算**：そのまま使える
- **想定件数**：3000〜4500件

### サブ層（edo_or_before）
- **対象**：`birthDate < 1868-01-01` かつ年月日完全
- **要件**：DAY(birthDate) is not null（「天文11年12月頃」みたいな曖昧表記はスキップ）
- **数霊計算**：要注意（旧暦/新暦混在）
- **想定件数**：500〜1000件
- 武士・武将・幕末志士・初期実業家（渋沢栄一など）が中心

### SPARQL クエリの基本形（メイン層）

```sparql
SELECT DISTINCT ?person ?personLabel ?birthDate ?genderLabel ?nativeName
       (GROUP_CONCAT(DISTINCT ?occupationLabel; separator=", ") AS ?occupations)
WHERE {
  ?person wdt:P27 wd:Q17.        # 日本国籍
  ?person wdt:P569 ?birthDate.   # 生年月日
  ?person wdt:P21 ?gender.       # 性別
  ?person wdt:P106 ?occupation.  # 職業

  VALUES ?occupation {
    # グループごとに切る（タイムアウト対策）
    wd:Q33999 wd:Q10800557 wd:Q3282637 wd:Q10798782 wd:Q2405480
  }

  OPTIONAL { ?person wdt:P1559 ?nativeName. }  # ネイティブネーム（漢字本名）

  ?occupation rdfs:label ?occupationLabel.
  FILTER(LANG(?occupationLabel) = "ja")

  # メイン層フィルタ
  FILTER(?birthDate >= "1868-01-01T00:00:00Z"^^xsd:dateTime)

  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". }
}
GROUP BY ?person ?personLabel ?birthDate ?genderLabel ?nativeName
LIMIT 2000
```

### サブ層クエリ（江戸以前）

```sparql
# 上記の FILTER 部分を以下に置換
FILTER(?birthDate < "1868-01-01T00:00:00Z"^^xsd:dateTime)
# 日まで揃ってる人だけ取る（precision = 11 が day レベル）
?person p:P569 ?statement.
?statement psv:P569 ?birthValue.
?birthValue wikibase:timePrecision ?precision.
FILTER(?precision >= 11)
```

---

## 🪓 姓名分割ルール（celebrity-fetch v1 から継承）

1. **半角スペース or 全角スペース区切り** がある → `sei` / `mei` に分割
2. **「・」区切り**（外国人カナ表記） → 分割するが、`needs_review = true`
3. **スペースなし** → `sei = ""`, `mei = フルネーム`、`needs_review = true`
4. **`nativeName`（P1559）が取れたら優先**：漢字本名があれば、それを姓名分割の主データに使う

`nativeName` を取れることで、芸名と本名の混在問題が緩和される。

---

## 📊 出力フォーマット（CSV）

ファイル名：`data/japanese_figures_YYYYMMDD.csv`

| 列 | 内容 | 例 |
|---|---|---|
| wikidata_id | Wikidata QID（重複排除キー） | Q123456 |
| full_name | フルネーム（表示用） | 渋沢 栄一 |
| sei | 姓 | 渋沢 |
| mei | 名 | 栄一 |
| native_name | 漢字本名（P1559 から） | 渋澤 榮一 |
| birthDate | 生年月日 (YYYY-MM-DD) | 1840-03-16 |
| gender | M / F / その他 | M |
| occupations | 職業（カンマ区切り） | 実業家, 政治家 |
| genre_category | 主カテゴリタグ | business |
| era_certainty | `modern` or `edo_or_before` | edo_or_before |
| needs_review | 姓名分割で要確認なら true | false |

エンコード：UTF-8 BOM 付き（Excel 対応）

---

## ⚠️ 暦に関する注意（重要）

太占数霊は **和暦準拠**。明治改暦（1872年12月3日が明治6年1月1日）の前後でデータの扱いが変わる：

- **明治6年（1873年）以降**：新暦＝グレゴリオ暦。Wikidata の生年月日そのまま和暦変換可能
- **明治改暦以前**：旧暦と新暦が混在。Wikidata のデータも新暦換算/旧暦そのままが混在

サブ層（江戸以前）のデータは `era_certainty = "edo_or_before"` フラグを立てて、**ぶりちゃんが鑑定研究ツールに投入する前に判断できる**ようにする。

CSV を Excel/Google Sheets で開いた時、`era_certainty` 列でフィルタすればメイン層だけ抜き出せる構造。

---

## ✅ 完了条件

1. **合計3500件以上**取得（メイン3000+ / サブ500+）
2. CSV が UTF-8 BOM 付き、Excel で文字化けなし
3. `needs_review = false` の行が全体の70%以上（姓名分割成功）
4. ジャンル別 × 時代別の取得件数サマリーをコンソール出力
5. 再実行で同じ結果が再現できる（冪等性）
6. **代表例の動作確認**：以下5人が CSV に含まれていること
   - 松下幸之助 (1894-11-27, modern, business)
   - 渋沢栄一 (1840-03-16, edo_or_before, business)
   - 稲盛和夫 (1932-01-30, modern, business)
   - 坂本龍馬 (1836-01-03, edo_or_before, samurai)
   - 湯川秀樹 (1907-01-23, modern, academic)

### サマリー出力例

```
取得結果サマリー
==================
【メイン層（明治以降）】
  芸能・スポーツ系:   1842件
  創作系:              321件
  実業家・経営者:      289件
  政治家:              412件
  学術・研究:          567件
  発明・技術:           98件
  宗教・思想:          134件
  ----
  小計:               3663件

【サブ層（江戸以前・要注意）】
  武士・武将:          412件
  幕末志士:            128件（武士/政治家として）
  初期実業家:           67件
  宗教家:               48件
  ----
  小計:                655件

------------------
合計ユニーク件数:    4318件
姓名分割成功:        3402件 (78.8%)
nativeName 取得:    2456件 (56.9%)
要確認:              916件
出力ファイル: data/japanese_figures_20260519.csv
```

---

## 🛠 実装言語

- **Python**（推奨）：`requests` + `pandas`
- **Node.js** でも可

codex / Claude Code 側で環境確認してから選択。

### 依存パッケージ

#### Python
```bash
pip install requests pandas
```

#### Node.js
```bash
npm install --save-dev node-fetch papaparse
```

---

## 📦 実装手順

1. **QID の生存確認**：仕様書に列挙した QID が今も有効か Wikidata Query Service で軽くテスト
2. **エンドポイント設定**：`https://query.wikidata.org/sparql`
3. **User-Agent ヘッダー設定**：`太占数霊-research/1.0 (https://github.com/nakamotokanako-coder/meimei-kantei)`
4. **メイン層クエリ**（5グループに分割）
5. **サブ層クエリ**（江戸以前、precision フィルタ付き）
6. **結果結合・ユニーク化**（wikidata_id ベース）
7. **姓名分割処理**（native_name を優先、なければ full_name）
8. **CSV 出力**（UTF-8 BOM 付き、`io.open` with `encoding='utf-8-sig'`）
9. **サマリー出力**

レート制限：1リクエスト/秒以上空ける。

---

## 🔄 取得後の流れ

1. `data/japanese_figures_YYYYMMDD.csv` を Google Sheets で開く
2. `era_certainty = modern` でフィルタしてメイン層だけ抜く（最初の検証はこれで）
3. `needs_review = true` の行を手動修正（姓名分割の補正）
4. 鑑定研究ツール（`research/index.html`）に CSV/TSV ペーストで投入（Phase 2 で対応）
5. タグ自動付与 → フィルタ・統計で傾向検証
6. 余裕があれば `era_certainty = edo_or_before` 層も同様に検証（暦の注意を念頭に）

---

## 📝 旧仕様書からの主な変更点

| 項目 | celebrity-fetch v1 | japanese-figures-fetch v1（本仕様書） |
|---|---|---|
| 対象 | 芸能・スポーツ・創作系のみ | 上記＋偉人系6グループ追加 |
| 時代範囲 | 言及なし（実質全期間） | 2層構造（modern + edo_or_before） |
| 取得件数 | 1000件以上 | 3500件以上 |
| native_name | なし | P1559 で漢字本名も取得 |
| CSV列 | 8列 | 11列（era_certainty, genre_category, native_name 追加） |

---

**作成**: 2026年5月19日（Claude.ai 側）
**実装**: codex / Claude Code
**前提**: 鑑定研究ツール v1（IMPL_SPEC_research-tool_v1.md）と並行 or 先行で進める
**廃止**: `IMPL_SPEC_celebrity-fetch_v1.md` は参考として残置するが、実装はこの v1 を採用
