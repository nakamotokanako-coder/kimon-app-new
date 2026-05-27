# Codex実装指示：現在地マーク＋追っかけ線（お散歩ナビ）

> 対象：`DirectionMap.jsx` に「自分の現在地」と「家→現在地の線」を重ねる新機能。
> 目的：散歩で吉方位を取りに行くとき、曲がり角などで「今ちゃんと吉方位（南など）に進めてる？北になってない？」が分からなくなる問題を、地図上で一目で確認できるようにする。
> 見せ方の参考：「あちこち方位」アプリ（h200.com/houi1）の「現在地マーク／追っかけ線」。
> 前提：地図連動（扇表示）・お気に入り・スクロール修正まで実装済み・main安定・テスト全green。

---

## 0. 大原則（必読・前指示書から継続）

- **既存の判定エンジンには一切手を入れない**。盤組立・点数計算・扇の描画ロジックは既存のまま。
- **AIは使わない／課金ゼロ・APIキー不要**を厳守。地図=Leaflet。位置取得=ブラウザ標準 `navigator.geolocation` のみ。
- 作業は新しいブランチで（例：`feat-live-location`）。`git checkout main && git pull && git checkout -b feat-live-location`。
- 各ステップ後に `npm test`（全green維持）と `npm run build`（成功）を必ず確認。
- 実機確認は**Vercelプレビュー**で（位置情報APIはHTTPS必須。LAN IP:5173では現在地が取れない）。
- **この指示書の範囲を超えて実装しない**（§8「やらないこと」を厳守）。
- **デフォルトは必ずOFF**。手動ボタンを押したときだけGPSを起動する（理由は§1末尾）。

---

## 1. この機能は何か（1行＋背景）

**家（基準点）を中心とした既存の扇表示に、「現在地の青い点」と「家→現在地を結ぶ線」を重ねて、散歩中に自分が吉方位の扇の中に正しく入れているかを見られるようにする。**

背景：家を基準点に「南が吉」と出ても、いざ歩くと曲がり角で方角を見失う。家から自分への線が引かれていれば、その線が吉方位の扇の中に入っているかで「今ちゃんと取れてる」が一目で分かる。

**なぜデフォルトOFF＋手動起動が鉄則か**：先行アプリ「あちこち方位」で、GPSをデフォルトONにした結果、PC等のGPS非搭載／許可しない環境で**8秒のタイムアウト待ち**が発生する不具合が起きた実例がある。本アプリでも、ユーザーが「現在地を表示」ボタンを押したときだけ `watchPosition` を起動する。

---

## 2. 再利用するもの（呼ぶだけ・改変禁止）

すべて既存。**新規の角度・距離計算は書かない。**

- `mapFan.js` の **`initialBearing(from, to)`** … 2点間の方位角（家→現在地が何度か）。
- `mapSearch.js` の **`distanceMeters(from, to)`** … 2点間の距離（家から現在地まで何m）。
- `mapSearch.js` の **`decoratePlaces(places, center, rankings, bearingOptions)`** … 地点に「家から見た方位（`direction`）」を付与する。現在地を `[{latitude, longitude}]` の1件として渡せば、`result[0].direction`（`palace`/`label`/`score`/`tone`）が得られる。**色分け判定はこれを使う**＝新規ロジック不要。
- `mapFan.js` の **`isPositiveTone(tone)`** … 吉系判定。色分けに使う。
- 既存の `center`（= `[location.latitude, location.longitude]`、家の座標）、`bearingOptions`、`rankings`、`bestPalace`。これらは `DirectionMap` 内に既にある。

> 現在地が「家から見てどの吉凶方位に当たるか」は `decoratePlaces` が返す `direction` がそのまま答え。角度の自前計算は禁止。

---

## 3. 確定仕様

### 3-1. 状態（DirectionMap内に追加するstate / ref）
- `const [liveOn, setLiveOn] = useState(false)` … 現在地表示のON/OFF。**初期値false**。
- `const [livePos, setLivePos] = useState(null)` … 現在地座標 `[lat, lng]` または `null`。
- `const watchIdRef = useRef(null)` … `watchPosition` のID（停止用）。
- `const liveLayerRef = useRef(null)` … **現在地専用のlayerGroup**（扇用 `layerGroupRef` とは別に持つ。理由は§5）。

ON/OFFは localStorage に記憶し次回も維持する。キーは既存と衝突しない新規キー：
```
LIVE_LOCATION_STORAGE_KEY = 'kimon_map_live_on_v1'
```
- 初期化時に `liveOn` をこのキーから復元してよい。**ただし復元してONだった場合でも、ページ読込だけでGPSは起動せず、ユーザー操作（後述のボタン）か明示の起動でのみ `watchPosition` を呼ぶこと**。安全側に倒す。迷うなら「localStorageにはトグル状態だけ保存し、起動は常にユーザーがボタンを押した時」で実装してよい。

### 3-2. ボタン（手動起動）
- ヘッダーの「拡大／閉じる」ボタンの並び（`direction-map-header`）に、もう1つボタンを足す：**「現在地」**（ONのとき「現在地ON」など状態が分かる表示）。
- 押下で `liveOn` をトグル。
  - OFF→ON：`navigator.geolocation` が無ければ `mapStatus` に「この端末では現在地を取得できません」と出して終了（ONにしない）。あれば `watchPosition` を開始。
  - ON→OFF：`watchPosition` を `clearWatch` で停止し、`livePos` を `null` に、現在地layerをクリア。

### 3-3. watchPosition の扱い
```js
watchIdRef.current = navigator.geolocation.watchPosition(
  (pos) => setLivePos([pos.coords.latitude, pos.coords.longitude]),
  (err) => setMapStatus('現在地を取得できませんでした。'),  // ONのまま待機でよい。連続失敗で煩くしない
  { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
);
```
- 停止は `navigator.geolocation.clearWatch(watchIdRef.current)`。
- **アンマウント時・`liveOn`がfalseになった時に必ず `clearWatch`**（リーク防止）。`useEffect` のクリーンアップで確実に。

### 3-4. ①現在地マーク（必須）
- `livePos` に Leaflet の `circleMarker` を1つ置く。青系・白縁で「自分」が分かる見た目：
  ```
  radius: 7, color: '#fff', weight: 2, fillColor: '#2f6fed', fillOpacity: 1
  ```
- `bindTooltip('現在地')` 程度でよい。
- 歩いて `livePos` が更新されるたびに位置が動く（後述の現在地effectで再描画）。

### 3-5. ②追っかけ線（必須・本命）
- 家 `center` → 現在地 `livePos` を結ぶ `L.polyline([center, livePos], {...})` を1本引く。
- 基本スタイル（色分けOFF時の既定）：
  ```
  color: '#2f6fed', weight: 3, opacity: 0.9
  ```
- これで「家から見て自分が今どの方角にいるか」が線で分かる。

### 3-6. ③扇内/外の色分け（必須・C案＝同時に実装。ただし§7のフォールバック条件を厳守）
現在地が選択中の吉方位に乗れているかを線の色で示す。
- 現在地の方位評価を取得：
  ```js
  const liveDir = decoratePlaces([{ latitude: livePos[0], longitude: livePos[1] }],
                                 center, rankings, bearingOptions)[0]?.direction;
  ```
- 色の決定（優先順位）：
  1. `liveDir?.palace === bestPalace` → **緑（`#2e9e5b`）**＝今まさにベスト方位に乗れている。
  2. それ以外で `isPositiveTone(liveDir?.tone)` が真 → **緑（`#2e9e5b`）**＝吉方位の扇の中。
  3. それ以外（中立・凶・判定不能） → **灰（`#8a8a8a`）**＝外れている。
- この色を**追っかけ線**と**現在地マークの縁 or 塗り**の両方に反映してよい（線だけでも可。最低限、線の色で吉/外が分かること）。
- `mapStatus` か小さなラベルで補足してよい（任意）：例「南に向かえています（+30）」/「吉方位から外れています」。`liveDir?.label` と `score` を使う。**過剰にうるさくしない**。

### 3-7. 距離表示（任意・できれば）
- `distanceMeters(center, livePos)` で家からの距離を出し、現在地マークのtooltipか `mapStatus` に「家から約120m」のように添えてよい。第一弾では無くてもよい。

### 3-8. 基準点（家）が変わったときの挙動
- `location`（=`center`）が変わったら、**現在地マーク・線はクリアする**（古い家との線が残ると誤解を生む）。
- `liveOn` が true のままなら、`watchPosition` は継続でよい（次の位置更新で新しい家からの線が引き直される）。実装が楽なら、`center` 変化時に一度線を消し、次の `livePos` 更新で再描画でOK。

---

## 4. 確定値（まとめ）
```
現在地マーク:   radius 7, color #fff, weight 2, fillColor #2f6fed, fillOpacity 1
追っかけ線(既定): color #2f6fed, weight 3, opacity 0.9
色分け 緑(吉):  #2e9e5b
色分け 灰(外):  #8a8a8a
watchPosition:  enableHighAccuracy:true, maximumAge:2000, timeout:10000
localStorageキー: 'kimon_map_live_on_v1'（トグル状態のみ）
デフォルト:      OFF（liveOn 初期 false）
```
※ 色は暫定。和テーマとの相性は完成後に先生確認（§9）で調整可能なよう、定数にまとめて1か所で変えられるようにしておく。

---

## 5. 実装の置き場所（デグレ最小の設計・最重要）

**現在地は、扇用の `layerGroupRef` には絶対に入れない。専用の `liveLayerRef` を新設する。**

理由：扇の描画effect（`location`/`rankings`/`bearingOptions` 等が変わるたびに `layerGroup.clearLayers()` する）に現在地を混ぜると、扇の再描画のたびに現在地マークも消え、GPS更新と扇更新のタイミングがズレてチラつく。レイヤーを分ければ両者は完全に独立する。

### 5-1. 地図初期化effect（既存 282–294行あたり）に1行追加
扇用 `layerGroupRef` を作っている直後に、現在地専用layerも作る：
```js
liveLayerRef.current = L.layerGroup().addTo(mapRef.current);
```
（`layerGroupRef` の後にaddTo＝現在地が扇より前面に来る。これでよい。）

### 5-2. 現在地専用の描画effect（新規・独立）
扇のeffectとは別に、新しい `useEffect` を1つ足す。依存配列は現在地まわりだけ：
```js
useEffect(() => {
  const live = liveLayerRef.current;
  if (!live) return;
  live.clearLayers();
  if (!liveOn || !livePos) return;            // OFFか未取得なら何も描かない＝既存表示はそのまま
  // ここで decoratePlaces で liveDir を求め、色を決め、circleMarker と polyline を live に addTo
}, [liveOn, livePos, center, rankings, bestPalace, bearingOptions]);
```
- **この中で扇・リング・お気に入りには一切触らない**（`layerGroupRef` を参照しない）。

### 5-3. watchPosition の起動/停止effect（新規）
`liveOn` の変化に応じて `watchPosition`/`clearWatch` する `useEffect` を足す。クリーンアップで必ず `clearWatch`：
```js
useEffect(() => {
  if (!liveOn) return undefined;
  if (!navigator.geolocation) { setMapStatus('この端末では現在地を取得できません。'); setLiveOn(false); return undefined; }
  const id = navigator.geolocation.watchPosition(/* §3-3 */);
  watchIdRef.current = id;
  return () => { navigator.geolocation.clearWatch(id); watchIdRef.current = null; };
}, [liveOn]);
```

### 5-4. 全画面モードに巻き込まない（過去2回デグレした箇所・厳守）
- ヘッダーに足す「現在地」ボタンは `direction-map-header` 内に置く。`isFullscreen` の値に依存して表示を消したりしないこと（全画面でも通常でも常時出てよい）。
- 全画面トグル時の `invalidateSize` effect（既存 420–425行）は**触らない**。
- 全画面時に `place-panel` 等が `display:none` になる現構造を壊さない。現在地は地図レイヤー上なので、パネルのCSSとは独立。

---

## 6. 触ってよい / 触ってはいけない

### 触ってよい（追加のみ）
- `DirectionMap.jsx`：上記のstate/ref追加、ヘッダーの「現在地」ボタン追加、現在地描画effect・watchPositioneffectの新規追加、色定数の追加。
- `styles.css`：新ボタンのスタイル（既存 `.direction-map-action` のトーンに合わせる）。必要なら現在地ステータス表示の最小スタイル。
- テスト：色分けの純関数化した部分（§7）に対する単体テスト。

### 触ってはいけない
- 扇の描画effect（296–418行）の中身、`buildFanLayerSpecs`、`mapFan.js` / `mapSearch.js` の既存関数（**呼ぶだけ**）。
- `layerGroupRef`（扇・リング・ラベル・POI用）。現在地は別レイヤー。
- `ReverseDirectionView.jsx`（**propは現状のまま**。現在地はDirectionMap内部で完結）。
- エンジン群（`src/kimon/` 配下）・データ（json/csv）。
- 既存のお気に入り／検索／全画面ロジック。

---

## 7. テスト（色分けは純関数化してテストする）

色分けの中核（tone→色）を、effectの外に**純関数として切り出して**テスト可能にする。例：
```js
export function liveLineColor(liveDir, bestPalace) {
  if (!liveDir) return '#8a8a8a';
  if (liveDir.palace === bestPalace) return '#2e9e5b';
  if (isPositiveTone(liveDir.tone)) return '#2e9e5b';
  return '#8a8a8a';
}
```
テスト項目：
- `liveDir` が `null` → 灰。
- `palace === bestPalace` → 緑。
- 吉トーン（great/good/weak）→ 緑。
- 中立/凶 → 灰。
- 既存テストは**全green維持**（既存ロジック非改変なので壊れない想定）。

> watchPositionやLeaflet描画はユニットテストしづらいので、純関数（色判定）だけテストすればよい。描画は実機（Vercelプレビュー）で確認。

---

## 8. やらないこと（範囲外）

- **デフォルトON・自動起動はしない**（タイムアウト待ちバグ回避）。必ず手動ボタン起動。
- 方位メーター（コンパス）・端末の向き（`deviceorientation`）連動は**将来**。今回は位置だけ。
- 地図中心のリアルタイム距離・方角の常時表示（「あちこち方位」の地図中心連動）は将来。
- 現在地に追従して地図を自動でパン／ズームする挙動は**入れない**（勝手に動くと操作しづらい）。第一弾は点と線を出すだけ。必要なら「現在地へ移動」ボタンは将来。
- お気に入りピンとの干渉ロジック、ルート案内、道なり描画はしない。

---

## 9. 完成後に先生へ確認（チェックリスト追記分）

- 現在地マーク／追っかけ線の色（青 `#2f6fed`、緑 `#2e9e5b`、灰 `#8a8a8a`）が和テーマと合うか。
- 「吉方位の扇に入っていれば緑」の判定基準：ベスト方位のみ緑にすべきか、吉系すべてで緑でよいか（今は吉系すべて緑）。
- 距離表示（家から約○m）を出すか。
- 出発時に時盤の吉方位を取る作法と、この現在地ナビの併用案内をどう見せるか。

---

## 10. 進め方

1. `DirectionMap.jsx` に state/ref（`liveOn`/`livePos`/`watchIdRef`/`liveLayerRef`）と色定数、`liveLineColor` 純関数を追加。
2. 地図初期化effectに `liveLayerRef` 生成を1行追加（§5-1）。
3. watchPosition起動/停止effect（§5-3）と現在地描画effect（§5-2）を新規追加。
4. ヘッダーに「現在地」ボタンを追加し `liveOn` をトグル（§3-2）。localStorageでトグル状態を記憶。
5. `liveLineColor` の単体テストを追加。`npm test`（全green）/ `npm run build`（成功）。
6. **Vercelプレビューで実機（iPhone）確認**：散歩しながら、線が伸びること・吉方位の扇に入ると緑／外れると灰になることを確認。OFFで完全に消えること、全画面トグルでデグレしないことも確認。
7. PR作成。**base が `main` であることを必ず確認**。**マージはユーザー（かなこ）が手動**。

---

### フォールバック（C案の安全弁・厳守）
色分け（§3-6）でテストが詰まる・描画が不安定になる場合は、**色分けを後回しにして「現在地マーク＋追っかけ線（既定の青）」だけでPRを出してよい**。線が出ること（本命）が最優先。色分けは線が安定してから別PRでもよい。判断に迷ったら線優先。
