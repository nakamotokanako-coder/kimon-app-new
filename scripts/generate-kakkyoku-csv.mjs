// scripts/generate-kakkyoku-csv.mjs
// chito_v2.csv に十干剋応列・格局列を追加した chito_v2_with_kakkyoku.csv を生成
// 用途: 先生レビュー用の叩き台 + アプリ起動時 lookup の高速化
// 実行: npx vite-node scripts/generate-kakkyoku-csv.mjs
//
// 重要な変更（2026-05-12）:
// - 十干剋応列 (jukkan_kokuou_*) と格局列 (kakkyoku_*) を分離
// - 以下の格局は十干剋応と重複するため格局判定から削除:
//   青龍返首・飛鳥跌穴・焚入太白・太白入熒・刑格・大格・戦格・小格
// - これらは jukkan_kokuou_* 列に表示される

import Papa from 'papaparse';
import { detectPalaceKakkyoku, detectBoardKakkyoku } from '../src/kimon/kakkyoku.js';
import { lookupJukkanKokuouMulti } from '../src/kimon/jukkanKokuou.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const INPUT_PATH = path.join(PROJECT_ROOT, 'data', 'chito_v2.csv');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'data', 'chito_v2_with_kakkyoku.csv');

const PALACE_NAMES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];

// ============================================================
// メイン処理
// ============================================================

function main() {
  console.log(`Reading: ${INPUT_PATH}`);
  const csvText = fs.readFileSync(INPUT_PATH, 'utf-8');
  const { data, errors } = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (errors.length > 0) {
    console.warn(`CSV parse warnings: ${errors.length}`);
    errors.slice(0, 3).forEach(e => console.warn('  ', e));
  }

  console.log(`Total rows: ${data.length}`);

  // 統計用カウンタ
  const stats = {
    total: 0,
    with_jukkan_kichi: 0,  // 十干剋応で〇を含む盤
    with_jukkan_kyo: 0,    // 十干剋応で×を含む盤
    with_kichi: 0,         // 格局で吉を含む盤
    with_kyo: 0,           // 格局で凶を含む盤
    with_ban_level: 0,
    jukkan_counts: {},     // 十干剋応の出現回数
    kakkyoku_counts: {},   // 格局の出現回数
  };

  const enriched = data.map((row, idx) => {
    if (!row.key) return row;
    stats.total++;

    // 盤を組み立てる
    const palaces = {};
    for (const p of PALACE_NAMES) {
      palaces[p] = {
        tenban: row[`tenban_${p}`] || '',
        chiban: row[`chiban_${p}`] || '',
        kyusei: row[`kyusei_${p}`] || '',
        hasshin: row[`hasshin_${p}`] || '',
        hachimon: row[`hachimon_${p}`] || '',
      };
    }

    // key から時干支を抽出（例: "陽4局壬子" → "壬子"）
    const etoMatch = row.key.match(/[陰陽]\d局(.+)$/);
    const eto_time = etoMatch ? etoMatch[1] : '';

    const boardMeta = {
      junshu: row.junshu,
      chokushi: row.chokushi,
      eto_time,
      boardType: '時',
    };

    const result = { ...row };
    let hasJukkanKichi = false, hasJukkanKyo = false;
    let hasKichi = false, hasKyo = false;

    // 1宮ずつ：十干剋応 → 格局 の順で処理
    for (const p of PALACE_NAMES) {
      // 十干剋応（天盤×地盤）
      const jukkanResults = lookupJukkanKokuouMulti(palaces[p].tenban, palaces[p].chiban);
      result[`jukkan_kokuou_${p}`] = jukkanResults.map(j => `${j.kikkyo}${j.name}`).join(';');
      for (const j of jukkanResults) {
        stats.jukkan_counts[j.name] = (stats.jukkan_counts[j.name] || 0) + 1;
        if (j.kikkyo === '〇') hasJukkanKichi = true;
        if (j.kikkyo === '×') hasJukkanKyo = true;
      }

      // 格局（複合条件）
      const kakkyokuResults = detectPalaceKakkyoku(palaces[p], p, boardMeta);
      result[`kakkyoku_${p}`] = kakkyokuResults.map(x => {
        const prefix = x.kichi_kyo === 'kichi' ? '◯' : '×';
        stats.kakkyoku_counts[x.name] = (stats.kakkyoku_counts[x.name] || 0) + 1;
        if (x.kichi_kyo === 'kichi') hasKichi = true;
        else hasKyo = true;
        return `${prefix}${x.name}`;
      }).join(';');
    }

    // 盤レベル
    const banLevel = detectBoardKakkyoku({ meta: boardMeta, palaces });
    result.ban_level = banLevel.map(x => x.name).join(';');
    if (banLevel.length > 0) stats.with_ban_level++;
    if (hasJukkanKichi) stats.with_jukkan_kichi++;
    if (hasJukkanKyo) stats.with_jukkan_kyo++;
    if (hasKichi) stats.with_kichi++;
    if (hasKyo) stats.with_kyo++;

    return result;
  });

  // CSV 書き出し（UTF-8 BOM付き、Excel対応）
  const csv = Papa.unparse(enriched, { newline: '\n' });
  fs.writeFileSync(OUTPUT_PATH, '\ufeff' + csv, 'utf-8');
  console.log(`Written: ${OUTPUT_PATH}`);

  // 統計表示
  console.log('\n=== 統計 ===');
  console.log(`総盤数: ${stats.total}`);
  console.log(`[十干剋応] 〇を含む盤: ${stats.with_jukkan_kichi} (${(stats.with_jukkan_kichi/stats.total*100).toFixed(1)}%)`);
  console.log(`[十干剋応] ×を含む盤: ${stats.with_jukkan_kyo} (${(stats.with_jukkan_kyo/stats.total*100).toFixed(1)}%)`);
  console.log(`[格局] 吉格を含む盤: ${stats.with_kichi} (${(stats.with_kichi/stats.total*100).toFixed(1)}%)`);
  console.log(`[格局] 凶格を含む盤: ${stats.with_kyo} (${(stats.with_kyo/stats.total*100).toFixed(1)}%)`);
  console.log(`盤レベル格局を含む盤: ${stats.with_ban_level} (${(stats.with_ban_level/stats.total*100).toFixed(1)}%)`);

  console.log('\n=== 十干剋応 出現ランキング Top 15 ===');
  const sortedJukkan = Object.entries(stats.jukkan_counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [name, count] of sortedJukkan) {
    console.log(`  ${name}: ${count}`);
  }

  console.log('\n=== 格局 出現ランキング Top 15 ===');
  const sortedKakkyoku = Object.entries(stats.kakkyoku_counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [name, count] of sortedKakkyoku) {
    console.log(`  ${name}: ${count}`);
  }
}

main();
