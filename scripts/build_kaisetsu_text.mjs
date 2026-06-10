// scripts/build_kaisetsu_text.mjs
// 解説生成エンジン Phase 2.5: 全件再生成＋検証。
// 全1080局 × 8方位 × 願い5軸 = 43,200件の解説文（full/short 2パターン）をビルド時生成する。
//
//   実行: node scripts/build_kaisetsu_text.mjs
//   出力（コミットしない・.gitignore 済）:
//     data/kaisetsu/generated/kaisetsu_text_v2.json
//       … { 局key: { palace: { axis: { full, short } } } }
//   出力（コミットする）:
//     data/kaisetsu/sample_review_v2.md   … 固定の代表5局の全方位×全軸（full/short 併記・人間レビュー用）
//     data/kaisetsu/build_stats_v2.json   … 文字数分布・注意文率(発生源内訳)・3文目内訳・
//                                            禁止表現混入0件・「には注意」破綻0件・エラー0確認
//
// 注: src/kimon・CSV・バンクは読み込み専用。生成物・バンクはクライアントバンドルに import しない
//     （ペイウォール資産。配信方式は Phase 3 でサーバー関数経由を設計）。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classifyPalace } from '../src/kaisetsu/classifyPalace.js';
import { composeDetail, AXES, FORBIDDEN_EXPRESSIONS } from '../src/kaisetsu/composeText.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PATH = join(ROOT, 'data', 'chito_v2_with_kakkyoku.csv');
const BANK_PATH = join(ROOT, 'data', 'kaisetsu', 'kaisetsu_bank_v1.json');
const OUT_DIR = join(ROOT, 'data', 'kaisetsu');
const GEN_DIR = join(OUT_DIR, 'generated');

const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
const PALACE_JP = { kan: '坎', gon: '艮', shin: '震', son: '巽', ri: '離', kun: '坤', da: '兌', ken: '乾' };

const V1_CAUTION_RATE = 0.902; // build_stats_v1.json（ビフォー比較用）

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

/** 禁止表現の混入を数える */
function forbiddenHits(text) {
  return FORBIDDEN_EXPRESSIONS.filter((w) => text.includes(w));
}

/**
 * 「には注意」直前が（登録 caution ＝名詞句）でない破綻を数える。
 * 新仕様では「ただし、{caution}には注意」型のみが「には注意」を生む。
 */
function niChuuiBreaks(text, cautionSet) {
  let breaks = 0;
  let idx = 0;
  while ((idx = text.indexOf('には注意', idx)) !== -1) {
    const before = text.slice(0, idx);
    const m = before.match(/ただし、(.+)$/u);
    const cand = m ? m[1] : null;
    if (!cand || !cautionSet.has(cand)) breaks += 1;
    idx += 4;
  }
  return breaks;
}

function main() {
  const rows = loadRows();
  const bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
  if (!bank || !bank.skeletons) {
    throw new Error(`文言バンクが不正です: ${BANK_PATH}`);
  }

  const cautionSet = new Set([
    ...Object.values(bank.vetoes || {}).map((v) => v.caution),
    ...Object.values(bank.gods || {}).map((g) => g.caution),
  ].filter(Boolean));

  const generated = {};
  const lengths = [];
  let emptyCount = 0;
  let formatErrorCount = 0;
  let over160 = 0;
  let forbiddenCount = 0;
  let breakCount = 0;
  let shortMismatch = 0;
  const reasonSrc = { shoui: 0, use: 0, gate: 0, star: 0 };
  // 3文目内訳（注意 veto / 注意 god / 補足 gate / なし）
  const thirdSrc = { veto: 0, god: 0, gate: 0, none: 0 };
  // 160字ガード発動内訳（段階別 / 発動した門キー別）
  const guardStage = { drop_third: 0, trim_reason: 0, replace_gate: 0 };
  const guardByGate = {};
  const FORMAT_BAD = /。。|、。|undefined|null/;

  // 代表5局の選定（v1 と同一・出現順で最初に条件を満たす局）
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
        const { full, short, reasonSrc: rsrc, thirdSrc: tsrc, guard, length } = composeDetail(judgment, axis, bank);
        axisTexts[axis] = { full, short };
        lengths.push(length);
        if (reasonSrc[rsrc] !== undefined) reasonSrc[rsrc] += 1;
        if (thirdSrc[tsrc] !== undefined) thirdSrc[tsrc] += 1;
        if (guard && guard !== 'none') {
          guardStage[guard] += 1;
          guardByGate[judgment.gate] = (guardByGate[judgment.gate] || 0) + 1;
        }
        if (!full || full.length === 0) emptyCount += 1;
        if (FORMAT_BAD.test(full)) formatErrorCount += 1;
        if (length > 160) over160 += 1;
        // short は full の1文目と完全一致していなければならない
        if (`${full.split('。')[0]}。` !== short) shortMismatch += 1;
        const fh = forbiddenHits(full).length + forbiddenHits(short).length;
        if (fh > 0) forbiddenCount += 1;
        breakCount += niChuuiBreaks(full, cautionSet);
      }
      byPalace[palace] = axisTexts;
    }
    generated[row.key] = byPalace;

    const bl = row.ban_level || '';
    if (!samples.fukugin && bl.includes('伏吟')) samples.fukugin = row.key;
    if (!samples.hangin && bl.includes('反吟')) samples.hangin = row.key;
    if (!samples.manyMaru && maru >= 3 && row.key !== samples.teibo) samples.manyMaru = row.key;
    if (!samples.manyBatsu && batsu >= 6 && row.key !== samples.teibo) samples.manyBatsu = row.key;
  }

  const total = lengths.length;
  const sum = lengths.reduce((a, b) => a + b, 0);
  const cautionCount = thirdSrc.veto + thirdSrc.god;
  const cautionRate = Math.round((cautionCount / total) * 1000) / 1000;
  const stats = {
    generated_at_note: 'タイムスタンプは決定性のため記録しない（同入力→同出力）',
    bank_version: bank.meta?.version || null,
    total,
    patterns: 'full(3文構成) / short(結論1文・full の1文目と一致)',
    length: {
      min: Math.min(...lengths),
      avg: Math.round((sum / total) * 10) / 10,
      max: Math.max(...lengths),
      over_160: over160,
    },
    caution: {
      rate_v2: cautionRate,
      rate_v1: V1_CAUTION_RATE,
      delta: Math.round((cautionRate - V1_CAUTION_RATE) * 1000) / 1000,
      by_source: { veto: thirdSrc.veto, god: thirdSrc.god },
      note: 'v2: 注意文は ◎/○ のみ（rank×▲は生成しない）。◎/○は実データ上 veto を持たないため veto 由来は0、god 由来のみ発火する。',
    },
    third_sentence_src: thirdSrc,
    length_guard: {
      total: guardStage.drop_third + guardStage.trim_reason + guardStage.replace_gate,
      by_stage: guardStage,
      by_gate: guardByGate,
    },
    reason_src: reasonSrc,
    fallback_rate_b_c: Math.round(((reasonSrc.gate + reasonSrc.star) / total) * 1000) / 1000,
    checks: {
      empty_count: emptyCount,
      format_error_count: formatErrorCount,
      over_160_count: over160,
      forbidden_expression_count: forbiddenCount,
      ni_chuui_break_count: breakCount,
      short_mismatch_count: shortMismatch,
    },
    ok: emptyCount === 0 && formatErrorCount === 0 && over160 === 0
      && forbiddenCount === 0 && breakCount === 0 && shortMismatch === 0,
  };

  // ---- 出力 ----
  mkdirSync(GEN_DIR, { recursive: true });
  writeFileSync(join(GEN_DIR, 'kaisetsu_text_v2.json'), JSON.stringify(generated) + '\n');
  writeFileSync(join(OUT_DIR, 'build_stats_v2.json'), JSON.stringify(stats, null, 2) + '\n');
  writeFileSync(join(OUT_DIR, 'sample_review_v2.md'), buildSampleReview(samples, generated, bank));

  // ---- コンソール ----
  console.log('=== 解説全件再生成 (Phase 2.5) ===');
  console.log(`生成件数      : ${total}  (${rows.length}局 × ${PALACES.length}宮 × ${AXES.length}軸)`);
  console.log(`文字数 min/avg/max : ${stats.length.min} / ${stats.length.avg} / ${stats.length.max}  (160超: ${over160})`);
  console.log(`注意文 出現率 : ${(cautionRate * 100).toFixed(1)}%  (v1: ${(V1_CAUTION_RATE * 100).toFixed(1)}% / Δ${(stats.caution.delta * 100).toFixed(1)}pt)`);
  console.log(`3文目内訳     : ${JSON.stringify(thirdSrc)}`);
  console.log(`160字ガード   : ${stats.length_guard.total}  stage=${JSON.stringify(guardStage)}  gate=${JSON.stringify(guardByGate)}`);
  console.log(`理由文の内訳  : ${JSON.stringify(reasonSrc)}`);
  console.log(`禁止表現混入  : ${forbiddenCount}  / 「には注意」破綻: ${breakCount}  / short不一致: ${shortMismatch}`);
  console.log(`空文字 / 整形エラー : ${emptyCount} / ${formatErrorCount}  → ${stats.ok ? 'OK' : 'NG'}`);
  console.log(`代表5局        : ${JSON.stringify(samples)}`);
  console.log('');
  console.log('出力: data/kaisetsu/generated/kaisetsu_text_v2.json (gitignore) / build_stats_v2.json / sample_review_v2.md');
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
  lines.push('# 解説サンプルレビュー v2（Phase 2.5）');
  lines.push('');
  lines.push('固定の代表5局の全方位×全軸。文章品質レビュー用（ぶりちゃん確認）。');
  lines.push('各セルは full（3文構成）／ 短: short（結論1文）の併記。');
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
      const cells = AXES.map((a) => {
        const { full, short } = generated[key][palace][a];
        return `${full}<br>短: ${short}`.replace(/\|/g, '/');
      });
      lines.push(`| ${PALACE_JP[palace]}(${palace}) | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

main();
