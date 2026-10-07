// scripts/build_rare_days.mjs
// 稀日（満盤・極盤・双格）を、先に数えて表にしておく。
//
//   実行: npm run build:rare   （node scripts/build_rare_days.mjs）
//   出力（コミットする）: src/reverseDirection/rareDays.generated.js
//     … RARE_TABLE = { min, max, events: [{ t: 種類, d: 日付, h: 時間帯（極盤・双格は null）, n: 格局の名前, s: [[宮, 点数, 格局, 門], …] }] }
//
// 先に作っておく理由: 「今年はあと何回」を出すには1年ぶんの時盤（4,380盤）を数える必要があり、
// 画面でその場で数えると数秒かかる。表にしておけば、引くだけで済む。
// 数え方はアプリと同じ関数（rareDays.computeRareEvents）。点数や格局をここで決め直すことはしない。
// 盤の計算（src/kimon）は Vite の ?raw で CSV を読むので、Vite を通して呼ぶ（build_line_today.mjs と同じ）。
//
// 点数の表・格局の判定・暦を変えたら、作り直す（test/rareDays.test.js が、表と実際の盤のずれを見つける）。

import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = join(ROOT, 'src', 'reverseDirection', 'rareDays.generated.js');

// はじめて作るとき用: rareDays.js が表を読むので、空の表を置いてから読み込む
if (!existsSync(OUT_PATH)) writeFileSync(OUT_PATH, "export const RARE_TABLE = { min: '', max: '', events: [] };\n");

const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});

try {
  const { computeRareEvents, compact, daysBetween, RARE_TIERS } = await server.ssrLoadModule('/src/reverseDirection/rareDays.js');
  const { dayKyokusuRange } = await server.ssrLoadModule('/src/kimon/loadDayKyokusu.js');

  // 期間はアプリの日盤と同じ（2026-01-01〜2044-01-31）。1年ずつ数える。
  const { min, max } = dayKyokusuRange();
  const total = daysBetween(min, max) + 1;
  const events = [];
  for (let offset = 0; offset < total; offset += 366) {
    const start = new Date(Date.parse(`${min}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
    events.push(...computeRareEvents({ startDate: start, days: Math.min(366, total - offset) }));
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  const lines = events.map((event) => `    ${JSON.stringify(compact(event))},`);
  writeFileSync(OUT_PATH, [
    '// 稀日（満盤・極盤・双格）の表。scripts/build_rare_days.mjs が作る。手で直さない。',
    '// 作り直す: npm run build:rare',
    'export const RARE_TABLE = {',
    `  min: '${min}',`,
    `  max: '${max}',`,
    '  events: [',
    ...lines,
    '  ],',
    '};',
    '',
  ].join('\n'));

  const years = total / 365.25;
  const counts = {};
  for (const event of events) counts[event.tier] = (counts[event.tier] || 0) + 1;
  console.log(`[rare-days] ${min}〜${max}（${years.toFixed(1)}年）の稀日 ${events.length}件を書き出しました`);
  for (const tier of Object.values(RARE_TIERS)) {
    console.log(`  ${tier.name}: ${counts[tier.key] || 0}件 → 1年に ${((counts[tier.key] || 0) / years).toFixed(1)}回（画面の表示: ${tier.rarity}）`);
  }
} finally {
  await server.close();
}
