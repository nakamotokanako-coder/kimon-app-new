// scripts/build_kaisetsu_text.mjs
// 解説生成エンジン full v2: 全件再生成＋検証。
// 全1080局 × 8方位 × 願い5軸 = 43,200件の解説文（short/mid/full の3パターン）をビルド時生成する。
//
//   実行: node scripts/build_kaisetsu_text.mjs
//   出力（コミットしない・.gitignore 済）:
//     data/kaisetsu/generated/kaisetsu_text_v2.json
//       … { 局key: { palace: { axisRanks, axis: { short, mid, full } } } }
//   出力（コミットする）:
//     data/kaisetsu/sample_review_v2_1.md … 固定の代表5局の全方位×全軸（short/mid/full 併記・人間レビュー用）
//     data/kaisetsu/build_stats_v2_1.json … short/mid/full の文字数分布・なのに文発動率(型別)・
//                                            行動提案/補強/general/hint/exception の採用率・
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

const len = (s) => [...String(s || '')].length;

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

/** 「には注意」直前が（登録 caution ＝名詞句）でない破綻を数える。 */
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

function dist(arr) {
  const sum = arr.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...arr),
    avg: Math.round((sum / arr.length) * 10) / 10,
    median: [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)],
    max: Math.max(...arr),
  };
}

function main() {
  const rows = loadRows();
  const bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
  if (!bank || !bank.skeletons) throw new Error(`文言バンクが不正です: ${BANK_PATH}`);

  const cautionSet = new Set([
    ...Object.values(bank.vetoes || {}).map((v) => v.caution),
    ...Object.values(bank.gods || {}).map((g) => g.caution),
  ].filter(Boolean));

  const generated = {};
  const shortLen = [];
  const midLen = [];
  const fullLen = [];
  let emptyCount = 0;
  let formatErrorCount = 0;
  let over320 = 0;
  let over160mid = 0;
  let forbiddenCount = 0;
  let breakCount = 0;
  let shortMismatch = 0; // short が mid/full の1文目と不一致
  const FORMAT_BAD = /。。|、。|undefined|null/;

  const nanoni = { none: 0, sukinai: 0, warukinai: 0 };
  const leadSrc = { veto: 0, shoui_up: 0, shoui: 0, gate: 0, star: 0 };
  const reinforceSrc = { god: 0, star: 0, none: 0 };
  const extraSrc = { hint: 0, exception: 0, none: 0 };
  const shimeSrc = { veto: 0, god: 0, fallback: 0, none: 0 };
  const fullGuard = { none: 0, drop_reinforce: 0, drop_nanoni: 0, drop_general: 0, drop_hint: 0, replace_lead: 0 };
  let generalUsed = 0;
  let actionUsed = 0;
  let actionSuppressedPalaces = 0; // ▲×∩吉門(kichi3/chukichi)＝actionsを出さない宮（v2.1 代替締め文の対象）
  // mid 由来（継続統計）
  const reasonSrc = { shoui: 0, use: 0, gate: 0, star: 0 };
  const thirdSrc = { veto: 0, god: 0, gate: 0, none: 0 };

  const samples = { teibo: '陰1局丁卯', fukugin: null, hangin: null, manyMaru: null, manyBatsu: null };

  for (const row of rows) {
    const byPalace = {};
    let maru = 0;
    let batsu = 0;
    for (const palace of PALACES) {
      const judgment = classifyPalace(row, palace);
      if (judgment.rank === '◎') maru += 1;
      if (judgment.rank === '×') batsu += 1;
      if ((judgment.rank === '▲' || judgment.rank === '×')
          && (judgment.gateClass === 'kichi3' || judgment.gateClass === 'chukichi')) actionSuppressedPalaces += 1;
      const axisTexts = {};
      for (const axis of AXES) {
        const d = composeDetail(judgment, axis, bank);
        const { short, mid, full } = d;
        axisTexts[axis] = { short, mid, full };
        shortLen.push(len(short));
        midLen.push(len(mid));
        fullLen.push(len(full));

        if (!full || len(full) === 0) emptyCount += 1;
        if (FORMAT_BAD.test(full)) formatErrorCount += 1;
        if (len(full) > 320) over320 += 1;
        if (len(mid) > 160) over160mid += 1;
        // short は mid・full の1文目と完全一致でなければならない
        if (short !== `${mid.split('。')[0]}。` || short !== `${full.split('。')[0]}。`) shortMismatch += 1;
        if (forbiddenHits(full).length + forbiddenHits(short).length > 0) forbiddenCount += 1;
        breakCount += niChuuiBreaks(full, cautionSet);

        nanoni[d.nanoniType] = (nanoni[d.nanoniType] || 0) + 1;
        leadSrc[d.leadSrc] = (leadSrc[d.leadSrc] || 0) + 1;
        reinforceSrc[d.reinforceSrc] = (reinforceSrc[d.reinforceSrc] || 0) + 1;
        extraSrc[d.extraSrc] = (extraSrc[d.extraSrc] || 0) + 1;
        shimeSrc[d.shimeSrc] = (shimeSrc[d.shimeSrc] || 0) + 1;
        fullGuard[d.fullGuard] = (fullGuard[d.fullGuard] || 0) + 1;
        if (d.generalUsed) generalUsed += 1;
        if (d.actionUsed) actionUsed += 1;
        if (reasonSrc[d.reasonSrc] !== undefined) reasonSrc[d.reasonSrc] += 1;
        if (thirdSrc[d.thirdSrc] !== undefined) thirdSrc[d.thirdSrc] += 1;
      }
      byPalace[palace] = { axisRanks: judgment.axisRanks, ...axisTexts };
    }
    generated[row.key] = byPalace;

    const bl = row.ban_level || '';
    if (!samples.fukugin && bl.includes('伏吟')) samples.fukugin = row.key;
    if (!samples.hangin && bl.includes('反吟')) samples.hangin = row.key;
    if (!samples.manyMaru && maru >= 3 && row.key !== samples.teibo) samples.manyMaru = row.key;
    if (!samples.manyBatsu && batsu >= 6 && row.key !== samples.teibo) samples.manyBatsu = row.key;
  }

  const total = fullLen.length;
  const round = (x) => Math.round(x * 1000) / 1000;
  const nanoniFired = nanoni.sukinai + nanoni.warukinai;
  const stats = {
    generated_at_note: 'タイムスタンプは決定性のため記録しない（同入力→同出力）',
    bank_version: bank.meta?.version || null,
    total,
    patterns: 'short(結論1文) / mid(現行3文・文面不変) / full(v2・5〜6文の鑑定文)',
    length: {
      short: dist(shortLen),
      mid: { ...dist(midLen), over_160: over160mid },
      full: {
        ...dist(fullLen),
        over_320: over320,
        band_220_280: round(fullLen.filter((x) => x >= 220 && x <= 280).length / total),
        under_220: round(fullLen.filter((x) => x < 220).length / total),
      },
    },
    nanoni: {
      by_type: nanoni,
      rate: round(nanoniFired / total),
      note: '好材料負け型=宮ローカル拒否権∩(kichi3門 or 実吉神5)。盤全体(伏吟/反吟)は対象外。悪材料負け型=◎○∩凶神。',
    },
    full_slots: {
      lead_src: leadSrc,
      reinforce_src: reinforceSrc,
      extra_src: extraSrc,            // 追加スロット: hint / exception
      general_rate: round(generalUsed / total),
      action_rate: round(actionUsed / total),
      action_suppressed_palaces: actionSuppressedPalaces,
      action_suppressed_note: '▲×∩吉門(kichi3/chukichi)はactionsを出さない（吉前提文体が凶宮の結論と矛盾するため）。v2.1で代替締め文を入れる対象宮。',
      shime_src: shimeSrc,
      fallback_closing_adopted: shimeSrc.fallback, // v2.1: 行動提案を出せない宮で代替締め文を採用したセル数
      fallback_closing_note: 'fullのみ。▲×∩吉門で行動提案を出せない宮の締めに fallbackClosings を充当（死門は除外・hash決定的選択）。',
      guard: fullGuard,
    },
    mid_continuity: { reason_src: reasonSrc, third_sentence_src: thirdSrc },
    checks: {
      empty_count: emptyCount,
      format_error_count: formatErrorCount,
      over_320_count: over320,
      over_160_mid_count: over160mid,
      forbidden_expression_count: forbiddenCount,
      ni_chuui_break_count: breakCount,
      short_mismatch_count: shortMismatch,
    },
    ok: emptyCount === 0 && formatErrorCount === 0 && over320 === 0 && over160mid === 0
      && forbiddenCount === 0 && breakCount === 0 && shortMismatch === 0,
  };

  // ---- 出力 ----
  mkdirSync(GEN_DIR, { recursive: true });
  writeFileSync(join(GEN_DIR, 'kaisetsu_text_v2.json'), JSON.stringify(generated) + '\n');
  writeFileSync(join(OUT_DIR, 'build_stats_v2_1.json'), JSON.stringify(stats, null, 2) + '\n');
  writeFileSync(join(OUT_DIR, 'sample_review_v2_1.md'), buildSampleReview(samples, generated, bank, rows));

  // ---- コンソール ----
  console.log('=== 解説全件再生成 (full v2) ===');
  console.log(`生成件数      : ${total}  (${rows.length}局 × ${PALACES.length}宮 × ${AXES.length}軸)`);
  console.log(`short 字数    : ${JSON.stringify(stats.length.short)}`);
  console.log(`mid   字数    : ${JSON.stringify(stats.length.mid)}`);
  console.log(`full  字数    : ${JSON.stringify(stats.length.full)}`);
  console.log(`なのに文      : ${JSON.stringify(nanoni)}  発火率 ${(stats.nanoni.rate * 100).toFixed(1)}%`);
  console.log(`主役内訳      : ${JSON.stringify(leadSrc)}`);
  console.log(`補強内訳      : ${JSON.stringify(reinforceSrc)}  / 追加 ${JSON.stringify(extraSrc)}  / general率 ${(stats.full_slots.general_rate * 100).toFixed(1)}%`);
  console.log(`締め内訳      : ${JSON.stringify(shimeSrc)}  / 行動提案率 ${(stats.full_slots.action_rate * 100).toFixed(1)}%`);
  console.log(`字数ガード    : ${JSON.stringify(fullGuard)}`);
  console.log(`禁止表現混入  : ${forbiddenCount}  / 「には注意」破綻: ${breakCount}  / short不一致: ${shortMismatch}`);
  console.log(`空文字 / 整形 / 320超 / mid160超 : ${emptyCount} / ${formatErrorCount} / ${over320} / ${over160mid}  → ${stats.ok ? 'OK' : 'NG'}`);
  console.log(`代表5局        : ${JSON.stringify(samples)}`);
  console.log('');
  console.log('出力: data/kaisetsu/generated/kaisetsu_text_v2.json (gitignore) / build_stats_v2_1.json / sample_review_v2_1.md');
}

function buildSampleReview(samples, generated, bank, rows) {
  const labels = bank.axisLabels;
  const order = [
    ['丁卯（標準例）', samples.teibo],
    ['伏吟局', samples.fukugin],
    ['反吟局', samples.hangin],
    ['◎が3宮以上', samples.manyMaru],
    ['×が6宮以上', samples.manyBatsu],
  ];
  const lines = [];
  lines.push('# 解説サンプルレビュー v2（full v2・5〜6文）');
  lines.push('');
  lines.push(`バンク version: ${bank.meta?.version}。固定の代表5局の全方位×全軸。文章品質レビュー用（ぶりちゃん確認）。`);
  lines.push('各セルは full（5〜6文の鑑定文）／ 中: mid（3文・歩運/ライト用）／ 短: short（結論1文）の3併記。');
  lines.push('生成は決定的（同じ盤は何度生成しても同じ文）。');
  lines.push('');

  for (const [label, key] of order) {
    lines.push(`## ${label}: ${key || '(該当局なし)'}`);
    lines.push('');
    if (!key || !generated[key]) { lines.push('（データなし）', ''); continue; }
    lines.push(`| 宮 | ${AXES.map((a) => labels[a]).join(' | ')} |`);
    lines.push(`|---|${AXES.map(() => '---').join('|')}|`);
    for (const palace of PALACES) {
      const cells = AXES.map((a) => {
        const { full, mid, short } = generated[key][palace][a];
        return `${full}<br>中: ${mid}<br>短: ${short}`.replace(/\|/g, '/');
      });
      lines.push(`| ${PALACE_JP[palace]}(${palace}) | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

main();
