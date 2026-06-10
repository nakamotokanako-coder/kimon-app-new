// scripts/build_kaisetsu_text.mjs
// 解説生成エンジン Phase 2: 全件生成＋検証。
// 全1080局 × 8方位 × 願い5軸 = 43,200件の解説文をビルド時生成する。
//
//   実行: node scripts/build_kaisetsu_text.mjs
//   出力（コミットしない・.gitignore 済）:
//     data/kaisetsu/generated/kaisetsu_text_v1.json  … { 局key: { palace: { axis: 文 } } }
//   出力（コミットする）:
//     data/kaisetsu/sample_review_v1.md   … 固定の代表5局の全方位×全軸（人間レビュー用）
//     data/kaisetsu/build_stats_v1.json   … 文字数分布・注意文率・フォールバック率・エラー0確認
//
// 注: src/kimon・CSV・バンクは読み込み専用。生成物・バンクはクライアントバンドルに import しない
//     （ペイウォール資産。配信方式は Phase 3 でサーバー関数経由を設計）。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classifyPalace } from '../src/kaisetsu/classifyPalace.js';
import { composeDetail, AXES } from '../src/kaisetsu/composeText.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PATH = join(ROOT, 'data', 'chito_v2_with_kakkyoku.csv');
const BANK_PATH = join(ROOT, 'data', 'kaisetsu', 'kaisetsu_bank_v1.json');
const OUT_DIR = join(ROOT, 'data', 'kaisetsu');
const GEN_DIR = join(OUT_DIR, 'generated');

const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
const PALACE_JP = { kan: '坎', gon: '艮', shin: '震', son: '巽', ri: '離', kun: '坤', da: '兌', ken: '乾' };

function loadRows() {
  const lines = readFileSync(CSV_PATH, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
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
  const bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
  if (!bank || !bank.skeletons) {
    throw new Error(`文言バンクが不正です: ${BANK_PATH}`);
  }

  const generated = {};
  const lengths = [];
  let cautionCount = 0;
  let emptyCount = 0;
  let formatErrorCount = 0;
  let over120 = 0;
  const reasonSrc = { shoui: 0, use: 0, gate: 0, star: 0 };
  const FORMAT_BAD = /。。|、。|undefined|null/;

  // 代表5局の選定（再現可能・出現順で最初に条件を満たす局）
  const samples = { teibo: '陰1局丁卯', fukugin: null, hangin: null, manyMaru: null, manyBatsu: null };

  for (const row of rows) {
    const byPalace = {};
    let maru = 0;
    let batsu = 0;
    for (const palace of PALACES) {
      const judgment = classifyPalace(row, palace);
      if (judgment.rank === '◎') maru += 1;
      if (judgment.rank === '×') batsu += 1;
      const axisTexts = {};
      for (const axis of AXES) {
        const { text, reasonSrc: rsrc, cautionSrc, length } = composeDetail(judgment, axis, bank);
        axisTexts[axis] = text;
        lengths.push(length);
        if (cautionSrc !== 'none') cautionCount += 1;
        if (reasonSrc[rsrc] !== undefined) reasonSrc[rsrc] += 1;
        if (!text || text.length === 0) emptyCount += 1;
        if (FORMAT_BAD.test(text)) formatErrorCount += 1;
        if (length > 120) over120 += 1;
      }
      byPalace[palace] = axisTexts;
    }
    generated[row.key] = byPalace;

    const bl = row.ban_level || '';
    // 代表局はなるべく重複させない（teibo=丁卯 と別の局を選ぶ）
    if (!samples.fukugin && bl.includes('伏吟')) samples.fukugin = row.key;
    if (!samples.hangin && bl.includes('反吟')) samples.hangin = row.key;
    if (!samples.manyMaru && maru >= 3 && row.key !== samples.teibo) samples.manyMaru = row.key;
    if (!samples.manyBatsu && batsu >= 6 && row.key !== samples.teibo) samples.manyBatsu = row.key;
  }

  const total = lengths.length;
  const sum = lengths.reduce((a, b) => a + b, 0);
  const stats = {
    generated_at_note: 'タイムスタンプは決定性のため記録しない（同入力→同出力）',
    total,
    length: {
      min: Math.min(...lengths),
      avg: Math.round((sum / total) * 10) / 10,
      max: Math.max(...lengths),
      over_120: over120,
    },
    caution_rate: Math.round((cautionCount / total) * 1000) / 1000,
    reason_src: reasonSrc,
    fallback_rate_b_c: Math.round(((reasonSrc.gate + reasonSrc.star) / total) * 1000) / 1000,
    empty_count: emptyCount,
    format_error_count: formatErrorCount,
    ok: emptyCount === 0 && formatErrorCount === 0 && over120 === 0,
  };

  // ---- 出力 ----
  mkdirSync(GEN_DIR, { recursive: true });
  writeFileSync(join(GEN_DIR, 'kaisetsu_text_v1.json'), JSON.stringify(generated) + '\n');
  writeFileSync(join(OUT_DIR, 'build_stats_v1.json'), JSON.stringify(stats, null, 2) + '\n');
  writeFileSync(join(OUT_DIR, 'sample_review_v1.md'), buildSampleReview(samples, generated, bank));

  // ---- コンソール ----
  console.log('=== 解説全件生成 (Phase 2) ===');
  console.log(`生成件数      : ${total}  (${rows.length}局 × ${PALACES.length}宮 × ${AXES.length}軸)`);
  console.log(`文字数 min/avg/max : ${stats.length.min} / ${stats.length.avg} / ${stats.length.max}  (120超: ${over120})`);
  console.log(`注意文 出現率 : ${(stats.caution_rate * 100).toFixed(1)}%`);
  console.log(`理由文の内訳  : ${JSON.stringify(reasonSrc)}`);
  console.log(`フォールバック(b/c)率 : ${(stats.fallback_rate_b_c * 100).toFixed(1)}%`);
  console.log(`空文字 / 整形エラー : ${emptyCount} / ${formatErrorCount}  → ${stats.ok ? 'OK' : 'NG'}`);
  console.log(`代表5局        : ${JSON.stringify(samples)}`);
  console.log('');
  console.log('出力: data/kaisetsu/generated/kaisetsu_text_v1.json (gitignore) / build_stats_v1.json / sample_review_v1.md');
}

function buildSampleReview(samples, generated, bank) {
  const labels = bank.axisLabels;
  const order = [
    ['丁卯（標準例）', samples.teibo],
    ['伏吟局', samples.fukugin],
    ['反吟局', samples.hangin],
    ['◎が3宮以上', samples.manyMaru],
    ['×が6宮以上', samples.manyBatsu],
  ];
  const lines = [];
  lines.push('# 解説サンプルレビュー v1');
  lines.push('');
  lines.push('固定の代表5局の全方位×全軸。文章品質レビュー用（ぶりちゃん確認）。');
  lines.push('生成は決定的（同じ盤は何度生成しても同じ文）。');
  lines.push('');
  for (const [label, key] of order) {
    lines.push(`## ${label}: ${key || '(該当局なし)'}`);
    lines.push('');
    if (!key || !generated[key]) {
      lines.push('（データなし）');
      lines.push('');
      continue;
    }
    lines.push(`| 宮 | ${AXES.map((a) => labels[a]).join(' | ')} |`);
    lines.push(`|---|${AXES.map(() => '---').join('|')}|`);
    for (const palace of PALACES) {
      const cells = AXES.map((a) => (generated[key][palace][a] || '').replace(/\|/g, '/'));
      lines.push(`| ${PALACE_JP[palace]}(${palace}) | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

main();
