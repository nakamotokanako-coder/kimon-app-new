# 🎯 Codex タスク：ShouiPanel.jsx を display_text 1段表示に改修（3-D 象意パネル表示修正）

**作成**: 2026-05-24 / Claude Web（指示書フェーズ）
**実行**: Codex（kimon-app ローカル環境 `C:\dev\kimon-app`）
**対象**: `src/components/ShouiPanel.jsx`
**前提**: `data/shoui_dict.json` の全131件に `display_text` を追加済み（コミット 20e4d3d）。本タスクはその表示反映。

---

## 📨 背景

先生指示（2026-05-24）で象意パネルのアコーディオン展開部の表示を変更する：

- **原文（original）は表示しない**
- **現代の読み替え＋実務での示唆を、項目に分けず連結した1段の解説にする**

→ この連結済みテキストはすでに `display_text` フィールドとして data に持たせてある（前タスクで生成済み）。
本タスクは ShouiPanel.jsx 側を「**display_text を1段で表示するだけ**」に直す。実行時の機械連結は不要。

---

## ✅ 変更点（これだけ）

### アコーディオン展開部（開いたときの中身）
**現状**: original →（または modern → practical の）3段表示になっている想定
**変更後**: **`entry.display_text` を1段だけ表示**する

- `original` は表示しない（取得もしなくてよい）
- `modern` / `practical` を個別に表示していた箇所を削除
- 代わりに `display_text` を1つの段落として表示

### フォールバック（保険）
- 万一 `display_text` が空/未定義のエントリがあった場合のみ、`modern` と `practical` を連結して表示する
- 例:
  ```js
  const text = entry?.display_text
    || [entry?.modern, entry?.practical].filter(Boolean).join("　");
  ```
  （131件すべて display_text 入りを確認済みなので通常は使われないが、安全のため）

---

## 🔒 維持する（変えない）

- 表のカラム構成：**宮・方位・八門・十干剋応・格局・点数**
- アコーディオンの開閉挙動：**初期は全閉**（クリックで開く）
- 色分け：
  - 十干剋応＝ sign（〇△×）→ 吉青(`shoui-kichi`)/中立黄(`shoui-chu`)/凶赤(`shoui-kyo`)
  - 格局＝ `kakkyoku.json` の kichi_kyo → 吉青/凶赤
- 名称引きヘルパー（getJukanShoui / getKakkyokuShoui 等）：そのまま流用
  - 同名複数（華蓋蓬星[9,73]/華蓋孛師[18,74]/凶蛇入獄[62,68]）は no で引き分ける既存ロジックを維持
- import パス・className・既存プロパティ名：現状のものを尊重（推測で変えない）

---

## 🔍 チェック項目（実行後）

- [ ] アコーディオンを開くと **display_text（1段）だけ** が出る。原文/読み替え/示唆の3段見出しが出ない
- [ ] No.62「凶蛇入獄」を開くと「三者の利害が複雑に絡む配置。…三者間の利害が絡む案件は慎重に。」が1段で出る
- [ ] No.1「日奇伏吟」を開くと「動こうとしても動けない停滞期。…目立たぬ振る舞いが安全策。」が1段で出る
- [ ] 表のカラム（宮・方位・八門・十干剋応・格局・点数）が従来どおり
- [ ] 色分け（吉青/中立黄/凶赤、格局は青赤）が従来どおり付く
- [ ] アコーディオン初期全閉が維持されている
- [ ] 同名3種が no で正しく引き分けられている（表示内容が混ざらない）
- [ ] `npm test` 全 green（326件維持）
- [ ] `npm run dev` で UI 目視確認 → OK

---

## 📌 完了条件

1. アコーディオン展開部が display_text 1段表示になっている
2. 表・色分け・開閉挙動・名称引きが維持されている
3. npm test 全green / npm run dev で表示OK
4. commit（例: `feat(shoui): show display_text in accordion (single block)`）
5. PR → マージ

---

## 🗂️ 参考：表示部のイメージ（既存構造に合わせて当てる）

```jsx
{open && (
  <div className="shoui-acc-body">
    {/* 先生指示：原文は出さず、display_text を1段で表示 */}
    <p className="shoui-text">
      {entry.display_text
        || [entry.modern, entry.practical].filter(Boolean).join("　")}
    </p>
  </div>
)}
```
※ 上は構造イメージ。実際の変数名（entry の取得元）・className は現状の ShouiPanel.jsx に合わせること。

---

## 🔭 このあと（参考）

- 3-G（期間検索・方位フィルター）：chito_v2.csv 活用。別タスク
- 3-B 評価ランク「◎◎効果最大」昇格：is_junri を最優先キーに。Q2/Q4 先生確認待ち
- phase-3f 混入クリーンアップ（先生著作物含む）：別途
