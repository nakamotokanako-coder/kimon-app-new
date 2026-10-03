// 設定「通知」の2項目を、アプリを開いたときのお知らせ（ベルのマーク）として動かす。
//   - お守りリマインド: 今日まだ「開運のお守り」を引いていなければ知らせる
//   - お気に入りが最高方位になったら通知: 今の時間帯の最高方位に、お気に入りの場所があれば知らせる
// 端末に届くプッシュ通知ではなく、アプリを開いたときに計算して表示する（サーバーは使わない）。
import {
  buildReverseBoard,
  applyNaturalTime,
  getLongitudeCorrectionMinutes,
  getTimeSlotHour,
  getTimeSlotLabel,
} from '../reverseDirection/reverseDirection.js';
import { decoratePlaces, favoriteDisplayName, MAP_SEARCH_STORAGE_KEY } from '../reverseDirection/mapSearch.js';
import { getBoardDate } from '../utils/boardDate.js';

export const OMAMORI_OPENED_KEY = 'kimon-omamori-opened-date';
const BASE_POINT_KEY = 'kimon_go_base_point_v1';
const DEFAULT_BASE = { name: '東京', latitude: 35.6812, longitude: 139.7671 };

function readJson(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

/** 「開運のお守り」を開いた日を記録する（LuckyOmamoriBar から呼ぶ） */
export function markOmamoriOpened(date = getBoardDate()) {
  try {
    window.localStorage.setItem(OMAMORI_OPENED_KEY, date);
  } catch {
    // 保存できなくても動作に影響しない
  }
}

function slashDate(date) {
  return String(date).replaceAll('-', '/');
}

export function buildOmamoriNotice({ today, openedDate }) {
  if (openedDate === today) return null;
  return {
    id: `omamori-${today}`,
    type: 'history',
    sender: 'リマインド',
    title: '今日のお守りをまだ引いていません',
    body: '吉方位タブの「開運のお守り」をタップすると、今日のお告げを引けます。',
    date: slashDate(today),
  };
}

export function buildFavoriteNotices({ today, slotHour, rankings, base, favorites }) {
  const best = (rankings || [])[0];
  if (!best || best.score <= 0) return [];
  const center = [base.latitude, base.longitude];
  return decoratePlaces(favorites, center, rankings)
    .filter((place) => place.direction?.palace === best.palace)
    .slice(0, 3)
    .map((place) => ({
      id: `favorite-best-${today}-${slotHour}-${place.latitude},${place.longitude}`,
      type: 'history',
      sender: 'お気に入り',
      title: `「${favoriteDisplayName(place)}」が今の最高方位です`,
      body: `${getTimeSlotLabel(slotHour)}の時間帯は、${base.name}から見て${best.label}（${best.score > 0 ? '+' : ''}${best.score}）が最高方位です。`,
      date: slashDate(today),
    }));
}

/** 設定に応じた、今出すべきお知らせの一覧（アプリを開いたとき・設定を変えたときに計算する） */
export function computeDynamicNotices({ omamoriReminder, favoriteBestNotify, now = new Date() }) {
  if (typeof window === 'undefined') return [];
  const notices = [];
  const today = getBoardDate(now);
  try {
    if (omamoriReminder) {
      const n = buildOmamoriNotice({ today, openedDate: window.localStorage.getItem(OMAMORI_OPENED_KEY) });
      if (n) notices.push(n);
    }
    if (favoriteBestNotify) {
      const stored = readJson(BASE_POINT_KEY)?.location;
      const base = Number.isFinite(Number(stored?.latitude)) && Number.isFinite(Number(stored?.longitude))
        ? { name: stored.name || '基準点', latitude: Number(stored.latitude), longitude: Number(stored.longitude) }
        : DEFAULT_BASE;
      const favorites = (readJson(MAP_SEARCH_STORAGE_KEY) || [])
        .map((f) => ({ ...f, latitude: Number(f?.latitude ?? f?.lat), longitude: Number(f?.longitude ?? f?.lon) }))
        .filter((f) => Number.isFinite(f.latitude) && Number.isFinite(f.longitude));
      if (favorites.length > 0) {
        const natural = applyNaturalTime(now, getLongitudeCorrectionMinutes(base.longitude));
        const slotHour = getTimeSlotHour(natural);
        const { rankings } = buildReverseBoard({ date: today, hour: slotHour });
        notices.push(...buildFavoriteNotices({ today, slotHour, rankings, base, favorites }));
      }
    }
  } catch {
    // お知らせの計算に失敗しても、アプリ本体は動かす
  }
  return notices;
}
