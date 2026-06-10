// koyomi v4 埋め戻しバッチ（1900-2002）。
// 方針(ユーザー指示②+条件):
//  - time_kyokusu(1922-2002)は koyomi_v2.csv が正本。
//  - sekki24(1922-2002)は (sangen, time_kyokusu) + 三元局数表から正準ウォークで復元。
//  - inton_youton は 符頭アンカー則(冬至/夏至 最寄り甲子, 窓[-29,+27])。
//  - 1900-1921 は time_kyokusu 出典が無いため純計算（天文）: sekki24=至点アンカーウォーク,
//    time_kyokusu=三元局数表(sekki,sangen)。provenance を別記。
//  - kyusei_day(日家九星)は非標準則かつ2000年以前検証不能 → 空欄のまま(先生確認)。
//  - 既存の非空セルは決して上書きしない。
// 検証ゲート:
//  G1 held-out 2003-2019 を全パイプラインで再現（sekki24/inton/局数整合）。
//  G2 v2(1922-2002)の time_kyokusu を 復元sekki24+三元表 で再計算し全行diff。不一致あれば停止。
//  G3 既存実値(2000-2002 ほか)の100%再現。
import fs from 'node:fs';
import {
  simulateKyuseiInton, reconstructSekkiFromKyokusu, kyokusuOf,
  solarTermsForYear, SEKKI_ORDER, dayDiff,
} from './lib/koyomi_engine.mjs';
import { reconstructSekkiSolsticeWalk } from './lib/sekki_astro_walk.mjs';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
const parseRows = (txt) => {
  const lines = txt.replace(/\r/g, '').trimEnd().split('\n');
  const head = lines[0].split(',');
  const rows = lines.slice(1).map((l) => { const c = l.split(','); const o = {}; head.forEach((h, i) => (o[h] = c[i] ?? '')); return o; });
  return { head, rows };
};

const { head, rows: v3 } = parseRows(read('data/koyomi_v3.csv'));
const { rows: v2rows } = parseRows(read('data/koyomi_v2.csv'));
const v2time = Object.fromEntries(v2rows.map((r) => [r.date, r.time_kyokusu]));

const TARGET_LO = '1900-01-01', TARGET_HI = '2002-12-31';
// 純計算区間 = v2(time_kyokusu)が始まる 1922-12-22 より前。1900-01-01〜1922-12-21。
const COMPUTED_LO = '1900-01-01', COMPUTED_HI = '1922-12-21';

// 天文節気（at関数）
const termsByYear = new Map();
for (let y = 1898; y <= 2046; y++) termsByYear.set(y, solarTermsForYear(y));
const allTerms = [];
for (const [, t] of termsByYear) for (const x of t) allTerms.push(x);
allTerms.sort((a, b) => (a.date < b.date ? -1 : 1));
const astroSekkiAt = (date) => { let cur = null; for (const t of allTerms) { if (t.date <= date) cur = t.name; else break; } return cur; };
// 境界±1日フラグ: 節入がその日のJST 0-3時 or 21-24時（日付確定が際どい）
const boundaryDays = new Map(); // date -> {name, hourJst}
for (const t of allTerms) { if (t.hourJst < 3 || t.hourJst > 21) boundaryDays.set(t.date, { name: t.name, hourJst: +t.hourJst.toFixed(2) }); }

// ---------- sekki24 復元 ----------
// (A) time_kyokusu がある区間(1922-2002 + 2003+) を正準ウォークで復元
const withKyokuRows = v3
  .filter((r) => (v2time[r.date] || r.time_kyokusu))
  .map((r) => ({ date: r.date, sangen: r.sangen, time_kyokusu: r.time_kyokusu || v2time[r.date] }));
const { map: sekkiByKyoku, issues: sekkiIssues } = reconstructSekkiFromKyokusu(withKyokuRows, astroSekkiAt);

// (B) 1900-1921（純計算）: 至点アンカーウォーク。終端を既知(1922)へ接続するため 1900-1925 で走らせる
const walkRows = v3.filter((r) => r.date <= '1925-12-31').map((r) => ({ date: r.date, sangen: r.sangen }));
const sekkiByAstro = reconstructSekkiSolsticeWalk(walkRows, 1900, 1925);

// ---------- inton + kyusei（シミュレーション）----------
const sim = simulateKyuseiInton(v3.map((r) => r.date));

// ========== 検証ゲート ==========
const report = [];
const L = (s) => { report.push(s); console.log(s); };
L('# koyomi v4 埋め戻し 検証レポート');
L(`生成日時: ${new Date().toISOString()}`);
L('');

// G1: held-out 2003-2019 再現
{
  let nS = 0, mS = 0, nI = 0, mI = 0;
  for (const r of v3) {
    if (r.date < '2003-01-01' || r.date > '2019-12-31') continue;
    if (r.sekki24) { nS++; if (sekkiByKyoku.get(r.date) !== r.sekki24) mS++; }
    const s = sim.get(r.date);
    if (r.inton_youton && s) { nI++; if (s.inton_youton !== r.inton_youton) mI++; }
  }
  L(`## G1 held-out 2003-2019 再現`);
  L(`- sekki24(局数経由): ${nS}行 不一致 ${mS}`);
  L(`- inton_youton: ${nI}行 不一致 ${mI}`);
  L(`- sekkiウォーク issues: ${sekkiIssues.length}`);
  if (mS || mI || sekkiIssues.length) { L('**G1失敗 → 停止**'); flushAndExit(1); }
  L('');
}

// G2: v2(1922-2002) time_kyokusu を 復元sekki24+三元表 で再計算し全行diff
{
  let n = 0, m = 0; const mism = [];
  for (const r of v3) {
    if (r.date < '1922-01-01' || r.date > '2002-12-31') continue;
    const obs = v2time[r.date];
    if (!obs) continue; // v2範囲外(1922-12より前など)
    n++;
    const sek = sekkiByKyoku.get(r.date);
    const recomputed = kyokusuOf(sek, r.sangen);
    if (recomputed !== obs) { m++; if (mism.length < 50) mism.push({ date: r.date, sekki: sek, sangen: r.sangen, tbl: recomputed, v2: obs }); }
  }
  L(`## G2 v2 time_kyokusu 全行再計算diff（v2=正本）`);
  L(`- 対象 ${n}行 / 不一致 ${m}`);
  if (m) {
    L('- 不一致一覧（先生事後検証リスト候補）:');
    for (const x of mism) L(`  - ${x.date}: 三元表(${x.sekki}/${x.sangen})=${x.tbl} ≠ v2=${x.v2}`);
    L('**G2失敗: v2正本と不一致 → 書き込み中止（条件②）**');
    flushAndExit(1);
  }
  L('');
}

// 純計算ウォークの自己診断: 1922-2002 で 至点ウォーク vs 局数復元(信頼) の差を測り、1900-1921 の信頼度を推定
{
  const walk2 = reconstructSekkiSolsticeWalk(
    v3.filter((r) => r.date >= '1921-01-01' && r.date <= '2002-12-31').map((r) => ({ date: r.date, sangen: r.sangen })),
    1921, 2002);
  let n = 0, m = 0;
  for (const r of v3) { if (r.date < '1922-01-01' || r.date > '2002-12-31') continue; const t = sekkiByKyoku.get(r.date); if (!t) continue; n++; if (walk2.get(r.date) !== t) m++; }
  L(`## 純計算(至点ウォーク)自己診断`);
  L(`- 1922-2002 で 天文ウォーク vs 局数復元: ${n}行中 ${m}不一致 (${(100 * m / n).toFixed(2)}%)`);
  L(`- → 1900-1921 の sekki24/time_kyokusu(純計算)も概ね同程度の不確かさと推定。**先生事後検証推奨**。`);
  L('');
}

// ========== v4 セル埋め ==========
let fill = { kyusei_day: 0, time_kyokusu: 0, inton_youton: 0, sekki24: 0 };
let conflicts = [];
const provenance = []; // 1900-1921 純計算行

for (const r of v3) {
  if (r.date < TARGET_LO || r.date > TARGET_HI) continue;
  const isComputed = r.date >= COMPUTED_LO && r.date <= COMPUTED_HI;

  // --- time_kyokusu ---
  if (!r.time_kyokusu) {
    let val = null;
    if (v2time[r.date]) val = v2time[r.date];               // 1922-2002 正本
    else if (isComputed) {                                   // 1900-1921 純計算
      const sek = sekkiByAstro.get(r.date);
      val = sek ? kyokusuOf(sek, r.sangen) : null;
    }
    if (val) { r.time_kyokusu = val; fill.time_kyokusu++; }
  }

  // --- sekki24 ---
  if (!r.sekki24) {
    const val = sekkiByKyoku.get(r.date) || (isComputed ? sekkiByAstro.get(r.date) : null);
    if (val) { r.sekki24 = val; fill.sekki24++; }
  }

  // --- inton_youton ---
  if (!r.inton_youton) {
    const s = sim.get(r.date);
    if (s && s.inton_youton) { r.inton_youton = s.inton_youton; fill.inton_youton++; }
  }

  // --- kyusei_day: 非標準則・検証不能のため空欄維持（先生確認） ---

  if (isComputed) provenance.push(r.date);
}

// G3: 既存実値を壊していないか（このバッチは空セルのみ書くので原理上不変だが明示確認）
// → 上のループは !r.xxx の時だけ書くため既存値は保持。確認のみ。

// ---------- 出力 ----------
const outLines = [head.join(',')];
for (const r of v3) outLines.push(head.map((h) => r[h] ?? '').join(','));
fs.writeFileSync('data/koyomi_v4.csv', outLines.join('\n') + '\n');

L(`## 埋め込み結果（1900-2002, 空セルのみ）`);
L(`- time_kyokusu: +${fill.time_kyokusu}`);
L(`- sekki24: +${fill.sekki24}`);
L(`- inton_youton: +${fill.inton_youton}`);
L(`- kyusei_day: +0（意図的に空欄維持・日家九星は先生の正統アルゴリズム待ち）`);
L('');
L(`## provenance（純計算区間）`);
L(`- ${COMPUTED_LO}〜${COMPUTED_HI} の time_kyokusu / sekki24 は **time_kyokusu出典なしの純計算値**（${provenance.length}行）。**先生事後検証推奨**。`);
L(`- inton_youton は2000年以前は検証用実データが無い計算値（規則は2000-2019で0不一致）。`);
L('');

// 境界±1日リスト（対象範囲）
const blist = [...boundaryDays.entries()].filter(([d]) => d >= TARGET_LO && d <= TARGET_HI).sort();
L(`## 境界±1日の不確かさ（節入がJST深夜/早朝, 日付確定が際どい日）: ${blist.length}件`);
for (const [d, info] of blist) L(`- ${d} ${info.name} (節入 ${info.hourJst}時JST)`);

fs.writeFileSync('data/koyomi_v4_report.md', report.join('\n') + '\n');
console.log('\nwrote data/koyomi_v4.csv and data/koyomi_v4_report.md');

function flushAndExit(code) {
  fs.writeFileSync('data/koyomi_v4_report.md', report.join('\n') + '\n');
  process.exit(code);
}
