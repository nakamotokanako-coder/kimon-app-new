// scripts/build_line_today.mjs
// LINE で返す吉方位の内容を、先に表にしておく。
//
//   実行: node scripts/build_line_today.mjs
//   出力（コミットしない・.gitignore 済）:
//     data/line/generated/today.json
//       … { min, max, dirs: ['北', '北東', …],
//           entries: [同じ内容を1つにまとめた中身。下の3つの表はここの番号を持つ],
//           time:    { 'YYYY-MM-DD': [時間帯12個ぶんの番号] }  … 時盤で一番点数の高い吉方位
//           day:     { 'YYYY-MM-DD': 番号 }                    … 日盤で一番点数の高い吉方位
//           dayDirs: { 'YYYY-MM-DD': [8方位ぶんの番号] } }     … 日盤の方位ごとの点数（吉でない方位は -1）
//       一番の吉方位の中身は { dir, score, badge, gate, theme, vetoes, others }（吉方位なしは { dir: null }）。
//       方位ごとの点数の中身は { score, badge }。
//       時間帯の並びは TIME_SLOTS、方位の並びは PALACE_DIRECTIONS と同じ。
//
// 中身は、アプリの画面と同じ関数（buildReverseBoard / buildDayReverseBoard / getMiniBoardToneClass）で
// 出したもの。点数や吉凶をここで決め直すことはしない。
//
// 先に作っておく理由: 盤の計算（src/kimon）は Vite の ?raw で CSV を読むため、
// サーバーの関数（api/）からは直接呼べない。ここだけ Vite を通して呼び、結果を JSON にする。
// LINE への返信（lib/billingApi/line.js）は、この JSON を引くだけ。

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data', 'line', 'generated');
const OUT_PATH = join(OUT_DIR, 'today.json');

const nextDate = (date) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});

try {
  const {
    buildReverseBoard, buildDayReverseBoard, getMiniBoardToneClass, TIME_SLOTS, PALACE_DIRECTIONS,
  } = await server.ssrLoadModule('/src/reverseDirection/reverseDirection.js');
  const { BADGE_LABEL } = await server.ssrLoadModule('/src/reverseDirection/FusionCard.jsx');
  const { GATE_ICONS, THEME_MARKS } = await server.ssrLoadModule('/src/reverseDirection/CompassWheel.jsx');
  const { dayKyokusuRange } = await server.ssrLoadModule('/src/kimon/loadDayKyokusu.js');

  // 期間はアプリの日盤と同じ（2026-01-01〜2044-01-31）。
  const { min, max } = dayKyokusuRange();
  const entries = [];
  const indexOf = new Map();
  const put = (entry) => {
    const key = JSON.stringify(entry);
    if (!indexOf.has(key)) {
      indexOf.set(key, entries.length);
      entries.push(entry);
    }
    return indexOf.get(key);
  };

  // 点数がプラスでも、三大凶格で「凶」の印が付く方位は吉方位として返さない。
  const goodOnly = (rankings) => rankings
    .map((item) => ({ item, badge: BADGE_LABEL[getMiniBoardToneClass(item.score, item.palaceScore)] || '' }))
    .filter(({ item, badge }) => item.score > 0 && badge !== BADGE_LABEL.kyo);

  const bestEntry = (good) => {
    if (!good.length) return { dir: null };
    const [{ item: best, badge }] = good;
    const gate = best.palaceData?.hachimon || '';
    return {
      dir: best.label,
      score: best.score,
      badge,
      gate,
      theme: THEME_MARKS[GATE_ICONS[gate]]?.label || '',
      vetoes: best.vetoes || [],
      // 2番目・3番目の吉方位（一番の方位へ行けないとき用）
      others: good.slice(1, 3).map(({ item }) => item.label),
    };
  };

  const time = {};
  const day = {};
  const dayDirs = {};
  let skipped = 0;
  for (let date = min; date <= max; date = nextDate(date)) {
    time[date] = TIME_SLOTS.map((slot) => {
      try {
        return put(bestEntry(goodOnly(buildReverseBoard({ date, hour: slot.hour }).rankings)));
      } catch {
        skipped += 1;
        return -1; // 盤を作れなかった時間帯（返信では「まだ用意できていません」）
      }
    });
    try {
      const good = goodOnly(buildDayReverseBoard({ date }).rankings);
      day[date] = put(bestEntry(good));
      dayDirs[date] = PALACE_DIRECTIONS.map((direction) => {
        const hit = good.find(({ item }) => item.palace === direction.palace);
        return hit ? put({ score: hit.item.score, badge: hit.badge }) : -1;
      });
    } catch {
      skipped += 1;
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const dirs = PALACE_DIRECTIONS.map((direction) => direction.label);
  writeFileSync(OUT_PATH, JSON.stringify({ min, max, dirs, entries, time, day, dayDirs }));
  console.log(`[line-today] ${min}〜${max} の ${Object.keys(time).length}日ぶんを書き出しました（内容の種類: ${entries.length}）`);
  if (skipped) console.warn(`[line-today] 盤を作れなかった日・時間帯: ${skipped}`);
} finally {
  await server.close();
}
