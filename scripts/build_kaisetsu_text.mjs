// scripts/build_kaisetsu_text.mjs
// 解説文（v3・4段落の文章）の全件生成＋検証。
// 全1080局 × 8方位 × 願い5軸 = 43,200件の解説文（short/mid/full）をビルド時に生成する。
//
//   実行: node scripts/build_kaisetsu_text.mjs
//   出力（コミットしない・.gitignore 済）:
//     data/kaisetsu/generated/kaisetsu_text_v2.json
//       … { 局key: { palace: { axisRanks, axis: { short, mid, full } } } }
//       （ファイル名は配信側 lib/kaisetsuData.js と合わせて据え置き。中身は v3 の文章）
//   出力（コミットする）:
//     data/kaisetsu/sample_review_v3.md … 固定の代表5局の全方位×全軸（人間レビュー用）
//     data/kaisetsu/build_stats_v3.json … 文字数の分布・部品の使われ方・検査の結果
//
// 文章の組み立ては src/kaisetsu/composeProse.js。部品は kaisetsu_bank_v3.json と
// kaisetsu_bank_v3_shoui.json（後者は scripts/build_shoui_v3.mjs が v1 から生成。ここで作り直して同期する）。
//
// 注: src/kimon・CSV・バンクは読み込み専用。生成物・バンクはクライアントバンドルに import しない
//     （ペイウォール資産。配信は api/kaisetsu*.js のサーバー関数経由）。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classifyPalace } from '../src/kaisetsu/classifyPalace.js';
import { composeProse, AXES, AXIS_LABELS, FORBIDDEN_EXPRESSIONS, MID_MAX, FULL_MAX } from '../src/kaisetsu/composeProse.js';
import { buildShouiV3 } from './build_shoui_v3.mjs';
import { TIME_ONLY_SHOUI } from '../src/kaisetsu/boardKey.js';
import { parseShoui } from '../src/kaisetsu/classifyPalace.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PATH = join(ROOT, 'data', 'chito_v2_with_kakkyoku.csv');
const OUT_DIR = join(ROOT, 'data', 'kaisetsu');
const GEN_DIR = join(OUT_DIR, 'generated');

const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
const PALACE_JP = { kan: '坎', gon: '艮', shin: '震', son: '巽', ri: '離', kun: '坤', da: '兌', ken: '乾' };

const len = (s) => [...String(s || '')].length;
const readJson = (name) => JSON.parse(readFileSync(join(OUT_DIR, name), 'utf8'));

export function loadRows() {
  const lines = readFileSync(CSV_PATH, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
  const headers = lines[0].replace(/^﻿/, '').split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}

/** 部品バンク一式。象意の文は v1 から作り直す（v1 を直したのに v3 が古いまま、を防ぐ）。 */
export function loadBank() {
  const v1 = readJson('kaisetsu_bank_v1.json');
  const { shoui, unresolved } = buildShouiV3(v1);
  if (unresolved.length) throw new Error(`象意の文の語尾を変換できません:\n${unresolved.join('\n')}`);
  return { v1, v3: readJson('kaisetsu_bank_v3.json'), shoui: { shoui } };
}

/** 文章の崩れ（置き換え漏れ・句読点の重なり・段落不足） */
export function formatProblems({ short, mid, full }) {
  const out = [];
  if (!short || !mid || !full) out.push('empty');
  if (/undefined|null|\{|\}|。。|、。|、、|\u0000/u.test(full)) out.push('format');
  if (full.split('\n\n').length < 3) out.push('paragraphs');
  if (!full.startsWith(`**${short}**\n\n`) || !mid.startsWith(`**${short}**`)) out.push('headline');
  if ((full.match(/\*\*/gu) || []).length !== 4) out.push('bold');
  if (len(full) > FULL_MAX) out.push('full_too_long');
  if (len(mid) > MID_MAX) out.push('mid_too_long');
  if (FORBIDDEN_EXPRESSIONS.some((w) => full.includes(w))) out.push('forbidden');
  if ((full.match(/ただし、/gu) || []).length > 1) out.push('double_tadashi');
  return out;
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
  const bank = loadBank();
  writeFileSync(join(OUT_DIR, 'kaisetsu_bank_v3_shoui.json'), `${JSON.stringify({
    meta: { version: 'v3', note: 'v1 の shoui[*].axes から scripts/build_shoui_v3.mjs で生成（手で編集しない）' },
    shoui: bank.shoui.shoui,
  }, null, 2)}\n`);

  const generated = {};
  // 日盤用の解説。時格・天羅・地網（時の干で決まる格局）が入っている宮は、それを外して作り直す。
  // 日盤では日の干で決まる格局（日格・伏干・雲干）も総合点に入るので、テーマ別の◎○×が時盤と変わる宮も作り直す。
  const dayOverrides = {};
  let dayCells = 0;
  const lengths = { short: [], mid: [], full: [] };
  const count = { tone: {}, veto: {}, shoui: {}, guard: {}, shouiLed: 0 };
  const problems = {};
  const samples = { teibo: '陰1局丁卯', fukugin: null, hangin: null, manyMaru: null, manyBatsu: null };
  const bump = (obj, k) => { obj[k] = (obj[k] || 0) + 1; };

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
        const d = composeProse(judgment, axis, bank);
        const { short, mid, full } = d;
        axisTexts[axis] = { short, mid, full };
        lengths.short.push(len(short));
        lengths.mid.push(len(mid));
        lengths.full.push(len(full));
        bump(count.tone, d.meta.tone);
        bump(count.veto, d.meta.veto || 'none');
        bump(count.shoui, d.meta.shoui);
        bump(count.guard, d.meta.guard);
        if (d.meta.shouiLed) count.shouiLed += 1;
        for (const p of formatProblems(d)) bump(problems, p);
      }
      byPalace[palace] = { axisRanks: judgment.axisRanks, ...axisTexts };

      const dayJudgment = classifyPalace(row, palace, { boardType: '日' });
      const dayDiffers = parseShoui(row, palace).some((item) => TIME_ONLY_SHOUI.includes(item.name))
        || AXES.some((axis) => dayJudgment.axisRanks[axis] !== judgment.axisRanks[axis]);
      if (dayDiffers) {
        const dayTexts = {};
        for (const axis of AXES) {
          const d = composeProse(dayJudgment, axis, bank);
          dayTexts[axis] = { short: d.short, mid: d.mid, full: d.full };
          dayCells += 1;
          for (const p of formatProblems(d)) bump(problems, `day_${p}`);
          if (/(^|[^一-鿿])(時格|天羅|地網)により/u.test(d.full)) bump(problems, 'day_time_only_shoui');
        }
        (dayOverrides[row.key] ||= {})[palace] = { axisRanks: dayJudgment.axisRanks, ...dayTexts };
      }
    }
    generated[row.key] = byPalace;

    const bl = row.ban_level || '';
    if (!samples.fukugin && bl.includes('伏吟')) samples.fukugin = row.key;
    if (!samples.hangin && bl.includes('反吟')) samples.hangin = row.key;
    if (!samples.manyMaru && maru >= 3 && row.key !== samples.teibo) samples.manyMaru = row.key;
    if (!samples.manyBatsu && batsu >= 6 && row.key !== samples.teibo) samples.manyBatsu = row.key;
  }

  const total = lengths.full.length;
  const problemCount = Object.values(problems).reduce((a, b) => a + b, 0);
  const stats = {
    generated_at_note: 'タイムスタンプは決定性のため記録しない（同入力→同出力）',
    bank_version: bank.v3.meta?.version || null,
    total,
    patterns: 'short(見出し) / mid(見出し＋主な理由) / full(4段落)',
    length: { short: dist(lengths.short), mid: dist(lengths.mid), full: dist(lengths.full) },
    parts: count,
    day_variant: { cells: dayCells, note: '日盤用の解説（時格・天羅・地網を外し、日の干で決まる格局を総合点に入れたもの）。時盤と違う宮だけ作る' },
    checks: { problems, limits: { mid: MID_MAX, full: FULL_MAX } },
    ok: problemCount === 0,
  };

  mkdirSync(GEN_DIR, { recursive: true });
  generated.__day = dayOverrides; // lib/kaisetsuData.js の DAY_OVERRIDES_KEY
  writeFileSync(join(GEN_DIR, 'kaisetsu_text_v2.json'), `${JSON.stringify(generated)}\n`);
  writeFileSync(join(OUT_DIR, 'build_stats_v3.json'), `${JSON.stringify(stats, null, 2)}\n`);
  writeFileSync(join(OUT_DIR, 'sample_review_v3.md'), buildSampleReview(samples, generated));

  console.log('=== 解説全件再生成 (v3) ===');
  console.log(`生成件数   : ${total}  (${rows.length}局 × ${PALACES.length}宮 × ${AXES.length}軸)`);
  console.log(`字数       : short ${JSON.stringify(stats.length.short)} / mid ${JSON.stringify(stats.length.mid)} / full ${JSON.stringify(stats.length.full)}`);
  console.log(`吉凶の内訳 : ${JSON.stringify(count.tone)}  / 象意主役 ${count.shouiLed}`);
  console.log(`拒否権     : ${JSON.stringify(count.veto)}`);
  console.log(`象意       : ${JSON.stringify(count.shoui)}  / 字数ガード ${JSON.stringify(count.guard)}`);
  console.log(`日盤用     : ${dayCells}件（時盤と違う宮だけ作り直し）`);
  console.log(`検査       : ${JSON.stringify(problems)}  → ${stats.ok ? 'OK' : 'NG'}`);
  console.log(`代表5局    : ${JSON.stringify(samples)}`);
  if (!stats.ok) process.exitCode = 1;
}

function buildSampleReview(samples, generated) {
  const order = [
    ['丁卯（標準例）', samples.teibo],
    ['伏吟局', samples.fukugin],
    ['反吟局', samples.hangin],
    ['◎が3宮以上', samples.manyMaru],
    ['×が6宮以上', samples.manyBatsu],
  ];
  const lines = ['# 解説サンプルレビュー v3（4段落の文章）', '',
    '固定の代表5局の全方位×全テーマ。文章の確認用。生成は決定的（同じ盤は何度生成しても同じ文）。', ''];
  for (const [label, key] of order) {
    lines.push(`## ${label}: ${key || '(該当局なし)'}`, '');
    if (!key || !generated[key]) { lines.push('（データなし）', ''); continue; }
    for (const palace of PALACES) {
      for (const axis of AXES) {
        const rank = generated[key][palace].axisRanks?.[axis] || '';
        lines.push(`### ${PALACE_JP[palace]}・${AXIS_LABELS[axis]} ${rank}`, '', generated[key][palace][axis].full, '');
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && process.argv[1].endsWith('build_kaisetsu_text.mjs')) main();
