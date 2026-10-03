import { buildReverseBoard, PALACE_DIRECTIONS, TIME_SLOTS } from './reverseDirection.js';
import { addDays, buildPeriodRange, hasBadElement } from './strongestRanking.js';

export const DEFAULT_SANBAN_THRESHOLD = 80;
export const BAD_HACHIMON = new Set(['傷門', '杜門', '驚門', '死門']);

const PALACE_ORDER = PALACE_DIRECTIONS.map((item) => item.palace);

function compareDirections(a, b) {
  return b.score - a.score || PALACE_ORDER.indexOf(a.palace) - PALACE_ORDER.indexOf(b.palace);
}

/**
 * ルートの名前。3つの時間帯で続く門の顔ぶれで決める（ルートに入るのは吉門だけ）。
 *   生門が2つ以上 → 億万長者ルート（財を生む門が続く）
 *   休門が2つ以上 → シンデレラルート（縁と和合の門が続く）
 *   開門が2つ以上 → 成り上がりルート（道を開く門が続く）
 *   それ以外（景門が多い・3つとも違う門） → 人生大逆転ルート（違う吉が入れ替わりで続く）
 * 3つとも同じ門なら triple=true（例: 開門・開門・開門）。
 * 名前は門の傾向を表す愛称で、結果を約束するものではない。
 */
export const SANBAN_ROUTE_NAMES = {
  '生門': { name: '億万長者ルート', tagline: '財を生む生門が続く、お金を育てる流れ' },
  '休門': { name: 'シンデレラルート', tagline: '和合の休門が続く、良縁を引き寄せる流れ' },
  '開門': { name: '成り上がりルート', tagline: '道を開く開門が続く、仕事で上を目指す流れ' },
};
const SANBAN_ROUTE_DEFAULT = { name: '人生大逆転ルート', tagline: '違う吉門が入れ替わりで続く、流れを一気に変える巡り' };

export function sanbanRouteName(slots) {
  const gates = (slots || []).map((slot) => slot.hachimon).filter(Boolean);
  const counts = {};
  for (const g of gates) counts[g] = (counts[g] || 0) + 1;
  const main = Object.keys(SANBAN_ROUTE_NAMES).find((g) => (counts[g] || 0) >= 2);
  const base = main ? SANBAN_ROUTE_NAMES[main] : SANBAN_ROUTE_DEFAULT;
  return { ...base, gate: main || null, triple: gates.length === 3 && new Set(gates).size === 1 };
}

export function isUsableDirection(candidate, threshold = DEFAULT_SANBAN_THRESHOLD) {
  if (!candidate) return false;
  if (BAD_HACHIMON.has(candidate.hachimon || candidate.palaceData?.hachimon)) return false;
  if (hasBadElement(candidate)) return false;
  return candidate.score >= threshold;
}

export function findBestRouteForDay(date, slots, threshold = DEFAULT_SANBAN_THRESHOLD) {
  const usableSlots = slots.map((slot) => ({
    ...slot,
    usable: (slot.rankings || [])
      .filter((candidate) => isUsableDirection(candidate, threshold))
      .sort(compareDirections),
  }));

  const routes = [];
  // 1日の中だけで完結させる。亥時から翌日の子時へは接続しない。
  for (let index = 0; index <= usableSlots.length - 3; index += 1) {
    const window = usableSlots.slice(index, index + 3);
    if (window.some((slot) => slot.usable.length === 0)) continue;
    const routeSlots = window.map((slot) => {
      const best = slot.usable[0];
      return {
        hour: slot.hour,
        label: slot.label,
        palace: best.palace,
        direction: best.label,
        score: best.score,
        hachimon: best.hachimon || best.palaceData?.hachimon || '',
      };
    });
    const starCount = routeSlots.filter((slot) => slot.score >= 100).length;
    routes.push({
      date,
      routeName: sanbanRouteName(routeSlots),
      slots: routeSlots,
      totalScore: routeSlots.reduce((sum, slot) => sum + slot.score, 0),
      starCount,
      hasStar: starCount > 0,
    });
  }

  return sortSanbanRoutes(routes)[0] || null;
}

/**
 * TIME_SLOTS は自然時の12時辰。通常の時盤画面と同じく、補正済みの時辰を
 * buildReverseBoard に渡す。correctionMinutes は検索結果の表示用にも保持する。
 */
export function buildSanbanDay({
  date,
  threshold = DEFAULT_SANBAN_THRESHOLD,
  correctionMinutes = 0,
  buildSlot = ({ date: slotDate, hour }) => buildReverseBoard({ date: slotDate, hour }),
}) {
  const slots = TIME_SLOTS.map((slot) => ({
    ...slot,
    rankings: buildSlot({ date, hour: slot.hour }).rankings,
  }));
  const route = findBestRouteForDay(date, slots, threshold);
  return route ? { ...route, correctionMinutes } : null;
}

export function sortSanbanRoutes(routes) {
  return [...routes].sort((a, b) => (
    b.totalScore - a.totalScore
    || b.starCount - a.starCount
    || a.date.localeCompare(b.date)
  ));
}

export function scanSanbanRoutes({
  startDate,
  days,
  threshold = DEFAULT_SANBAN_THRESHOLD,
  correctionMinutes = 0,
  buildDay = buildSanbanDay,
}) {
  const rows = [];
  const errors = [];
  const range = buildPeriodRange(startDate, days);
  for (let index = 0; index < range.days; index += 1) {
    const date = addDays(startDate, index);
    try {
      const route = buildDay({ date, threshold, correctionMinutes });
      if (route) rows.push(route);
    } catch (error) {
      errors.push({ date, message: error.message });
    }
  }
  return { range, rows: sortSanbanRoutes(rows), errors };
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 50 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export async function scanSanbanRoutesAsync({
  startDate,
  days,
  threshold = DEFAULT_SANBAN_THRESHOLD,
  correctionMinutes = 0,
  buildDay = buildSanbanDay,
  onProgress = () => {},
}) {
  const rows = [];
  const errors = [];
  const range = buildPeriodRange(startDate, days);
  for (let index = 0; index < range.days; index += 1) {
    const date = addDays(startDate, index);
    try {
      const route = buildDay({ date, threshold, correctionMinutes });
      if (route) rows.push(route);
    } catch (error) {
      errors.push({ date, message: error.message });
    }
    onProgress(index + 1, range.days);
    await yieldToBrowser();
  }
  return { range, rows: sortSanbanRoutes(rows), errors };
}
