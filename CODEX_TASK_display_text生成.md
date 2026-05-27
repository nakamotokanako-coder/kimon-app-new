# 🎯 Codex タスク：shoui_dict.json に `display_text` を131件生成して追加する

**作成**: 2026-05-24 / Claude Web（指示書フェーズ）
**実行**: Codex（kimon-app ローカル環境 `C:\dev\kimon-app`）
**対象データ**: `data/shoui_dict.json`（十干剋応81件＋格局50件＝計131件）

---

## 📨 背景・目的

象意パネル（3-D）のアコーディオン展開部の表示を、先生指示で次のように変える：

- **原文（original）は表示しない**
- **現代の読み替え（modern）＋実務での示唆（practical）を、項目に分けず連結した1段の解説にする**

ただし「ただ機械連結する」とぶつ切りで読みにくい。そこで **`display_text`** という整形済みフィールドを各エントリに新設し、modern と practical を**自然な1つの解説文**にまとめて持たせる。表示側（ShouiPanel.jsx）はこの `display_text` を出すだけにする。

---

## ✅ やること（スコープ）

1. `data/shoui_dict.json` を読み込む
2. `jukan_kokuou`（81件）と `kakkyoku`（50件）の **全エントリ**に、`display_text`（string）を追加する
3. 既存の `original` / `modern` / `practical` は**消さずにそのまま残す**（案A）
4. 整形は機械置換ではなく、**1件ずつ modern と practical の意味を読んで**、下記方針で文をまとめる
5. JSON を書き戻す（インデント2・`ensure_ascii=False` 相当でUTF-8・日本語そのまま）
6. 件数・必須キーの検証を行う（下記チェック項目）

### やらないこと
- `original` の編集・削除をしない
- `modern` / `practical` の**上書きをしない**（参照するだけ。display_text は別フィールド）
- 占断の中身（吉凶・何が起きるか・対処）を**変えない**
- 名称（name）・no・sign・color 等の判定用フィールドを触らない

---

## ✏️ 編集方針（最重要・プロ向け）

このアプリは**プロ（鑑定実務者）向け**。過剰なかみ砕きはしない。

**やること:**
- modern と practical の**つなぎ目だけ**を接続語で自然にする（ぶつ切りを直す）
- 文意・占断内容は**完全に保持**する
- 原文のトーン（**体言止め・だ/である調・簡潔さ**）を保つ
- modern と practical で**同じ語句が重複**していて冗長なら、軽く整理してよい（ただし消しすぎない）

**やらないこと:**
- 「です・ます」調に変換しない（原文が体言止めなら体言止めのまま）
- 比喩を平易な言葉に言い換えない（例「三角関係」のような専門的比喩はそのままでよい。ただし下のNo.62見本のように、文脈上整理した方が通じる場合は最小限の整理は可）
- 説明の水増し・補足の追加をしない（「いま」「〜しましょう」のような冗長語を足さない）
- 新しい情報・解釈を加えない

**一言でいうと:** 「modern と practical を、意味もトーンも変えずに、つなぎ目だけ整えて1文（1段落）にする」。

### 連結の基本ルール
- modern → practical の順でつなぐ
- modern の末尾と practical の先頭を、接続語（「〜なので、」「〜ため、」「〜で、」等）または読点で自然につなぐ。不自然なら2文に分けたままでもよい（無理に1文にしない）
- 句点「。」の連続でぶつ切りに見える箇所をなめらかにする
- 全体で1つの解説テキスト（改行なしの string）にする

---

## 📐 見本（この仕上がりを目標にする）

### 見本1：No.1「日奇伏吟」（△・中立）
- modern: `動こうとしても動けない停滞期。上層部や有力者へのアプローチは響かず、新たな名声を狙うのも空振りに終わりやすい。`
- practical: `現状維持と内部整理に専念する時期。立場をわきまえて目立たぬ振る舞いが安全策。`
- **display_text（目標）**:
  `動こうとしても動けない停滞期。上層部や有力者へのアプローチは響かず、新たな名声を狙うのも空振りに終わりやすい。現状維持と内部整理に専念する時期で、立場をわきまえて目立たぬ振る舞いが安全策。`

→ ほぼ原文のまま。practical の頭「現状維持と内部整理に専念する時期。」を「〜時期で、」に変えて次へつなげただけ。**かみ砕かない。**

### 見本2：No.62「凶蛇入獄」（×・凶）
- modern: `三角関係のような複雑な利害が絡む配置。争いごとは負け、先に動くほど筋が通らなくなる。`
- practical: `自分から仕掛けるのは不利。係争・交渉は先手を打たず、第三者を立てて筋を通す。三者間の利害が絡む案件は慎重に。`
- **display_text（目標）**:
  `三者の利害が複雑に絡む配置。争いごとは負け、先に動くほど筋が通らなくなる。自分から仕掛けるのは不利なので、係争・交渉は先手を打たず、第三者を立てて筋を通す。三者間の利害が絡む案件は慎重に。`

→ modern 冒頭「三角関係のような複雑な利害が絡む」を「三者の利害が複雑に絡む」と最小限に整理（後続の「三者間の利害」と語をそろえる）。modern末尾とpractical頭を「不利なので、」でつなぐ。です・ます化しない。体言止め温存。

---

## 📦 入出力仕様

### 入力
`data/shoui_dict.json`。構造（抜粋）:
```jsonc
{
  "meta": { "jukan_count": 81, "kakkyoku_count": 50, ... },
  "jukan_kokuou": [
    { "no":1, "name":"日奇伏吟", "sign":"△", "kikkyo":"中立", "color":"yellow",
      "kikkyo_text":"中立/条件付き", "original":"…", "modern":"…", "practical":"…" }
    // …81件
  ],
  "kakkyoku": [
    { "no":1, "name":"青龍返首", "original":"…", "modern":"…", "practical":"…" }
    // …50件
  ],
  "jukan_index_by_name": { ... },
  "kakkyoku_index_by_name": { ... }
}
```

### 出力
同じ `data/shoui_dict.json` を上書き保存。各 `jukan_kokuou[*]` と `kakkyoku[*]` に `display_text`（string）を追加した状態。
- フィールド順は任意だが、可読性のため practical の直後に display_text を置くと良い
- それ以外のフィールド・キー順・meta は変更しない
- UTF-8・日本語をエスケープしない（`\u…`にしない）・インデント2スペース

---

## 🔍 チェック項目（実行後に検証）

- [ ] `jukan_kokuou` が **81件**、`kakkyoku` が **50件**（件数不変）
- [ ] 全131エントリに `display_text` が存在し、空文字でない
- [ ] `original` / `modern` / `practical` が**全件で変更されていない**（diff で modern/practical/original に変更が出ないこと）
- [ ] `name` / `no` / `sign` / `color` / `kikkyo` 等の判定系フィールドが不変
- [ ] `jukan_index_by_name` / `kakkyoku_index_by_name` / `meta` が不変（※meta は任意で `display_text` 生成日を note に足す程度なら可、判定値は触らない）
- [ ] display_text に改行（\n）が含まれていない（1段の string）
- [ ] No.1・No.62 が上記見本どおりの仕上がりになっている

### 検証スクリプト例（参考）
```python
import json
d = json.load(open('data/shoui_dict.json', encoding='utf-8'))
assert len(d['jukan_kokuou']) == 81
assert len(d['kakkyoku']) == 50
for e in d['jukan_kokuou'] + d['kakkyoku']:
    assert e.get('display_text'), f"missing display_text: {e.get('no')} {e.get('name')}"
    assert '\n' not in e['display_text']
print('OK: all 131 have display_text')
```

---

## 📌 完了条件

1. `data/shoui_dict.json` の全131エントリに `display_text` が入っている
2. original/modern/practical/判定系フィールドが無変更（diff確認）
3. 検証スクリプトが OK
4. 変更を commit（例: `feat(shoui): add display_text to all 131 entries`）

---

## 🔭 このあと（参考・別タスク）

`ShouiPanel.jsx` 側の改修は別途行う：
- アコーディオン展開部で original を出さず、`entry.display_text` を1段で表示するだけにする
- 色分け（吉青/中立黄/凶赤、格局は kakkyoku.json の kichi_kyo）は従来どおり
（→ display_text が入った後にこの表示改修をやれば、実行時の機械連結ロジックは不要になる）
