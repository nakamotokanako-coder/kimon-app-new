# Codex指示（ホットフィックス）：地図検索の2つの不具合修正（CORS／遠い候補）

> 緊急度：高（本番で施設検索が全件失敗・住所検索が誤った遠隔地に飛ぶ）。
> マージは戻さない。`main` の上にホットフィックスを乗せる。
> 影響範囲：`src/reverseDirection/mapSearch.js`（Overpass呼び出し＋住所候補の選択）想定。エンジン・扇・お気に入り・既存のクエリ生成や方位判定は触らない。

---

## 0. 何が起きているか（本番Consoleで確定済み）

### 不具合A：施設検索が全件CORSブロック
```
Access to fetch at 'https://overpass-api.de/api/interpreter'
from origin 'https://kimon-app-new.vercel.app'
has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
POST .../interpreter net::ERR_FAILED 406 (Not Acceptable)
```
原因：(1) 公共インスタンス `overpass-api.de` が `Access-Control-Allow-Origin` を返さず、本番ドメインからの直リクエストを拒否。(2) POSTの送り方（Content-Type）で 406 も発生。

### 不具合B：住所検索が遠い同名地に飛ぶ
「川口駅」で検索すると **北海道根室市の「川口」**（経度145.36）に飛んだ。基準点近くの埼玉・川口ではなく、国土地理院APIの**先頭候補をそのまま採用**しているため。同名地名・駅名で誤爆する。

---

## 1. 修正A：施設検索（Overpass）をCORS対応エンドポイントへ

`overpass-api.de` をやめ、**CORS許可済みインスタンス**に切替＋失敗時フォールバック。

```js
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function overpassFetch(query) {
  let lastErr;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, // 406対策
        body: query,                                             // 生クエリ（'data='を付けない）
      });
      if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue; }
      return await res.json();
    } catch (e) { lastErr = e; } // 次の候補へ
  }
  throw lastErr || new Error('all overpass endpoints failed');
}
```
- ヘッダは `text/plain;charset=UTF-8`、bodyは**生のOverpQL**（従来の `'data='+encodeURIComponent(...)` をやめる）。
- bbox・KEYMAP・`out center`・結果パース・方位判定・ピン色・一覧は**変更しない**。今回はネットワーク層だけ。

---

## 2. 修正B：住所検索は「基準点に近い候補」を自動選択

国土地理院APIは複数候補を配列で返す。**先頭固定をやめ、現在の基準点(HOME)に最も近い候補を選ぶ。**

```js
// 国土地理院: https://msearch.gsi.go.jp/address-search/AddressSearch?q=...
// → [{ geometry:{ coordinates:[lon,lat] }, properties:{ title } }, ...] を返す
function pickNearest(candidates, home) {
  if (!candidates || !candidates.length) return null;
  if (!home) return candidates[0];           // 基準点未設定時のみ先頭（近さで測れないため）
  if (candidates.length === 1) return candidates[0];
  return candidates
    .map(c => {
      const lon = c.geometry.coordinates[0];
      const lat = c.geometry.coordinates[1];
      return { c, d: distM(home, [lat, lon]) }; // distMは既存
    })
    .sort((a, b) => a.d - b.d)[0].c;
}
```
- 選んだ候補の座標へ飛んでピンを立て、方位・吉凶・距離を出す（既存 `dropPlace`）。
- **注意**：国土地理院のレスポンスは座標が `[経度, 緯度]` の順。lat/lonの取り違えに注意（テストで担保）。
- 候補ゼロのときは既存どおり、範囲内の名前検索へフォールバック。
- ※「川口駅」のような駅名は住所ジオコーディングが苦手で候補が散る。近さ自動選択でたいてい正しくなるが、それでも外す場合があることは許容（将来、候補リスト選択をオプション化する余地。今回はやらない）。

---

## 3. 触ってよい / 触ってはいけない

### 触ってよい
- `src/reverseDirection/mapSearch.js`：Overpass呼び出し（エンドポイント配列・ヘッダ・body）、住所候補の選択（pickNearest）。
- `test/mapSearch.test.js`：§5のテスト追加。

### 触ってはいけない
- 方位判定(dirForPoint)・距離・扇との一致ロジック、ピン色、一覧、お気に入り(localStorage)。
- `src/kimon/` エンジン群・扇描画・既存の盤UI。
- bbox生成・KEYMAP・Overpassのクエリ文字列の中身。

---

## 4. 進め方

1. `git checkout main && git pull && git checkout -b hotfix-map-search`。
2. 修正A（Overpassエンドポイント＋ヘッダ/body）。
3. 修正B（pickNearestで近い候補を選択）。
4. `test/mapSearch.test.js` に §5 追加。
5. `npm test`（全green・357を下回らない）＋ `npm run build`（成功）。
6. push前に `git log --oneline origin/main..hotfix-map-search` で**このホットフィックスのコミットだけ**を確認。
7. push → PR → **Vercelプレビューで実機確認（§6を全部目視）** → 問題なければ手動マージ。

---

## 5. テスト

- `overpassFetch`：1つ目失敗→2つ目を試す（モックfetchでエラー/!okを再現）。全滅でthrow。
- POSTのheaderが `text/plain;charset=UTF-8`、bodyが生クエリ（`data=`接頭辞なし）。
- `pickNearest`：複数候補からHOMEに最も近いものを返す。home無しは先頭。1件はそれを返す。
- 座標順：国土地理院の `[lon, lat]` を正しくlat/lonに割り当てている（東京近辺の基準点＋「川口駅」相当の候補集合で、埼玉側が選ばれること）。
- 既存テスト全green維持。

---

## 6. マージ前チェック（前回の反省・必須）

Vercelプレビューで以下を**全部目視**してからマージ：
- 「コンビニ」「駅」で施設検索 → ピンが出る。ConsoleにCORS/406/Failed to fetchが**出ない**。
- 「川口駅」を住所検索 → **埼玉の川口**付近に飛ぶ（根室に飛ばない。※基準点が関東にある状態で）。
- お気に入り追加 → 日付変更でお気に入りの方位色が変わる（前回未確認分）。

---

## 7. 将来メモ（今回はやらない）
- 公共Overpassは不安定（CORS方針変更・レート制限・ダウン）。将来サーバーを持つならVercelの軽量プロキシ経由が堅い。今は課金ゼロ・サーバーなし原則を維持し、CORS対応インスタンス＋フォールバックで凌ぐ。
- 駅名・施設名検索の精度を上げたいなら、候補リスト選択UIのオプション化を別途検討。
