// 設定「通知」の2項目を、アプリを開いたときのお知らせ（ベルのマーク）として動かす。
//   - お守りリマインド: 今日まだ「今日のお守り」を見ていなければ知らせる
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
import { RARE_TIERS, countdownLabel, remainingLabel, upcomingRareEvents } from '../reverseDirection/rareDays.js';
import { rareHeadline, rareWhenLabel } from '../components/RareDay.jsx';

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

/** 「今日のお守り」を開いた日を記録する（CharmCard から呼ぶ） */
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
    title: '今日のお守りをまだ見ていません',
    body: 'ホームの「今日のお守り」で、今日の吉方位の象意を日常に取り入れるヒントを見られます。',
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

/** 稀日（満盤・極盤・双格）のお知らせ。3日前から当日まで出す */
export function buildRareNotices({ today, events }) {
  return (events || []).map((event) => {
    const tier = RARE_TIERS[event.tier];
    const count = countdownLabel(event, today);
    return {
      id: `rare-${event.id}`,
      type: 'history',
      sender: '稀日',
      title: count === '今日' ? `今日は「${tier.name}」です` : count === '明日' ? `明日は「${tier.name}」です` : `${count}で「${tier.name}」です`,
      body: `${rareWhenLabel(event)} ${event.best.label}。${rareHeadline(event)}この盤が出るのは${tier.rarity}。${remainingLabel(event)}です。`,
      date: slashDate(today),
    };
  });
}

/** 設定に応じた、今出すべきお知らせの一覧（アプリを開いたとき・設定を変えたときに計算する） */
export function computeDynamicNotices({ omamoriReminder, favoriteBestNotify, rareNotify = true, now = new Date() }) {
  if (typeof window === 'undefined') return [];
  const notices = [];
  const today = getBoardDate(now);
  try {
    if (omamoriReminder) {
      const n = buildOmamoriNotice({ today, openedDate: window.localStorage.getItem(OMAMORI_OPENED_KEY) });
      if (n) notices.push(n);
    }
    if (rareNotify) {
      const stored = readJson(BASE_POINT_KEY)?.location;
      const longitude = Number.isFinite(Number(stored?.longitude)) ? Number(stored.longitude) : DEFAULT_BASE.longitude;
      const liveSlotHour = getTimeSlotHour(applyNaturalTime(now, getLongitudeCorrectionMinutes(longitude)));
      notices.push(...buildRareNotices({ today, events: upcomingRareEvents({ today, liveSlotHour }) }));
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
