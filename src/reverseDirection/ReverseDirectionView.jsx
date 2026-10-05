import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Ja from '../utils/Ja.jsx';
import { ic } from '../utils/icons.js';
import DirectionMap from './DirectionMap.jsx';
import FavoritesStrip from './FavoritesStrip.jsx';
import FusionCard from './FusionCard.jsx';
import KakkyokuSearchView from './KakkyokuSearchView.jsx';
import CharmCard from '../components/CharmCard.jsx';
import { getCharm } from '../kimon/charm.js';
import SanbanRouteView from './SanbanRouteView.jsx';
import MiniBoardGrid from './MiniBoardGrid.jsx';
import TimeSlotList from './TimeSlotList.jsx';
import SaikyoRankingView from './SaikyoRankingView.jsx';
import BasePointBar from '../components/yoho/BasePointBar.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import { getBoardDate } from '../utils/boardDate.js';
import { getJstHours } from '../utils/jishinLabels.js';
import { sortTimelineSlotsByScore } from './strongestRanking.js';
import {
  buildDayReverseBoard,
  buildReverseBoard,
  buildTimeline,
  filterGoodRankings,
  getLongitudeCorrectionMinutes,
  applyNaturalTime,
  getTimeSlotHour,
  getTimeSlotLabel,
} from './reverseDirection.js';
import {
  MAP_SEARCH_STORAGE_KEY,
  decoratePlaces,
  favoriteDisplayName,
  favoriteKey,
  favoriteKind,
} from './mapSearch.js';
import { DEFAULT_LOCATIONS } from './locations.js';
import { makeKaisetsuKey } from '../kaisetsu/boardKey.js';

// 画面の見出し。機能の名前ではなく使い方で呼び、専門の名前（tech）は小さく添える。
// variant（'map' = 地図タブ / 'search' = 探すタブ）が渡されたときに使う。
export const MODE_TITLES = {
  time: { title: '今から吉方位へ', lead: '今いる場所から、今の時間の吉方位へ。散歩・カフェ・買い物など、日常の小さな移動に。', tech: '時盤を使用' },
  day: { title: '次の休み、どこへ行く？', lead: '日付を選ぶと、その日の8方位を比較。一番良い方位から旅先を探せます。', tech: '日盤を使用' },
  ranking: { title: 'この方位、いつ行く？', lead: '行きたい方位を選ぶと、良い日がわかります。全方位から探すこともできます。', tech: '日盤ランキング｜遠出 50km〜' },
  timeRanking: { title: '今日の時間帯から探す', lead: '今日のどの時間帯に、どの方位が良いかを一覧で見られます。', tech: '時盤ランキング' },
  kakkyoku: { title: 'この条件が出るのはいつ？', lead: '特定の格局が成立する日時を検索します。', tech: '格局検索' },
  range: { title: '吉を3回つなぐ', lead: '同じ日に、吉方位が3回続くルートを探します。', tech: '奇門三盤ルート' },
};

const MAP_SEARCH_CHANGED_EVENT = 'kimon-map-favorites-changed';
const GO_BASE_POINT_STORAGE_KEY = 'kimon_go_base_point_v1';
// アカウントとの同期（src/sync/userDataSync.js）とやり取りする合図
const BASE_POINT_CHANGED_EVENT = 'kimon-base-point-changed';
const USER_DATA_SYNCED_EVENT = 'kimon-userdata-synced';
const BASE_POINT_MODES = new Set(['gps', 'favorite', 'search']);
const BASE_POINT_CANDIDATE_LIMIT = 8;
const FACILITY_TITLE_RE = /(労働局|労働基準監督署|公共職業安定所|株式会社|有限会社|学校|大学|病院|郵便局|消防|警察|駅|線|用水路|水道|センター|支社|支店|出張所|庁舎|局|署|組合|小学校|中学校|高等学校|短期大学)/;
const ADMIN_TITLE_RE = /^(東京都|北海道|(?:京都|大阪)府|.{2,3}県).*(市|区|町|村)?$/;

function normalizeBasePointLocation(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    name: location?.name || DEFAULT_LOCATIONS[0].name,
    latitude,
    longitude,
  };
}

function readStoredBasePoint() {
  try {
    if (typeof window === 'undefined') return null;
    const saved = window.localStorage.getItem(GO_BASE_POINT_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    const location = normalizeBasePointLocation(parsed?.location);
    if (!location || !BASE_POINT_MODES.has(parsed?.mode)) return null;
    return {
      mode: parsed.mode,
      location,
      selectedFavoriteId: parsed?.selectedFavoriteId || null,
    };
  } catch {
    return null;
  }
}

function writeStoredBasePoint(next) {
  try {
    if (typeof window === 'undefined') return;
    const location = normalizeBasePointLocation(next?.location);
    if (!location || !BASE_POINT_MODES.has(next?.mode)) return;
    window.localStorage.setItem(GO_BASE_POINT_STORAGE_KEY, JSON.stringify({
      mode: next.mode,
      location,
      selectedFavoriteId: next?.selectedFavoriteId || null,
    }));
    window.dispatchEvent(new CustomEvent(BASE_POINT_CHANGED_EVENT));
  } catch {
    // localStorage may be unavailable in private or restricted contexts.
  }
}

function formatCorrection(minutes) {
  if (minutes === 0) return '±0分';
  return `${minutes > 0 ? '+' : ''}${minutes}分`;
}

export function shiftDate(date, days) {
  const [year, month, day] = String(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function formatDisplayDate(date) {
  return date.replaceAll('-', '/');
}

function formatCurrentClock(date = new Date()) {
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatClockMinute(date) {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getNaturalSlotStart(naturalDate, slotHour) {
  const start = new Date(naturalDate);
  start.setMinutes(0, 0, 0);
  if (slotHour === 0) {
    start.setHours(23);
    if (getJstHours(naturalDate) !== 23) start.setDate(start.getDate() - 1);
    return start;
  }
  start.setHours(slotHour - 1);
  return start;
}

function getCurrentTimeWindow(now, correctionMinutes) {
  const naturalDate = applyNaturalTime(now, correctionMinutes);
  const currentSlotHour = getTimeSlotHour(naturalDate);
  const naturalStart = getNaturalSlotStart(naturalDate, currentSlotHour);
  const naturalEnd = new Date(naturalStart.getTime() + 2 * 60 * 60 * 1000);
  const clockStart = new Date(naturalStart.getTime() - correctionMinutes * 60 * 1000);
  const clockEnd = new Date(naturalEnd.getTime() - correctionMinutes * 60 * 1000);
  const remainingMinutes = Math.max(0, Math.ceil((clockEnd.getTime() - now.getTime()) / 60000));
  return {
    clockRange: `${formatClockMinute(clockStart)}–${formatClockMinute(clockEnd)}`,
    naturalLabel: getTimeSlotLabel(currentSlotHour).replace('-', '–'),
    remainingMinutes,
  };
}

function normalizeFavoriteBasePoint(favorite) {
  const latitude = Number(favorite?.latitude ?? favorite?.lat);
  const longitude = Number(favorite?.longitude ?? favorite?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const normalized = {
    ...favorite,
    name: favorite?.name || favorite?.address || 'お気に入り',
    latitude,
    longitude,
  };
  return {
    ...normalized,
    id: favorite?.id || favoriteKey(normalized),
  };
}

function readStoredFavorites() {
  try {
    if (typeof window === 'undefined') return [];
    const saved = window.localStorage.getItem(MAP_SEARCH_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return (Array.isArray(parsed) ? parsed : [])
      .map(normalizeFavoriteBasePoint)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeBasePointCandidate(candidate, index) {
  const coords = candidate?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const longitude = Number(coords[0]);
  const latitude = Number(coords[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const title = candidate?.properties?.title || '候補地';
  const isFacility = FACILITY_TITLE_RE.test(title);
  return {
    id: `${index}-${latitude}-${longitude}`,
    title,
    latitude,
    longitude,
    order: index,
    priority: ADMIN_TITLE_RE.test(title) && !isFacility ? 0 : isFacility ? 2 : 1,
  };
}

function buildBasePointCandidates(data) {
  return (Array.isArray(data) ? data : [])
    .map(normalizeBasePointCandidate)
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority || a.order - b.order)
    .slice(0, BASE_POINT_CANDIDATE_LIMIT);
}

export default function ReverseDirectionView({
  isActive,
  onOpenBoard,
  unreadNotificationCount = 0,
  onOpenNotifications,
  autoMapGuide = false, // 初めて地図を開いたときに、説明書を1回だけ自動で出す（App が地図タブのときだけ true にする）
  showBad,            // 設定「凶も見る」（App が保存）。渡されたときは「吉のみ表示」と連動する
  onShowBadChange,
  variant,            // 'map'（地図タブ: 時盤・日盤の2つ）/ 'search'（探すタブ: 選んだ検索だけ）。無指定は6つのタブ
  mode: modeProp,     // 表示する画面を外（App）から指定する
  onModeChange,
  onBackToSearch,     // 探すタブで「探す」の入口へ戻る
  onOpenTimeRanking,  // 地図タブの時盤から、今日の時間帯別ランキング（探すタブ）へ
  onOpenMapTime,      // 探すタブの時間帯一覧から、選んだ時間・方位のまま地図タブ（時盤）へ
  onOpenMapDay,       // 探すタブの吉日検索から、選んだ日・方位のまま地図タブ（日盤）へ
  longRangeLocked = false, // 吉日検索の3ヶ月以上が年額プラン限定か（lib/accessPolicy.js）
  longRangeLimit = null,   // 年額プランの人が探せる最後の日（契約期間の終わり。'YYYY-MM-DD'）
  annualMark = false,      // 鍵をかけていなくても「年額」の印を出すか
  onUpgrade,
}) {
  const initialBasePoint = useMemo(() => readStoredBasePoint(), []);
  const [location, setLocation] = useState(initialBasePoint?.location || DEFAULT_LOCATIONS[0]);
  const [currentMode, setCurrentMode] = useState(initialBasePoint?.mode || 'search');
  const [selectedFavoriteId, setSelectedFavoriteId] = useState(initialBasePoint?.selectedFavoriteId || null);
  const [favorites, setFavorites] = useState(() => readStoredFavorites());
  const [query, setQuery] = useState('');
  const [basePointCandidates, setBasePointCandidates] = useState([]);
  const [basePointSearching, setBasePointSearching] = useState(false);
  // 「吉のみ表示」は設定の「凶も見る」と同じ値（App が保存する）。単体で使うときは自前の state。
  const [localGoodOnly, setLocalGoodOnly] = useState(true);
  const goodOnly = typeof showBad === 'boolean' ? !showBad : localGoodOnly;
  const setGoodOnly = (value) => {
    if (typeof showBad === 'boolean' && onShowBadChange) onShowBadChange(!value);
    else setLocalGoodOnly(value);
  };
  const [innerMode, setInnerMode] = useState('time');
  const mode = modeProp || innerMode;
  const setMode = (next) => {
    setInnerMode(next);
    onModeChange?.(next);
  };
  const modeTitle = variant ? MODE_TITLES[mode] : null;
  // 地図で選んだ場所を、もう一方の盤（時盤⇔日盤）へ持っていく
  const [carriedPlace, setCarriedPlace] = useState(null);
  const seeInOtherMode = (place) => {
    const next = mode === 'day' ? 'time' : 'day';
    setCarriedPlace({ place, mode: next });
    setMode(next);
  };
  const [dayDate, setDayDate] = useState(getBoardDate());
  const [status, setStatus] = useState('');
  const [timelineSortMode, setTimelineSortMode] = useState('time');
  const [basePointOpen, setBasePointOpen] = useState(false);
  const [dayBasePointOpen, setDayBasePointOpen] = useState(false);
  const [rankingBasePointOpen, setRankingBasePointOpen] = useState(false);
  const [currentMiniBoardOpen, setCurrentMiniBoardOpen] = useState(false);
  const [dayMiniBoardOpen, setDayMiniBoardOpen] = useState(false);
  const [focusedFavoriteKey, setFocusedFavoriteKey] = useState('');
  const [dayFocusedFavoriteKey, setDayFocusedFavoriteKey] = useState('');
  // GOゾーン再構成(PR-2.6/PR-D2): 「すべて見る」でお気に入りフルリストを開閉する（時盤・日盤それぞれ独立）。
  const [showFavoritesList, setShowFavoritesList] = useState(false);
  const [dayShowFavoritesList, setDayShowFavoritesList] = useState(false);
  const [basePointEstablished, setBasePointEstablished] = useState(true);
  const [ctaSearchOpen, setCtaSearchOpen] = useState(false);
  // 基準点ピッカーのグループ開閉（mock v9: 🏠拠点=開 / ⭐お気に入り=閉 / 住所検索=閉）
  const [homeGroupOpen, setHomeGroupOpen] = useState(true);
  const [spotGroupOpen, setSpotGroupOpen] = useState(false);
  const [addrSearchOpen, setAddrSearchOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // L3ボトムシート（PR-5）: FusionCard(L2)と共有する軸選択。
  const [selAxis, setSelAxis] = useState('goen');

  const correction = getLongitudeCorrectionMinutes(location.longitude);
  const naturalNow = applyNaturalTime(new Date(), correction);
  const today = getBoardDate();
  const liveSlotHour = getTimeSlotHour(naturalNow);
  // 時間帯の一覧で選んだ時間・方位を、地図（時盤）に引き継ぐ。null は「今の時間・一番良い方位」。
  const [pickedHour, setPickedHour] = useState(null);
  const [pickedPalace, setPickedPalace] = useState(null);
  // 時盤の日付。null は今日。明日以降の「何時にどの方位か」も見られるようにする。
  const [timeDate, setTimeDate] = useState(null);
  const date = timeDate && timeDate !== today ? timeDate : today;
  const isTimeToday = date === today;
  const slotHour = pickedHour ?? liveSlotHour;
  // 「今」ではない日時を見ているか（別の日、または今日の別の時間帯）
  const isPickedTime = !isTimeToday || (pickedHour !== null && pickedHour !== liveSlotHour);
  const timeDateLabel = isTimeToday ? '' : `${formatDisplayDate(date)} `;
  const clearPicked = () => {
    setTimeDate(null);
    setPickedHour(null);
    setPickedPalace(null);
  };
  const changeTimeDate = (next) => {
    setTimeDate(next && next !== today ? next : null);
    setPickedPalace(null);
  };
  // 時間帯を選ぶ帯: 選ばれている時間帯が見える位置まで横に送る（縦のスクロールは動かさない）。
  const slotPickerRef = useRef(null);
  useEffect(() => {
    const box = slotPickerRef.current;
    const active = box?.querySelector('[data-active="true"]');
    if (!box || !active) return;
    box.scrollLeft = Math.max(0, active.offsetLeft - (box.clientWidth - active.offsetWidth) / 2);
  }, [slotHour, mode, isActive]);
  const currentTimeWindow = useMemo(
    () => getCurrentTimeWindow(now, correction),
    [now, correction],
  );

  const reverse = useMemo(() => (
    buildReverseBoard({ date, hour: slotHour })
  ), [date, slotHour]);
  // お守り: その盤の吉方位の象意を、物・色・行動に置き換えた提案（src/kimon/charm.js）。
  const timeCharm = useMemo(() => getCharm({ rankings: reverse.rankings, sourceType: 'hour' }), [reverse.rankings]);

  const visibleRankings = filterGoodRankings(reverse.rankings, goodOnly);
  // 一覧で方位を選んで来たときは、その方位を主役にする（選んでいなければ一番良い方位）。
  const pickedItem = pickedPalace ? reverse.rankings.find((item) => item.palace === pickedPalace) : null;
  // topItem = 一番評価の高い方位（BEST）。best = 詳しく見せる方位（選んでいればそれ、なければ BEST）。
  const topItem = visibleRankings[0] || null;
  const best = pickedItem || topItem;
  const favoriteChips = useMemo(() => (
    decoratePlaces(favorites, [location.latitude, location.longitude], reverse.rankings)
  ), [favorites, location.latitude, location.longitude, reverse.rankings]);

  const dayReverseState = useMemo(() => {
    try {
      return {
        result: buildDayReverseBoard({ date: dayDate }),
        error: null,
      };
    } catch (error) {
      return { result: null, error: error.message };
    }
  }, [dayDate]);
  const dayReverse = dayReverseState.result;
  const dayVisibleRankings = filterGoodRankings(dayReverse?.rankings || [], goodOnly);
  // 吉日検索で方位を選んで来たときは、その方位を主役にする（選んでいなければ一番良い方位）。
  const [dayPickedPalace, setDayPickedPalace] = useState(null);
  const dayPickedItem = dayPickedPalace ? (dayReverse?.rankings || []).find((item) => item.palace === dayPickedPalace) : null;
  const dayTopItem = dayVisibleRankings[0] || null;
  const dayBest = dayPickedItem || dayTopItem;
  const dayFavoriteChips = useMemo(() => (
    dayReverse
      ? decoratePlaces(favorites, [location.latitude, location.longitude], dayReverse.rankings)
      : []
  ), [dayReverse, favorites, location.latitude, location.longitude]);

  const timeline = useMemo(() => (
    buildTimeline({ date, goodOnly })
  ), [date, goodOnly]);
  const displayedTimeline = useMemo(() => (
    timelineSortMode === 'score' ? sortTimelineSlotsByScore(timeline) : timeline
  ), [timeline, timelineSortMode]);

  const useCurrentLocation = useCallback(() => {
    setSelectedFavoriteId(null);
    setBasePointCandidates([]);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('この端末では現在地を取得できません。場所・地名で探してください。');
      return;
    }
    setStatus('現在地を取得中です。');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          name: '現在地',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setCurrentMode('gps');
        setBasePointEstablished(true);
        setCtaSearchOpen(false);
        writeStoredBasePoint({
          mode: 'gps',
          location: {
            name: '\u73fe\u5728\u5730',
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          },
          selectedFavoriteId: null,
        });
        setStatus('現在地を基準点にしました。');
      },
      () => {
        setStatus('現在地を取得できませんでした。前回の基準点を表示したままにしています。');
      },
      { timeout: 8000, enableHighAccuracy: false },
    );
  }, []);

  const handleGlobalBasePointChange = useCallback((nextCenter, nextName = '選択地点') => {
    const longitude = Number(nextCenter?.[0]);
    const latitude = Number(nextCenter?.[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const nextLocation = {
      name: nextName || '選択地点',
      latitude,
      longitude,
    };
    setLocation(nextLocation);
    setCurrentMode(nextName === '現在地' ? 'gps' : 'search');
    setSelectedFavoriteId(null);
    setBasePointCandidates([]);
    setBasePointEstablished(true);
    setBasePointOpen(false);
    setDayBasePointOpen(false);
    setRankingBasePointOpen(false);
    setCtaSearchOpen(false);
    writeStoredBasePoint({
      mode: nextName === '現在地' ? 'gps' : 'search',
      location: nextLocation,
      selectedFavoriteId: null,
    });
    setStatus(`${nextLocation.name}を基準点にしました。`);
  }, []);

  useEffect(() => {
    if (!isActive || typeof window === 'undefined') return undefined;
    const timer = window.setInterval(() => setNow(new Date()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, [isActive]);

  const refreshFavorites = useCallback(() => {
    setFavorites(readStoredFavorites());
  }, []);

  // L3ボトムシートのCTA「この方位で行き先を探す」用。GOゾーンの検索窓へ
  // スクロール＋フォーカスする（DirectionMap.jsx側のid付与とセット）。
  // 地図の「この方位を詳しく見る」用。方位詳細（統合カード）まで送る。
  const scrollToDirectionDetail = useCallback(() => {
    if (typeof document === 'undefined') return;
    document.getElementById('yoho-direction-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const scrollToGoSearch = useCallback(() => {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('yoho-go-search-input');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    refreshFavorites();
    const handleFavoritesChanged = () => refreshFavorites();
    const handleStorage = (event) => {
      if (event.key === MAP_SEARCH_STORAGE_KEY) refreshFavorites();
    };
    // 別の端末で選んだ基準点がアカウントから届いたら、この画面にも反映する。
    const handleSynced = (event) => {
      if (!event.detail?.basePoint) return;
      const synced = readStoredBasePoint();
      if (!synced) return;
      setLocation(synced.location);
      setCurrentMode(synced.mode);
      setSelectedFavoriteId(synced.selectedFavoriteId);
    };
    window.addEventListener(USER_DATA_SYNCED_EVENT, handleSynced);
    window.addEventListener(MAP_SEARCH_CHANGED_EVENT, handleFavoritesChanged);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFavoritesChanged);
    return () => {
      window.removeEventListener(USER_DATA_SYNCED_EVENT, handleSynced);
      window.removeEventListener(MAP_SEARCH_CHANGED_EVENT, handleFavoritesChanged);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFavoritesChanged);
    };
  }, [refreshFavorites]);

  useEffect(() => {
    if (currentMode !== 'favorite' || !selectedFavoriteId) return;
    const favorite = favorites.find((item) => item.id === selectedFavoriteId);
    if (!favorite) {
      setLocation(DEFAULT_LOCATIONS[0]);
      setCurrentMode('search');
      setSelectedFavoriteId(null);
      setStatus('保存済みの基準点が見つからないため、東京を表示しています。');
      return;
    }
    setBasePointEstablished(true);
    const nextName = favoriteDisplayName(favorite);
    if (
      location.name !== nextName
      || location.latitude !== favorite.latitude
      || location.longitude !== favorite.longitude
    ) {
      setLocation({
        name: nextName,
        latitude: favorite.latitude,
        longitude: favorite.longitude,
      });
      writeStoredBasePoint({
        mode: 'favorite',
        location: {
          name: nextName,
          latitude: favorite.latitude,
          longitude: favorite.longitude,
        },
        selectedFavoriteId: favorite.id,
      });
    }
  }, [currentMode, favorites, location, selectedFavoriteId]);

  const searchPlace = async () => {
    const text = query.trim();
    if (!text || basePointSearching) return;
    setBasePointSearching(true);
    setBasePointCandidates([]);
    setStatus('候補を検索中です。');
    try {
      const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(text)}`);
      const data = await res.json();
      const candidates = buildBasePointCandidates(data);
      setBasePointCandidates(candidates);
      setStatus(candidates.length > 0 ? '候補から基準点を選んでください。' : '候補が見つかりませんでした。');
    } catch {
      setStatus('場所検索に失敗しました。時間をおいて再試行してください。');
    } finally {
      setBasePointSearching(false);
    }
  };

  const selectBasePointCandidate = (candidate) => {
    const nextLocation = {
      name: candidate.title,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    };
    setLocation(nextLocation);
    setCurrentMode('search');
    setSelectedFavoriteId(null);
    setBasePointCandidates([]);
    setBasePointEstablished(true);
    setCtaSearchOpen(false);
    setQuery(candidate.title);
    writeStoredBasePoint({
      mode: 'search',
      location: nextLocation,
      selectedFavoriteId: null,
    });
    setStatus('選択した場所を基準点にしました。');
  };

  // お気に入り/拠点を基準点に選ぶ。location と localStorage の反映は currentMode='favorite' の useEffect が行う。
  const selectFavoriteBasePoint = (favorite) => {
    if (!favorite) return;
    setBasePointCandidates([]);
    setBasePointEstablished(true);
    setCurrentMode('favorite');
    setSelectedFavoriteId(favorite.id);
    setBasePointOpen(false);
    setDayBasePointOpen(false);
    setRankingBasePointOpen(false);
    setStatus(`${favoriteDisplayName(favorite)}を基準点にしました。`);
  };

  const filterCard = (
    <div className="reverse-card reverse-filter-card">
      <div className="reverse-filter-controls">
        <label className="reverse-toggle-row">
          <span>吉のみ表示</span>
          <input
            type="checkbox"
            checked={goodOnly}
            onChange={(e) => setGoodOnly(e.target.checked)}
          />
        </label>
        <div className="reverse-sort-toggle" role="group" aria-label="時間帯ベストの並び順">
          <button
            type="button"
            className={timelineSortMode === 'time' ? 'is-active' : ''}
            onClick={() => setTimelineSortMode('time')}
          >
            時間順
          </button>
          <button
            type="button"
            className={timelineSortMode === 'score' ? 'is-active' : ''}
            onClick={() => setTimelineSortMode('score')}
          >
            点数順
          </button>
        </div>
      </div>
    </div>
  );

  const basePointSearchForm = (
    <>
      <form
        className="reverse-search-row kiten-search-row"
        onSubmit={(event) => {
          event.preventDefault();
          searchPlace();
        }}
      >
        <input
          type="search"
          value={query}
          placeholder="場所・地名で探す"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={basePointSearching}>
          {basePointSearching ? '検索中' : '検索'}
        </button>
      </form>
      {basePointCandidates.length > 0 && (
        <div className="kiten-candidates" role="listbox" aria-label="基準点候補">
          {basePointCandidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => selectBasePointCandidate(candidate)}
            >
              <strong>{candidate.title}</strong>
              <small className="lat">
                {candidate.latitude.toFixed(4)}, {candidate.longitude.toFixed(4)}
              </small>
            </button>
          ))}
        </div>
      )}
    </>
  );

  const basePointControls = (
    <div className="kiten-panel">
      <div className="kiten-primary-actions">
        <button type="button" className="kiten-current-button" onClick={useCurrentLocation}>
          <span aria-hidden="true">{ic('📍')}</span>
          <span>現在地を使う</span>
        </button>
      </div>
      {basePointSearchForm}
    </div>
  );

  // 基準点ピッカー（mock v9）: 現在地常時 / 🏠拠点=開 / ⭐お気に入り=閉(内部スクロール) / 住所検索=閉
  const homeFavorites = favorites.filter((item) => favoriteKind(item) === 'home');
  const spotFavorites = favorites.filter((item) => favoriteKind(item) !== 'home');

  const renderPickerRow = (favorite) => {
    const selected = currentMode === 'favorite' && selectedFavoriteId === favorite.id;
    const subAddress = favorite.label?.trim() ? favorite.name : '';
    const icon = ic(favoriteKind(favorite) === 'home' ? '🏠' : '⭐');
    return (
      <button
        type="button"
        key={favorite.id}
        className={`kiten-pick-row${selected ? ' is-selected' : ''}`}
        onClick={() => selectFavoriteBasePoint(favorite)}
        aria-pressed={selected}
      >
        <span className="kiten-pick-ic" aria-hidden="true">{icon}</span>
        <span className="kiten-pick-tx">
          <span className="kiten-pick-nm">{favoriteDisplayName(favorite)}</span>
          {subAddress && <span className="kiten-pick-ad">{subAddress}</span>}
        </span>
        <span className="kiten-pick-chk" aria-hidden="true">✓</span>
      </button>
    );
  };

  const basePointPicker = (
    <div className="kiten-picker">
      <button type="button" className="kiten-pick-now" onClick={useCurrentLocation}>
        <span className="kiten-pick-now-ic" aria-hidden="true">{ic('📍')}</span>
        <span className="kiten-pick-now-tx">
          <span className="kiten-pick-now-b">現在地を使う</span>
          <span className="kiten-pick-now-s">押すと位置情報の確認が出ます</span>
        </span>
        <span className="kiten-pick-now-arr" aria-hidden="true">›</span>
      </button>

      {homeFavorites.length > 0 && (
        <>
          <button
            type="button"
            className={`kiten-pick-grp${homeGroupOpen ? ' is-open' : ''}`}
            onClick={() => setHomeGroupOpen((value) => !value)}
            aria-expanded={homeGroupOpen}
          >
            <span className="kiten-pick-grp-ic" aria-hidden="true">{ic('🏠')}</span>
            <span className="kiten-pick-grp-t">自宅・拠点</span>
            <span className="kiten-pick-grp-cnt">{homeFavorites.length}件</span>
            <span className="kiten-pick-grp-ln" aria-hidden="true" />
            <span className="kiten-pick-grp-car" aria-hidden="true">▼</span>
          </button>
          {homeGroupOpen && (
            <div className="kiten-pick-body">{homeFavorites.map(renderPickerRow)}</div>
          )}
        </>
      )}

      {spotFavorites.length > 0 && (
        <>
          <button
            type="button"
            className={`kiten-pick-grp${spotGroupOpen ? ' is-open' : ''}`}
            onClick={() => setSpotGroupOpen((value) => !value)}
            aria-expanded={spotGroupOpen}
          >
            <span className="kiten-pick-grp-ic" aria-hidden="true">{ic('⭐')}</span>
            <span className="kiten-pick-grp-t">お気に入りから</span>
            <span className="kiten-pick-grp-cnt">{spotFavorites.length}件</span>
            <span className="kiten-pick-grp-ln" aria-hidden="true" />
            <span className="kiten-pick-grp-car" aria-hidden="true">▼</span>
          </button>
          {spotGroupOpen && (
            <div className="kiten-pick-body kiten-pick-body-scroll">{spotFavorites.map(renderPickerRow)}</div>
          )}
        </>
      )}

      <button
        type="button"
        className={`kiten-pick-addr-toggle${addrSearchOpen ? ' is-open' : ''}`}
        onClick={() => setAddrSearchOpen((value) => !value)}
        aria-expanded={addrSearchOpen}
      >
        <span aria-hidden="true">{ic('🔍')}</span>
        <span>住所や地名で探す</span>
        <span className="kiten-pick-grp-car" aria-hidden="true">▼</span>
      </button>
      {addrSearchOpen && <div className="kiten-pick-addr">{basePointSearchForm}</div>}
    </div>
  );

  const basePointMeta = mode === 'time' || mode === 'timeRanking' || mode === 'kakkyoku' || mode === 'range' ? (
    <div className="reverse-correction">
      <span>自然時補正：{location.name} <b className="lat">{formatCorrection(correction)}</b></span>
      <span>経度 <b className="lat">{location.longitude.toFixed(2)}</b></span>
    </div>
  ) : (
    <div className="reverse-correction">
      <span>日盤は自然時補正なし</span>
      <span>経度 <b className="lat">{location.longitude.toFixed(2)}</b></span>
    </div>
  );

  const basePointCard = (
    <div className="reverse-card reverse-location-card">
      <div className="reverse-card-title">
        <div>
          <span className="reverse-section-kicker lat">base point</span>
          <h3 className="maru">基準点</h3>
        </div>
        <span>現在地 / 場所・地名検索</span>
      </div>
      {basePointControls}
      {basePointMeta}
      {status && <p className="reverse-status">{status}</p>}
    </div>
  );

  const rankingBasePointMeta = mode === 'timeRanking' ? basePointMeta : (
    <div className="reverse-correction">
      <span>日盤は自然時補正なし</span>
    </div>
  );

  const rankingBasePointPanel = (
    <div className="reverse-card reverse-go-card reverse-base-card">
      <div className="reverse-base-compact">
        <span>
          基準点 <strong>{location.name}</strong>
        </span>
        <button type="button" onClick={() => setRankingBasePointOpen((value) => !value)}>
          変更
        </button>
      </div>
      {rankingBasePointOpen && (
        <div className="reverse-base-panel">
          {basePointPicker}
          {rankingBasePointMeta}
          {status && <p className="reverse-status">{status}</p>}
        </div>
      )}
    </div>
  );

  // PR-D2: 日盤遠出のGOゾーン。時盤お散歩(PR-2.6)と同型に、タブ切替(地図で探す/
  // お気に入り)・📍ヒント行を廃止して地図を常時主役表示にし、地図直下にお気に入り
  // ストリップを新設する。「出かける場所を探す」見出しは時盤と違い日盤では温存
  // （見出し有無の統一はPhase 2のGOゾーン全体見直しで判断）。
  const renderGoZone = ({
    rankings,
    bestPalace,
    profileKey,
    showScale = false,
    chips,
    focusedKey,
    onFocusKey,
    onShowAll,
    showFavoritesSection,
    selectedPalace,
    onSelectPalace,
    conditionLabel,
  }) => (
    <div className="reverse-zone reverse-go-zone reverse-go-zone--nichiban">
      <div className="reverse-zone-title">
        <span className="reverse-section-kicker lat">go</span>
        <h3 className="maru">出かける場所を探す</h3>
      </div>

      <div className="reverse-card reverse-go-card">
        <DirectionMap
          location={location}
          rankings={rankings}
          bestPalace={bestPalace}
          profileKey={profileKey}
          showScale={showScale}
          focusFavoriteKey={focusedKey}
          showFavoritesSection={showFavoritesSection}
          selectedPalace={selectedPalace}
          onSelectPalace={onSelectPalace}
          conditionLabel={conditionLabel}
          goodOnly={goodOnly}
          onGoodOnlyChange={setGoodOnly}
          autoGuide={autoMapGuide}
          onSetBasePoint={handleGlobalBasePointChange}
          onSeeInOtherMode={profileKey === 'nichiban' ? seeInOtherMode : undefined}
          carryPlace={profileKey === 'nichiban' && carriedPlace?.mode === 'day' ? carriedPlace.place : null}
        />
      </div>

      <FavoritesStrip
        chips={chips}
        focusedKey={focusedKey}
        onFocusKey={onFocusKey}
        onShowAll={onShowAll}
      />
    </div>
  );

  // PR-2.6: 時盤お散歩モード専用のGOゾーン。地図を常時主役表示にし、
  // 従来のタブ切替(地図で探す/お気に入り)・見出し・📍バナーを廃止して
  // 地図直下にお気に入りストリップを新設する。
  const renderJibanGoZone = ({ rankings, bestPalace }) => (
    <div className="reverse-zone reverse-go-zone reverse-go-zone--jiban">
      <div className="reverse-card reverse-go-card">
        <DirectionMap
          location={location}
          rankings={rankings}
          bestPalace={bestPalace}
          profileKey="jiban"
          showScale={false}
          focusFavoriteKey={focusedFavoriteKey}
          showSearchControls
          showPlacePanel
          showFavoritesSection={showFavoritesList}
          selectedPalace={pickedPalace}
          onSelectPalace={setPickedPalace}
          conditionLabel={`${timeDateLabel}${getTimeSlotLabel(slotHour)} の時盤`}
          goodOnly={goodOnly}
          onGoodOnlyChange={setGoodOnly}
          autoGuide={autoMapGuide}
          onSetBasePoint={handleGlobalBasePointChange}
          onOpenDetail={scrollToDirectionDetail}
          onSeeInOtherMode={seeInOtherMode}
          carryPlace={carriedPlace?.mode === 'time' ? carriedPlace.place : null}
        />
      </div>

      <FavoritesStrip
        chips={favoriteChips}
        focusedKey={focusedFavoriteKey}
        onFocusKey={setFocusedFavoriteKey}
        onShowAll={() => setShowFavoritesList((value) => !value)}
      />
    </div>
  );

  const timelineSection = (
    <>
      {filterCard}

      <div className="reverse-timeline">
        <div className="reverse-section-title">
          <span className="reverse-section-kicker lat">today's best</span>
          <h3 className="maru">{isTimeToday ? '本日の時間帯別ベスト' : `${formatDisplayDate(date)} の時間帯別ベスト`}</h3>
        </div>
        <p className="tsl-lead"><Ja>時間帯を押すと、その時間の8方位を比べて、地図で行き先を探せます。</Ja></p>
        <TimeSlotList
          timeline={displayedTimeline}
          nowHour={isTimeToday ? liveSlotHour : null}
          onOpenBoard={(hour) => onOpenBoard({ date, hour, boardType: '時' })}
          onGoMap={({ hour, palace }) => {
            setPickedHour(hour);
            setPickedPalace(palace);
            setMode('time');
            onOpenMapTime?.();
            if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
          }}
        />
      </div>
    </>
  );

  return (
    <section className={`reverse-view${mode === 'time' ? ' reverse-view--walk' : ''}`} aria-label="逆引き方位検索">
      <div className={`reverse-header${variant === 'map' ? ' reverse-header--map' : ''}`}>
        <div>
          {variant === 'search' && onBackToSearch && (
            <button type="button" className="reverse-back" onClick={onBackToSearch}>‹ 探す</button>
          )}
          {modeTitle ? (
            <>
              <h2 className="maru"><Ja>{mode === 'time' && isPickedTime ? `${timeDateLabel}${getTimeSlotLabel(slotHour)}に吉方位へ` : modeTitle.title}</Ja></h2>
              {variant !== 'map' && <p className="reverse-lead"><Ja>{modeTitle.lead}</Ja></p>}
            </>
          ) : (
            <>
              <span className="reverse-kicker lat">lucky direction</span>
              <h2 className="maru">吉方位</h2>
            </>
          )}
          {/* 地図タブ: 題は読み上げ用に残し、見た目は基準点の帯だけにする（地図を上に寄せるため） */}
          {variant === 'map' && (
            <BasePointBar
              compact
              center={[location.longitude, location.latitude]}
              baseName={location.name}
              onCenterChange={handleGlobalBasePointChange}
            />
          )}
          {modeTitle && variant !== 'map' && (
            <p className="reverse-tech">
              {modeTitle.tech} / {location.name}
              {mode === 'time' ? ` / 自然時補正 ${formatCorrection(correction)}` : ''}
            </p>
          )}
          {!modeTitle && (
          <p>
            {mode === 'kakkyoku'
              ? `格局検索（時盤・日盤） / ${location.name}`
              : mode === 'timeRanking'
              ? `時盤・時間帯ランキング / ${location.name}`
              : mode === 'ranking'
              ? `日盤・日盤ランキング / ${location.name}`
              : mode === 'day'
              ? `日盤・遠出 / ${location.name}`
              : mode === 'range'
              ? `時盤・奇門三盤ルート / ${location.name}`
              : `時盤・自然時補正 ${formatCorrection(correction)} / ${location.name}`}
          </p>
          )}
        </div>
<div className="reverse-header-actions">
          {mode !== 'range' && variant !== 'map' && (
            <div className="reverse-time-chip lat">
              {mode === 'timeRanking'
                ? `現在 ${formatCurrentClock(now)}`
                : mode === 'day' || mode === 'ranking'
                ? formatDisplayDate(dayDate)
                : getTimeSlotLabel(slotHour)}
            </div>
          )}
          <NotificationBell unreadCount={unreadNotificationCount} onClick={onOpenNotifications} />
        </div>
      </div>

      {variant !== 'map' && (
        <BasePointBar
          center={[location.longitude, location.latitude]}
          baseName={location.name}
          onCenterChange={handleGlobalBasePointChange}
        />
      )}

      {variant === 'map' && (
        <div className="reverse-mode-tabs reverse-mode-tabs--two" aria-label="時盤と日盤の切り替え">
          <button className={mode === 'time' ? 'is-active' : ''} type="button" onClick={() => setMode('time')}>
            時盤（近場）
          </button>
          <button className={mode === 'day' ? 'is-active' : ''} type="button" onClick={() => setMode('day')}>
            日盤（遠出・旅行）
          </button>
        </div>
      )}
      {!variant && (
      <div className="reverse-mode-tabs" aria-label="吉方位内タブ">
        <button
          className={mode === 'time' ? 'is-active' : ''}
          type="button"
          onClick={() => {
            setMode('time');
          }}
        >
          時盤 お散歩
        </button>
        <button className={mode === 'timeRanking' ? 'is-active' : ''} type="button" onClick={() => setMode('timeRanking')}>
          時盤ランキング
        </button>
        <button className={mode === 'day' ? 'is-active' : ''} type="button" onClick={() => setMode('day')}>
          日盤 遠出
        </button>
        <button className={mode === 'ranking' ? 'is-active' : ''} type="button" onClick={() => setMode('ranking')}>
          日盤ランキング
        </button>
        <button className={mode === 'kakkyoku' ? 'is-active' : ''} type="button" onClick={() => setMode('kakkyoku')}>
          格局を探す
        </button>
        <button className={mode === 'range' ? 'is-active' : ''} type="button" onClick={() => setMode('range')}>
          奇門三盤ルート
        </button>
      </div>
      )}

      {mode === 'time' && (
        <div className="reverse-walk-body">
          <div className="reverse-zone">
            {/* 日付を選ぶ（今日・明日・好きな日）。その下で時間帯を選ぶ */}
            <div className="reverse-time-date" role="group" aria-label="日付を選ぶ">
              <button
                type="button"
                className={isTimeToday ? 'is-active' : ''}
                aria-pressed={isTimeToday}
                onClick={() => changeTimeDate(today)}
              >
                今日
              </button>
              <button
                type="button"
                className={date === shiftDate(today, 1) ? 'is-active' : ''}
                aria-pressed={date === shiftDate(today, 1)}
                onClick={() => changeTimeDate(shiftDate(today, 1))}
              >
                明日
              </button>
              <label>
                <span>日付</span>
                <input
                  type="date"
                  value={date}
                  aria-label="時盤の日付"
                  onChange={(event) => changeTimeDate(event.target.value)}
                />
              </label>
            </div>

            {/* 時間帯を選ぶ（その日の12の時辰）。今日の今の時間帯を押すと「今」に戻る */}
            <div className="reverse-slot-picker" role="group" aria-label="時間帯を選ぶ" ref={slotPickerRef}>
              {timeline.map((slot) => {
                const isActive = slot.hour === slotHour;
                const top = slot.rawBest;
                return (
                  <button
                    key={slot.hour}
                    type="button"
                    className={`reverse-slot-chip${isActive ? ' is-active' : ''}${isTimeToday && slot.hour === liveSlotHour ? ' is-now' : ''}`}
                    aria-pressed={isActive}
                    data-active={isActive ? 'true' : undefined}
                    onClick={() => {
                      setPickedHour(isTimeToday && slot.hour === liveSlotHour ? null : slot.hour);
                      setPickedPalace(null);
                    }}
                  >
                    <span className="lat">{slot.label}</span>
                    <small>
                      {isTimeToday && slot.hour === liveSlotHour ? 'いま・' : ''}
                      {top ? `${top.label} ${top.score > 0 ? '+' : ''}${top.score}` : '—'}
                    </small>
                  </button>
                );
              })}
            </div>

            {isPickedTime && (
              <div className="reverse-picked-note">
                <span>
                  {isTimeToday
                    ? `選んだ時間帯（${getTimeSlotLabel(slotHour)}）の盤を表示しています。今は ${getTimeSlotLabel(liveSlotHour)} です。`
                    : `${formatDisplayDate(date)} ${getTimeSlotLabel(slotHour)} の盤を表示しています。`}
                </span>
                <button type="button" onClick={clearPicked}>今の時間に戻す</button>
              </div>
            )}

            {!isPickedTime && (
            <div
              className="reverse-current-window is-compact"
              title={`自然時補正 ${formatCorrection(correction)}（${currentTimeWindow.naturalLabel}）`}
            >
              <span>今の時間帯</span>
              <b className="lat">{currentTimeWindow.clockRange}</b>
              <small>
                あと<b className="lat">{currentTimeWindow.remainingMinutes}</b>分
              </small>
            </div>
            )}

          </div>

          {renderJibanGoZone({
            rankings: reverse.rankings,
            bestPalace: topItem?.palace,
          })}

          <div className="reverse-zone" id="yoho-direction-detail">
            <FusionCard
              best={best}
              boardKey={makeKaisetsuKey(reverse.board.meta)}
              banLevel={reverse.board.score.ban_level}
              selAxis={selAxis}
              onAxisChange={setSelAxis}
              onGoToSearch={scrollToGoSearch}
            />

            <div className="reverse-card reverse-now-board-card">
              <button
                type="button"
                className="reverse-disclosure-trigger"
                onClick={() => setCurrentMiniBoardOpen((value) => !value)}
                aria-expanded={currentMiniBoardOpen}
              >
                <span>今の時盤を盤で見る</span>
                <b aria-hidden="true">{currentMiniBoardOpen ? '▾' : '›'}</b>
              </button>
              {currentMiniBoardOpen && (
                <div className="reverse-tl-panel">
                  <MiniBoardGrid rankings={reverse.rankings} />
                  <button
                    type="button"
                    className="reverse-full-board-button"
                    onClick={() => onOpenBoard({ date, hour: slotHour, boardType: '時' })}
                  >
                    フル盤を見る
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 日盤の「この日の方位ランキング」と同じ一覧を、時盤にも出す（今の時間帯の8方位） */}
          <div className="reverse-timeline">
            <div className="reverse-section-title">
              <span className="reverse-section-kicker lat">time ranking</span>
              <h3 className="maru">この時間の方位ランキング</h3>
            </div>
            {visibleRankings.length === 0 && (
              <p className="reverse-status">この時間帯には、吉の方位がありません。</p>
            )}
            {visibleRankings.map((item, index) => (
              <div key={item.palace} className="reverse-tl-item">
                <span className="reverse-tl-time lat">{index + 1}</span>
                <div className="reverse-tl-main">
                  <strong>{item.label}</strong>
                  <span>{item.reasons.slice(0, 2).join('・') || '吉凶判定'}</span>
                </div>
                <span className={`reverse-tl-score ${item.score < 0 ? 'is-bad' : ''}`}>
                  {item.score > 0 ? '+' : ''}{item.score}
                </span>
              </div>
            ))}
            {variant === 'map' && onOpenTimeRanking && (
              <button type="button" className="reverse-full-board-button" onClick={onOpenTimeRanking}>
                今日の時間帯別ランキングを見る ›
              </button>
            )}
          </div>

          <CharmCard
            charm={timeCharm}
            sourceType="hour"
            validTime={getTimeSlotLabel(slotHour)}
            onSeeDirection={() => onOpenBoard({ date, hour: slotHour, boardType: '時' })}
          />
        </div>
      )}

      {mode === 'timeRanking' && timelineSection}

      {mode === 'day' && (
        <>
          <div className="reverse-card reverse-day-card">
            <div className="reverse-card-title">
              <div>
                <h3 className="maru">行く日</h3>
              </div>
            </div>
            <label className="reverse-date-row">
              <span>日付</span>
              <input
                type="date"
                value={dayDate}
                onChange={(e) => { setDayDate(e.target.value); setDayPickedPalace(null); }}
              />
            </label>
          </div>

          {dayReverseState.error ? (
            <div className="reverse-card reverse-placeholder">
              <h3>日盤を表示できません</h3>
              <p>{dayReverseState.error}</p>
            </div>
          ) : (
            <>
              {renderGoZone({
                rankings: dayReverse.rankings,
                bestPalace: dayTopItem?.palace,
                selectedPalace: dayPickedPalace,
                onSelectPalace: setDayPickedPalace,
                conditionLabel: `${formatDisplayDate(dayDate)} の日盤`,
                profileKey: 'nichiban',
                showScale: true,
                chips: dayFavoriteChips,
                focusedKey: dayFocusedFavoriteKey,
                onFocusKey: setDayFocusedFavoriteKey,
                onShowAll: () => setDayShowFavoritesList((value) => !value),
                showFavoritesSection: dayShowFavoritesList,
              })}

              {/* 円盤（CompassWheel）は、ここには出さない。すぐ上の地図に、同じ8方位の色・点数・選ぶ操作がそろっているため。
                  部品（CompassWheel.jsx）と線画（public/direction-ui/）は残してある。 */}

              <div className="reverse-card reverse-now-board-card">
                <button
                  type="button"
                  className="reverse-disclosure-trigger"
                  onClick={() => setDayMiniBoardOpen((value) => !value)}
                  aria-expanded={dayMiniBoardOpen}
                >
                  <span>この日の日盤を盤で見る</span>
                  <b aria-hidden="true">{dayMiniBoardOpen ? '▾' : '›'}</b>
                </button>
                {dayMiniBoardOpen && (
                  <div className="reverse-tl-panel">
                    <MiniBoardGrid rankings={dayReverse.rankings} />
                    <button
                      type="button"
                      className="reverse-full-board-button"
                      onClick={() => onOpenBoard({ date: dayDate, boardType: '日' })}
                    >
                      フル盤を見る
                    </button>
                  </div>
                )}
              </div>
              <CharmCard
                charm={getCharm({ rankings: dayReverse.rankings, sourceType: 'day' })}
                sourceType="day"
                validTime={formatDisplayDate(dayDate)}
                onSeeDirection={() => onOpenBoard({ date: dayDate, boardType: '日' })}
              />

              <div className="reverse-card reverse-best-card">
                <div className="reverse-best-no">1</div>
                <div className="reverse-best-main">
                  {dayBest ? (
                    <>
                      <strong>{dayBest.label}<small>{dayBest.reasons.slice(0, 2).join('・') || '吉方位'}</small></strong>
                      <p>この日の最大吉</p>
                    </>
                  ) : (
                    <>
                      <strong>該当なし</strong>
                      <p>吉のみ表示中です。凶も見ると全方位を確認できます。</p>
                    </>
                  )}
                </div>
                <div className="reverse-best-score lat">{dayBest ? `${dayBest.score > 0 ? '+' : ''}${dayBest.score}` : '-'}</div>
              </div>

              <div className="reverse-timeline">
                <div className="reverse-section-title">
                  <span className="reverse-section-kicker lat">day ranking</span>
                  <h3 className="maru">この日の方位ランキング</h3>
                </div>
                {dayVisibleRankings.map((item, index) => (
                  <div key={item.palace} className="reverse-tl-item">
                    <span className="reverse-tl-time lat">{index + 1}</span>
                    <div className="reverse-tl-main">
                      <strong>{item.label}</strong>
                      <span>{item.reasons.slice(0, 2).join('・') || '吉凶判定'}</span>
                    </div>
                    <span className={`reverse-tl-score ${item.score < 0 ? 'is-bad' : ''}`}>
                      {item.score > 0 ? '+' : ''}{item.score}
                    </span>
                  </div>
                ))}
              </div>

              <div className="reverse-card reverse-aux-card">
                <p><strong>補助</strong>：出発するときは、まず時盤の吉方位へ5〜10分進んでから向かいます。</p>
              </div>
            </>
          )}
        </>
      )}

      {mode === 'ranking' && (
        <SaikyoRankingView
          startDate={today}
          goodOnly={goodOnly}
          onGoodOnlyChange={setGoodOnly}
          onOpenBoard={onOpenBoard}
          longRangeLocked={longRangeLocked}
          longRangeLimit={longRangeLimit}
          annualMark={annualMark}
          onUpgrade={onUpgrade}
          onGoMap={({ date: pickedDate, palace }) => {
            setDayDate(pickedDate);
            setDayPickedPalace(palace);
            setMode('day');
            onOpenMapDay?.();
            if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
          }}
        />
      )}

      {mode === 'kakkyoku' && (
        <KakkyokuSearchView
          location={location}
          startDate={today}
          correctionLabel={`${location.name} ${formatCorrection(correction)}`}
          onOpenBoard={onOpenBoard}
        />
      )}

      {mode === 'range' && (
        <div className="reverse-card sanban-route-card">
          <SanbanRouteView
            location={location}
            startDate={today}
            correctionMinutes={correction}
            correctionLabel={`${location.name} ${formatCorrection(correction)}`}
            onSelectRoute={(route) => {
              onOpenBoard({ date: route.date, hour: route.slots[0].hour, boardType: '時' });
            }}
          />
        </div>
      )}
    </section>
  );
}
