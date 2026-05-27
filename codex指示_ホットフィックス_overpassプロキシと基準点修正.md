# Codex指示（ホットフィックス）：Overpassを自前プロキシ化＋基準点検索の遠隔地バグ修正

> 緊急度：高。前回ホットフィックス(PR #23, cee6ac8)の続き。
> 背景：公共Overpassをブラウザから直接叩く方式は、本番/プレビューで全滅した（下記ログ）。サーバー側プロキシに作り替えて根治する。あわせて基準点設定窓の遠隔地バグも直す。
> PR #23（CORSフォールバック）は**マージしない**。本ホットフィックスで方式ごと差し替える。#23のブランチ(hotfix-map-search)から続けて作業してよいし、main から新ブランチでもよい（§4参照）。

---

## 0. 何が起きているか（プレビューConsoleで確定）

施設検索すると、3つのフォールバック先が全滅：
```
overpass.kumi.systems      → 504 Gateway Timeout（たまにCORS拒否）
maps.mail.ru/.../overpass   → 403 Forbidden（地域拒否）
overpass.private.coffee     → 504 Gateway Timeout（たまにCORS拒否）
```
→ 全部順に試して全滅するため「非常に遅く、最終的に0件」。データ量の問題ではなく**サーバー応答の問題**。

結論：**公共Overpassをブラウザ(クライアント)から直接fetchする方式をやめる**。CORS・地域拒否・タイムアウトはこの方式の構造的弱点。

---

## 1. 修正① Overpassをサーバー側プロキシ経由にする（根治・最重要）

### 1-1. 方針
Vercelの **Serverless Function（API Route）** を1つ追加し、アプリはそのプロキシだけを叩く。
- アプリ → `/api/overpass`（同一オリジン）→（サーバー側で）Overpass本家 → 結果を返す。
- **CORSは原理的に発生しない**（同一オリジンへのリクエストだから）。
- **CORSはブラウザの制約**なので、サーバー側からなら `overpass-api.de`（本家・最も安定）をそのまま使える。

### 1-2. プロキシ関数（新規）
- 配置：このリポはVite+React。Vercelの Functions として **`/api/overpass.js`**（リポジトリ直下の `api/` フォルダ）を新規作成。
  - ※ViteプロジェクトでもVercelは `api/` 配下を自動的にServerless Functionとして扱う。フレームワーク設定変更は不要。
- 実装要点：
  - POSTで受けたOverpQL（リクエストボディ）を、サーバー側から **`https://overpass-api.de/api/interpreter`** にPOSTで転送。
  - サーバー側fetchのヘッダは `Content-Type: text/plain; charset=UTF-8`、bodyは受け取った生クエリ。
  - タイムアウト制御：サーバー側で **8秒**で打ち切り（AbortController）。本家が遅いとき即座に諦めて502を返す。
  - 本家が失敗したらサーバー側で1回だけ `https://overpass.kumi.systems/api/interpreter` にリトライ（サーバー側なのでCORSは無関係。生きてれば拾える）。
  - 成功時：OverpassのJSONをそのまま `application/json` で返す。
  - 失敗時：`res.status(502).json({error:'overpass upstream failed'})`。
  - レスポンスに `Cache-Control: s-maxage=300`（同じ範囲の再検索を5分キャッシュ＝体感速度UP・上流負荷減）。

```js
// api/overpass.js（イメージ。実際のVercel Function形式に合わせる）
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const query = typeof req.body === 'string' ? req.body : (req.body?.data || '');
  const UPSTREAMS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  for (const url of UPSTREAMS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
        body: query,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) continue;
      const json = await r.json();
      res.setHeader('Cache-Control', 's-maxage=300');
      return res.status(200).json(json);
    } catch (e) { clearTimeout(t); /* 次の上流へ */ }
  }
  return res.status(502).json({ error: 'overpass upstream failed' });
}
```

### 1-3. クライアント側（mapSearch.js）の差し替え
- 前回入れた `OVERPASS_ENDPOINTS` 配列＋クライアント側フォールバックを**削除**。
- Overpass呼び出しを **`fetch('/api/overpass', {method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'}, body: query})`** に一本化。
- bbox生成・KEYMAP・`out center`・件数上限・結果パース・方位判定・ピン色・一覧は**変更しない**。
- 失敗時（502等）は既存の失敗メッセージを出す。

### 1-4. 体感速度の手当て（「サクッと出てほしい」への対応）
- 検索実行中は**ローディング表示**を明確に（「探しています…」のスピナー/文言）。多重実行はブロック（実行中は再検索しない）。
- Overpassクエリに `[timeout:15]` を付け、`out center 60;` で件数を絞る（既に絞っているなら維持）。
- ※プロキシ側8秒打ち切り＋キャッシュで、全滅待ちの数十秒は無くなる想定。

---

## 2. 修正② 基準点設定の「川口駅→北海道根室」遠隔地バグ

### 2-1. 症状
画面上部の**基準点設定の窓**（「現在地」ボタンの下、地域プルダウン横の検索窓）に「川口駅」と入れると、基準点が**北海道根室市川口**（経度145.36）になる。基準点を関東の現在地にした後でも同じ。

### 2-2. 原因
基準点設定の住所検索が、国土地理院APIの**先頭候補をそのまま採用**している。前回の修正B（近い候補を選ぶ）は地図内検索の住所ジャンプにしか入れておらず、**基準点設定窓には適用されていなかった**（指示の取り違え）。

### 2-3. 修正
- 基準点設定窓の住所検索も、**現在の基準点（または取得済みの現在地/直前の基準点）に最も近い候補を選ぶ**ロジックを通す。前回の `pickNearest(candidates, home)` を共用する。
- 基準点がまだ一度も定まっていない初回のみ先頭候補でよい（近さで測れないため）。それ以外（現在地取得済み・前回基準点あり）は近い候補。
- 国土地理院レスポンスの座標は `[経度, 緯度]` 順。lat/lon取り違え注意（テストで担保）。
- ※「川口駅」のような駅名は候補が散るが、関東に基準点がある状態なら近さで埼玉側が選ばれる想定。

---

## 3. 触ってよい / 触ってはいけない

### 触ってよい
- 新規：`api/overpass.js`（Vercel Function）。
- 変更：`src/reverseDirection/mapSearch.js`（Overpass呼び出しをプロキシ一本化）、基準点設定窓の住所検索コンポーネント（pickNearest適用）、ローディング表示の配線。
- テスト：プロキシ呼び出し形式、pickNearestの基準点窓適用、座標順。

### 触ってはいけない
- `src/kimon/` エンジン群・扇描画・スコア配列・方位判定の中身・ピン色定義・お気に入り(localStorage)。
- bbox生成・KEYMAP・Overpassクエリの中身（timeout/out centerの微調整は可）。

---

## 4. 進め方
1. ブランチ：`git fetch origin` → `git checkout -b hotfix-overpass-proxy origin/main`（#23はマージせず置いておく。本ブランチで方式ごと差し替える。#23と内容が重なる部分は本ブランチを正とする）。
2. `api/overpass.js` を新規作成（§1-2）。
3. `mapSearch.js` のOverpass呼び出しを `/api/overpass` 一本化（§1-3）。前回のクライアント側フォールバック配列は削除。
4. 基準点設定窓に pickNearest を適用（§2）。
5. ローディング表示（§1-4）。
6. `npm test`（全green）＋ `npm run build`（成功）。
7. push前に `git log --oneline origin/main..hotfix-overpass-proxy` で本ホットフィックスのコミットだけか確認。
8. push → PR → **Vercelプレビューで§6を全部目視** → 問題なければ手動マージ。
   - ※Vercel Functionはプレビューでも動く。プレビューで `/api/overpass` 経由の検索が通ることを確認できる。

---

## 5. テスト
- mapSearchのOverpass呼び出し先が `/api/overpass`（相対・同一オリジン）になっていること。前回の外部エンドポイント配列が残っていないこと。
- pickNearestが基準点設定窓の検索からも呼ばれること（複数候補→近い方、home無し→先頭、1件→それ）。
- 国土地理院の `[lon,lat]` を正しくlat/lonに割り当て（関東基準点＋「川口駅」相当候補集合で埼玉側が選ばれる）。
- 既存テスト全green維持。
- ※プロキシ関数(api/overpass.js)はサーバー関数なので単体テストは任意。最低限、クライアントが叩くURLが `/api/overpass` であることのテストを置く。

---

## 6. マージ前チェック（必須・前回までの反省）
Vercelプレビューで以下を**全部目視**してからマージ：
1. 「コンビニ」「カフェ」を関東で検索 → **数秒以内**にピンが出る。Consoleに CORS/504/403/Failed to fetch が**出ない**。
2. 検索が**全滅して数十秒待たされることがない**（体感「サクッと」）。
3. 上の基準点窓に「川口駅」→ **埼玉の川口**になる（根室にならない。関東に基準点がある状態で）。
4. お気に入り追加 → 日付変更で方位色が変わる。
これらが全部OKで初めて手動マージ。

---

## 7. メモ（設計の整理）
- これでアプリは「自前API(`/api/overpass`)を持つ」構成になる。課金は無料枠内（個人利用の検索頻度ではまず発生しない）が、「サーバーなし」ではなくなる点はオーナー(かなこ)了承済み。
- 将来：お気に入りのクラウド同期も同じ `api/` の仕組みに乗せられる（今回はやらない）。
- 国土地理院ジオコーディングはCORS対応なのでクライアント直のままでよい（プロキシ不要）。プロキシ化したのはOverpassのみ。
