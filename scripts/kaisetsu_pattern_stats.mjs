// scripts/kaisetsu_pattern_stats.mjs
// 解説生成エンジン Phase 1: パターン統計。
// chito_v2_with_kakkyoku.csv 全1080局 × 8宮 = 8,640 判定を実行し、
// 実際に出現する patternId の種類と頻度を集計する。文言バンク執筆量の見積りが目的。
//
//   実行: node scripts/kaisetsu_pattern_stats.mjs
//   出力: kaisetsu_pattern_stats.json   … patternId(5キー) ごとの出現回数（降順）
//         kaisetsu_pattern_samples.json … 各 patternId の代表サンプル3件（局キー＋宮）
//         kaisetsu_shoui_freq.json      … CSV に出現する象意の種類と頻度（文言バンク部品数の見積り用）
//         コンソール … ユニークパターン総数 / 上位20カバー率 / 象意の種類数
//
// 注: src/kimon/・CSV は読み込み専用。本スクリプトは集計のみで何も変更しない。

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classifyPalace, parseShoui } from '../src/kaisetsu/classifyPalace.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PATH = join(ROOT, 'data', 'chito_v2_with_kakkyoku.csv');
const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];

/** chito CSV をパース（カラム内にカンマは無い前提。値の区切りは ';'）。 */
function loadRows() {
  const text = readFileSync(CSV_PATH, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = lines[0].replace(/^﻿/, '').split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}

function main() {
  const rows = loadRows();
  const counts = new Map();     // patternId -> count
  const samples = new Map();    // patternId -> [{key, palace}]
  const shouiFreq = new Map();  // 象意名 -> { name, polarity, count }（出現セル数）
  let total = 0;

  for (const row of rows) {
    for (const palace of PALACES) {
      const { patternId } = classifyPalace(row, palace);
      total += 1;
      counts.set(patternId, (counts.get(patternId) || 0) + 1);
      const s = samples.get(patternId) || [];
      if (s.length < 3) {
        s.push({ key: row.key, palace });
        samples.set(patternId, s);
      }
      for (const sh of parseShoui(row, palace)) {
        const cur = shouiFreq.get(sh.name) || { name: sh.name, polarity: sh.polarity, count: 0 };
        cur.count += 1;
        shouiFreq.set(sh.name, cur);
      }
    }
  }

  // 降順ソート（同数は patternId 昇順で安定）
  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  );

  const statsObj = Object.fromEntries(sorted);
  const samplesObj = Object.fromEntries(sorted.map(([id]) => [id, samples.get(id)]));

  // 象意頻度（出現セル数の降順、同数は名前昇順で安定）
  const shouiSorted = [...shouiFreq.values()].sort(
    (a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  const shouiObj = Object.fromEntries(shouiSorted.map((s) => [s.name, { polarity: s.polarity, count: s.count }]));

  writeFileSync(join(ROOT, 'kaisetsu_pattern_stats.json'), JSON.stringify(statsObj, null, 2) + '\n');
  writeFileSync(join(ROOT, 'kaisetsu_pattern_samples.json'), JSON.stringify(samplesObj, null, 2) + '\n');
  writeFileSync(join(ROOT, 'kaisetsu_shoui_freq.json'), JSON.stringify(shouiObj, null, 2) + '\n');

  // カバー率
  const unique = sorted.length;
  const top20 = sorted.slice(0, 20).reduce((sum, [, c]) => sum + c, 0);
  const top20Pct = ((top20 / total) * 100).toFixed(1);

  console.log('=== 解説パターン統計 (Phase 1) ===');
  console.log(`判定総数        : ${total}  (${rows.length}局 × ${PALACES.length}宮)`);
  console.log(`ユニークパターン: ${unique}  (patternId=5キー rank_gateClass_starRank_godClass_vetoMain)`);
  console.log(`上位20カバー率  : ${top20Pct}%  (${top20}/${total})`);
  console.log(`象意の種類数    : ${shouiSorted.length}  (文言バンク部品数の見積り)`);
  console.log('');
  console.log('--- 上位20パターン ---');
  sorted.slice(0, 20).forEach(([id, c], i) => {
    console.log(`${String(i + 1).padStart(2)}. ${String(c).padStart(4)}  ${id}`);
  });
  console.log('');
  console.log('--- 象意 出現頻度 上位20 ---');
  shouiSorted.slice(0, 20).forEach((s, i) => {
    const pol = s.polarity > 0 ? '吉' : s.polarity < 0 ? '凶' : '中';
    console.log(`${String(i + 1).padStart(2)}. ${String(s.count).padStart(4)}  [${pol}] ${s.name}`);
  });
  console.log('');
  console.log('出力: kaisetsu_pattern_stats.json / kaisetsu_pattern_samples.json / kaisetsu_shoui_freq.json');
}

main();
