import React, { useEffect, useState, useMemo } from 'react';
import { buildBoard } from './kimon/buildBoard.js';
import { scoreBoard } from './kimon/scoreEngine.js';
import InputControls from './components/InputControls.jsx';
import MetaPanel from './components/MetaPanel.jsx';
import BoardGrid from './components/BoardGrid.jsx';
import ShouiPanel from './components/ShouiPanel.jsx';
// import KaisetsuPanel from './components/KaisetsuPanel.jsx';
import AccountSettings from './components/AccountSettings.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import NotificationsView from './components/NotificationsView.jsx';
import ReverseDirectionView from './reverseDirection/ReverseDirectionView.jsx';
import { getBoardDate } from './utils/boardDate.js';
import { useAuth } from './auth/AuthContext.jsx';
import { isLongRangeLocked, longRangeLimitDate, LONG_RANGE_SHOW_ANNUAL_MARK } from '../lib/accessPolicy.js';
import IntroPage, { hasSeenIntro, markIntroSeen } from './components/IntroPage.jsx';
import LegalPage from './components/LegalPage.jsx';
import MapGuide from './reverseDirection/MapGuide.jsx';
import { LEGAL_DOCS, OPEN_LEGAL_EVENT } from './legal/documents.js';
import HomeView from './components/HomeView.jsx';
import { makeKaisetsuKey } from './kaisetsu/boardKey.js';
import SearchHub from './components/SearchHub.jsx';
import { getJishinSlotHour } from './utils/jishinLabels';
import PlaceSettings from './components/PlaceSettings.jsx';
import { startUserDataSync, isSyncEnabled, SYNC_SETTING_CHANGED_EVENT } from './sync/userDataSync.js';
import { lockedMessage } from '../lib/accessPolicy.js';
import { computeDynamicNotices } from './notifications/dynamicNotices.js';
import { captureLineLoginCallback, capturePendingLineLink, finishLineLogin } from './auth/lineLink.js';
import packageJson from '../package.json';

// 標準は白地に金（パール）。前から使っている人が選んだテーマは localStorage に残っているのでそのまま。
const DEFAULT_THEME = 'pearl';
const THEMES = [
  { name: 'void', label: '漆黒', preview: 'radial-gradient(circle at 32% 28%, #5a5650, #1d1b19 62%, #0b0a09)' },
  { name: 'blue', label: '深海', preview: 'radial-gradient(circle at 32% 28%, #4f93b8, #17456b 58%, #0c2440)' },
  { name: 'pearl', label: 'パール', preview: 'radial-gradient(circle at 32% 28%, #ffffff, #f3efe8 58%, #e3ddd2)' },
  { name: 'pink', label: 'ピンク', preview: 'radial-gradient(circle at 32% 28%, #fbe6e6, #efc3c6 58%, #dfa5ab)' },
];
const THEME_NAMES = new Set(THEMES.map((theme) => theme.name));
/** 旧テーマ名 → 宇宙テーマ名（既存ユーザーの localStorage 互換） */
const LEGACY_THEME_MAP = {
  'dark-gold': 'void',
  'navy-silver': 'blue',
  'washi-vermillion': 'pearl',
  'dusty-pink': 'pink',
};
const SETTINGS_STORAGE_PREFIX = 'kimon-setting-';
const APP_VERSION = `v${packageJson?.version || '0.0.0'}`;
const NOTIFICATION_READ_KEY = 'kimon-notification-read-ids';
// 運営からのお知らせ（新しい順）。足すときは、ここに書いて出し直す。
export const NOTIFICATIONS = [
  {
    id: 'ops-2026-10-05-settings',
    type: 'ops',
    sender: '運営',
    title: '「その他」に「場所」ができました',
    body: '今の基準点を確かめたり、お気に入りの場所を一覧で見て消したりできます。最初に開く画面も選べるようになりました。',
    date: '2026/10/05',
  },
  {
    id: 'ops-2026-10-05-home',
    type: 'ops',
    sender: '運営',
    title: 'ホームと「探す」が新しくなりました',
    body: 'ホームは「今から」「次の休み」「この方位はいつ」の3つから選べます。条件を決めて探すときは「探す」を開いてください。',
    date: '2026/10/05',
  },
  {
    id: 'ops-2026-10-map',
    type: 'ops',
    sender: '運営',
    title: '地図で、場所を探しやすくなりました',
    body: '名前や住所、郵便番号で全国の場所を探せます。見つからないときは、Googleマップの共有リンクを貼っても探せます。',
    date: '2026/10/01',
  },
  {
    id: 'tips-jiban-nichiban',
    type: 'ops',
    sender: '使い方',
    title: '近場は時盤、遠出は日盤が目安です',
    body: '散歩や買い物などの短い外出は時盤、旅行や予定づくりは日盤で見ると選びやすくなります。',
    date: '2026/10/01',
  },
];

export const START_TABS = [
  ['home', 'ホーム'],
  ['board', '盤'],
  ['map', '地図'],
];

/** 最初に開く画面（設定で選んだもの。知らない値はホーム） */
export function readStartTab() {
  const saved = readStoredSetting('start-tab', 'home');
  return START_TABS.some(([value]) => value === saved) ? saved : 'home';
}

function readStoredSetting(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    return window.localStorage.getItem(`${SETTINGS_STORAGE_PREFIX}${key}`) || fallback;
  } catch {
    return fallback;
  }
}

function readStoredBoolSetting(key, fallback = false) {
  const stored = readStoredSetting(key, fallback ? 'true' : 'false');
  return stored === 'true';
}

function readStoredJsonArray(key) {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function applyInitialTheme() {
  if (typeof document === 'undefined') return DEFAULT_THEME;

  let theme = DEFAULT_THEME;
  try {
    theme = localStorage.getItem('kimon-theme') || DEFAULT_THEME;
  } catch {
    theme = DEFAULT_THEME;
  }
  if (LEGACY_THEME_MAP[theme]) theme = LEGACY_THEME_MAP[theme];
  if (!THEME_NAMES.has(theme)) theme = DEFAULT_THEME;

  document.documentElement.dataset.theme = theme;
  return theme;
}

const INITIAL_THEME = applyInitialTheme();

/** 表示の設定（アイコン切替・文字サイズ）を <html> に反映する。CSS と utils/icons.js がこれを読む。 */
function applyDisplaySettings({ iconStyle, textSize }) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.iconStyle = iconStyle === 'line' ? 'line' : 'emoji';
  document.documentElement.dataset.textSize = ['small', 'large'].includes(textSize) ? textSize : 'medium';
}

applyDisplaySettings({
  iconStyle: 'emoji',
  textSize: readStoredSetting('text-size', 'medium'),
});

export default function App() {
  const auth = useAuth();
  // お気に入りと基準点をアカウントに保存し、他の端末と合わせる。
  // 設定でオンにした人だけ（場所の情報なので、選ばない限り端末の外に出さない）。全機能を使える人向け。
  const [syncEnabled, setSyncEnabled] = useState(() => isSyncEnabled());
  useEffect(() => {
    const onChange = () => setSyncEnabled(isSyncEnabled());
    window.addEventListener(SYNC_SETTING_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(SYNC_SETTING_CHANGED_EVENT, onChange);
  }, []);
  useEffect(() => {
    if (!syncEnabled || auth.phase !== 'ready' || !auth.loggedIn || !auth.full || !auth.email) return undefined;
    return startUserDataSync(auth.email);
  }, [syncEnabled, auth.phase, auth.loggedIn, auth.full, auth.email]);
  // 全機能を使えない人（未ログインなど）は「今日の盤の閲覧」だけ（lib/accessPolicy.js）。
  // 判定中（loading）は今日の盤のまま表示し、確定してから絞る（ちらつき防止）。
  const limited = auth.phase === 'ready' && !auth.full;
  const [state, setState] = useState({
    date: getBoardDate(),
    // \u76e4\u30bf\u30d6\u306f\u3001\u4eca\u306e\u6642\u76e4\u304b\u3089\u59cb\u3081\u308b\uff08\u30db\u30fc\u30e0\u306e\u300c\u4eca\u304b\u3089\u4f7f\u3048\u308b\u5409\u65b9\u4f4d\u300d\u3068\u540c\u3058\u76e4\uff09
    hour: getJishinSlotHour(new Date()),
    boardType: '\u6642',
  });
  const [theme, setTheme] = useState(INITIAL_THEME);
  const [direction, setDirection] = useState('north_bottom');
  // 吉日検索の3ヶ月以上を年額プラン限定にするか（lib/accessPolicy.js。年額プランを売り始めるまでは全員使える）。
  // アドレスに ?annual=preview を付けて開くと、鍵つきの見え方を確かめられる（動作確認用）。
  const [annualPreview] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('annual') === 'preview'
  ));
  const longRangeLocked = isLongRangeLocked(auth) || annualPreview;
  // 年額プランの「1年」は契約日から。吉日検索で探せるのは、今の契約期間の終わりまで。
  const longRangeLimit = longRangeLimitDate(auth);
  // 画面: home（ホーム）/ board（盤）/ map（地図: 時盤・日盤）/ search（探す）/ settings（その他）/ notifications
  // 最初に開く画面は、設定で選べる（ホーム／盤／地図）。
  const [startTab, setStartTab] = useState(() => readStartTab());
  const [activeTab, setActiveTab] = useState(startTab);
  const [previousTab, setPreviousTab] = useState('home');
  const [mapMode, setMapMode] = useState('time');     // 地図タブ: 'time'（時盤・近場）| 'day'（日盤・遠出）
  const [searchMode, setSearchMode] = useState(null); // 探すタブ: null（入口）| 'theme' | 'ranking' | 'kakkyoku' | 'range' | 'timeRanking'
  const [hasVisitedDirection, setHasVisitedDirection] = useState(startTab === 'map');
  const [error, setError] = useState(null);
  const [boardReturnTab, setBoardReturnTab] = useState(null);
  const [boardScrollRequest, setBoardScrollRequest] = useState(0);
  // アイコンの切り替えは設定から外した（変わる場所が少なく、分かりにくかったため）。絵文字に固定する。
  const iconStyle = 'emoji';
  const [textSize, setTextSize] = useState(() => readStoredSetting('text-size', 'medium'));
  const [favoriteBestNotify, setFavoriteBestNotify] = useState(() => readStoredBoolSetting('favorite-best-notify'));
  const [showBadDirections, setShowBadDirections] = useState(() => readStoredBoolSetting('show-bad-directions'));
  const [readNotificationIds, setReadNotificationIds] = useState(() => readStoredJsonArray(NOTIFICATION_READ_KEY));
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackState, setFeedbackState] = useState('idle'); // idle | sending | sent | error | limited
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // 紹介ページ: 初めて来た未ログインの人に1回だけ出す。アドレスに ?about を付けても開ける。
  const [introOpen, setIntroOpen] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('about')
  ));
  useEffect(() => {
    if (auth.phase === 'ready' && !auth.loggedIn && !hasSeenIntro()) setIntroOpen(true);
  }, [auth.phase, auth.loggedIn]);
  // 利用規約・プライバシーポリシー: 設定・ログイン画面から開く。アドレスに ?terms / ?privacy を付けても開ける。
  const [legalDoc, setLegalDoc] = useState(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return Object.keys(LEGAL_DOCS).find((key) => params.has(key)) || null;
  });
  useEffect(() => {
    const handleOpen = (event) => { if (LEGAL_DOCS[event.detail]) setLegalDoc(event.detail); };
    window.addEventListener(OPEN_LEGAL_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_LEGAL_EVENT, handleOpen);
  }, []);
  // 使い方ガイド（ホームの「使い方ガイド」から開く。地図からは地図の中のボタンで開く）
  const [guideOpen, setGuideOpen] = useState(false);
  const closeIntro = () => {
    markIntroSeen();
    setIntroOpen(false);
  };

  // Stripe のページから戻ったとき（?billing=success など）: 結果を知らせ、会員状態を取り直す。
  // 有料への切り替えは Stripe からの通知（Webhook）で行われるため、数秒遅れることがある。
  const [billingNotice, setBillingNotice] = useState('');
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const params = new URLSearchParams(window.location.search);
    const result = params.get('billing');
    if (!['success', 'cancel', 'portal'].includes(result)) return undefined;
    params.delete('billing');
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    setActiveTab('settings');
    if (result === 'cancel') {
      setBillingNotice('申し込みは完了していません。');
      return undefined;
    }
    setBillingNotice(result === 'success'
      ? 'お申し込みありがとうございます。反映まで数秒かかることがあります。'
      : '');
    // Webhook の反映を待って、何度か取り直す。
    const timers = [0, 3000, 8000].map((ms) => window.setTimeout(() => auth.refresh?.(), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // LINE の「アプリと連携」で届いたリンク（?line=合言葉）から開いたとき: 合言葉を覚えて、アカウントの画面を出す。
  // 結びつけるのは、ログインして「連携する」を押したとき（src/components/AccountSettings.jsx の LineLink）。
  useEffect(() => {
    if (typeof window !== 'undefined' && capturePendingLineLink()) setActiveTab('settings');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // LINE から開くリンクに付けている印（openExternalBrowser。LINE の中ではなく、ふだんのブラウザで開かせる）を、
  // アドレスから消す。アプリの動きには関係しない。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('openExternalBrowser')) return;
    params.delete('openExternalBrowser');
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
  }, []);
  // 「LINEでログイン」で LINE の画面から戻ってきたとき（?code=…&state=…）: サーバーへ渡してログインする。
  // はじめての人はアカウントの画面でメールアドレスを登録してもらう（案内は AccountSettings の LineLink が出す）。
  const [lineLoginNotice, setLineLoginNotice] = useState('');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const callback = captureLineLoginCallback();
    if (!callback || callback.cancelled) return;
    finishLineLogin(callback).then((result) => {
      if (result.error) {
        setLineLoginNotice('LINEでログインできませんでした。もう一度お試しください。');
        setActiveTab('settings');
        return;
      }
      if (result.loggedIn) {
        if (result.linked) setActiveTab('settings');
        auth.refresh?.();
        return;
      }
      setActiveTab('settings');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 表示の設定を <html> に反映（アイコン切替・文字サイズ）。
  useEffect(() => {
    applyDisplaySettings({ iconStyle, textSize });
  }, [iconStyle, textSize]);

  // 通知の設定に応じたお知らせ（今日のお守り・お気に入りが最高方位）。タブを切り替えるたびに計算し直す。
  const dynamicNotices = useMemo(
    // お守りリマインドはやめた（ホームに「今日のお守り」の帯が出ているため）
    () => computeDynamicNotices({ omamoriReminder: false, favoriteBestNotify }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [favoriteBestNotify, activeTab],
  );
  const notifications = useMemo(() => [...dynamicNotices, ...NOTIFICATIONS], [dynamicNotices]);

  const sendFeedback = async () => {
    const message = feedbackText.trim();
    if (!message) return;
    setFeedbackState('sending');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message }),
      });
      if (res.ok) {
        setFeedbackText('');
        setFeedbackState('sent');
      } else {
        setFeedbackState(res.status === 429 ? 'limited' : 'error');
      }
    } catch {
      setFeedbackState('error');
    }
  };

  const board = useMemo(() => {
    try {
      const b = buildBoard({
        date: state.date,
        hour: state.hour,
        boardType: state.boardType,
      });
      const score = scoreBoard(b);
      setError(null);
      return { ...b, score };
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, [state.date, state.hour, state.boardType]);

  const handleChange = (patch) => setState((s) => ({ ...s, ...patch }));

  // 制限中は日付を今日に固定する（ログアウト直後など、別の日付のままにしない）。
  useEffect(() => {
    if (!limited) return;
    const today = getBoardDate();
    setState((s) => (s.date === today ? s : { ...s, date: today }));
  }, [limited]);
  const openFullBoard = ({ date, hour = 0, boardType }) => {
    setState({ date, hour, boardType });
    setBoardReturnTab(activeTab);
    setActiveTab('board');
    setBoardScrollRequest((current) => current + 1);
  };
  // 地図タブ・探すタブへ移る（同じ画面部品 ReverseDirectionView を、表示する内容を指定して使う）。
  const goMap = (nextMode = mapMode) => {
    setHasVisitedDirection(true);
    setMapMode(nextMode === 'day' ? 'day' : 'time');
    setActiveTab('map');
  };
  const goSearch = (nextMode = null) => {
    if (nextMode) setHasVisitedDirection(true);
    setSearchMode(nextMode);
    setActiveTab('search');
  };
  // 目的で選ぶ: ホーム・探すの入口で選んだ目的を、「目的で選ぶ」の画面（探すタブの中）へ渡す。
  const [themeRequest, setThemeRequest] = useState(null);
  const goTheme = (theme) => {
    setThemeRequest({ theme, at: Date.now() });
    goSearch('theme');
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };
  // LINE の返信などからのリンク: アドレスに ?go=time / day / ranking / guide を付けて開くと、その画面から始める。
  //   time … 地図（時盤）  day … 地図（日盤）  ranking … この方位、いつ行く？  guide … 使い方ガイド
  // 地図と検索は全機能を使える人だけ（使えない人はホームのまま）。ログインの判定が済んでから1回だけ移る。
  const [goTarget, setGoTarget] = useState(() => (
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('go') : null
  ));
  useEffect(() => {
    if (!goTarget || auth.phase !== 'ready') return;
    const params = new URLSearchParams(window.location.search);
    params.delete('go');
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    setGoTarget(null);
    if (goTarget === 'guide') setGuideOpen(true);
    else if (limited) return;
    else if (goTarget === 'time' || goTarget === 'day') goMap(goTarget);
    else if (goTarget === 'ranking') goSearch('ranking');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goTarget, auth.phase]);
  const directionVisible = activeTab === 'map' || (activeTab === 'search' && searchMode !== null);
  const returnFromFullBoard = () => {
    if (!boardReturnTab) return;
    setActiveTab(boardReturnTab);
    setBoardReturnTab(null);
  };
  const handleThemeChange = (name) => {
    setTheme(name);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = name;
    }
    try {
      localStorage.setItem('kimon-theme', name);
    } catch {
      // Theme persistence is optional when storage is unavailable.
    }
  };
  const saveSetting = (key, value) => {
    try {
      localStorage.setItem(`${SETTINGS_STORAGE_PREFIX}${key}`, String(value));
    } catch {
      // Settings scaffolding remains usable even when storage is unavailable.
    }
  };
  const updateSetting = (key, setter) => (value) => {
    setter(value);
    saveSetting(key, value);
  };
  const toggleSetting = (key, setter) => (current) => {
    const next = !current;
    setter(next);
    saveSetting(key, next);
  };
  const unreadNotificationCount = notifications.filter((item) => !readNotificationIds.includes(item.id)).length;
  const openNotifications = () => {
    setPreviousTab(activeTab === 'notifications' ? previousTab : activeTab);
    setActiveTab('notifications');
  };
  const openAccountSettings = () => {
    setActiveTab('settings');
    window.setTimeout(() => {
      const input = document.getElementById('account-email-input');
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus({ preventScroll: true });
    }, 0);
  };
  const markNotificationRead = (id) => {
    setReadNotificationIds((current) => {
      if (current.includes(id)) return current;
      const next = [...current, id];
      try {
        localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify(next));
      } catch {
        // Notification read state is optional when storage is unavailable.
      }
      return next;
    });
  };

  useEffect(() => {
    if (activeTab !== 'board' || boardScrollRequest === 0 || !board) return undefined;
    let secondFrame = null;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
    };
  }, [activeTab, board, boardScrollRequest]);

  const boardView = (
    <>
      <header className="app-header">
        <div className="header-row">
          <div className="brand-block">
            <span className="brand-mark">遁</span>
            <div>
              <span className="board-kicker lat">KIMON TONKO</span>
              <h1 className="maru">奇門遁甲<span className="brand-z metal lat">Z</span></h1>
            </div>
          </div>
          <NotificationBell unreadCount={unreadNotificationCount} onClick={openNotifications} />
        </div>
      </header>

      <main className="app-main">
        {boardReturnTab && (
          <button type="button" className="board-return-button" onClick={returnFromFullBoard}>
            ← 戻る
          </button>
        )}
        <InputControls
          date={state.date}
          hour={state.hour}
          boardType={state.boardType}
          direction={direction}
          onChange={handleChange}
          onDirectionChange={setDirection}
          dateLocked={limited}
        />

        {limited && (
          <div className="access-notice">
            <p>
              未ログインでは今日の盤だけ表示できます。
              {lockedMessage()}
            </p>
            <button type="button" className="access-notice-cta" onClick={openAccountSettings}>
              ログインする
            </button>
          </div>
        )}

        {error && <div className="error">エラー: {error}</div>}

        {board && (
          <>
            <div className="board-area">
              <BoardGrid
                palaces={board.palaces}
                scores={board.score?.palaces}
                kaisetsuKey={makeKaisetsuKey(board.meta)}
                banLevel={board.banLevel}
                direction={direction}
                kuubou={board.banLevel?.kuubou_text}
                junshu={board.meta?.junshu}
                tenbanJunshuPalace={board.meta?.tenban_junshu_p}
                chibanJunshuPalace={board.meta?.chiban_junshu_p}
                onOpenAccountSettings={openAccountSettings}
              />
              <MetaPanel meta={board.meta} banLevel={board.banLevel} />
            </div>
            <ShouiPanel board={board} />
            {/* ボトムシートに統合済みのため非表示化（コンポーネントは残す）
            <KaisetsuPanel board={board} onOpenAccountSettings={openAccountSettings} />
            */}
          </>
        )}
      </main>
    </>
  );

  // 設定画面のセクション見出しの記号（「アイコン」の設定に合わせて、絵文字か線の記号を出す）
  const settingsIcon = (emoji, paths) => (
    <span className="settings-group-icon" aria-hidden="true">
      {iconStyle === 'line' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          {paths}
        </svg>
      ) : emoji}
    </span>
  );
  const settingsGroupHead = (title, lead, icon) => (
    <div className="settings-group-head">
      {icon}
      <h3 className="maru">{title}</h3>
      {lead && <p>{lead}</p>}
    </div>
  );

  const settingsView = (
    <main className="settings-view">
      <header className="settings-page-head">
        <h2 className="maru">設定</h2>
        <p>テーマと表示まわりを切り替えます。</p>
      </header>

      <section className="settings-group">
        {settingsGroupHead('見た目', 'アプリのテーマカラーを変更します。', settingsIcon('🎨', (
          <>
            <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.9-.8 1.9-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8h2.1a3.7 3.7 0 0 0 3.7-3.7c0-4-3.8-7.2-8.5-7.2z" />
            <circle cx="7.8" cy="11.5" r="1" />
            <circle cx="10.5" cy="7.8" r="1" />
            <circle cx="15" cy="7.8" r="1" />
          </>
        )))}
        <div className="settings-group-body">
          <div className="settings-theme">
            <strong>テーマ</strong>
            <div className="theme-cards" role="group" aria-label="テーマ切替">
              {THEMES.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={`theme-card${theme === item.name ? ' is-active' : ''}`}
                  aria-pressed={theme === item.name}
                  onClick={() => handleThemeChange(item.name)}
                >
                  {theme === item.name && (
                    <span className="theme-card-check" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12.5l4 4 8-9" /></svg>
                    </span>
                  )}
                  <span className="theme-card-preview" style={{ background: item.preview }} aria-hidden="true" />
                  <span className="theme-card-label">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="settings-group">
        {settingsGroupHead('表示', '文字の大きさなどの表示を設定します。', settingsIcon('🖥️', (
          <>
            <rect x="3.5" y="4.5" width="17" height="11.5" rx="1.8" />
            <path d="M9 20h6M12 16v4" />
          </>
        )))}
        <div className="settings-group-body">
          <div className="settings-row">
            <div>
              <strong>文字サイズ</strong>
              <small>画面全体の文字サイズを変更します。</small>
            </div>
            <div className="settings-segment" role="group" aria-label="文字サイズ">
              {[
                ['small', '小'],
                ['medium', '中'],
                ['large', '大'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={textSize === value ? 'is-active' : ''}
                  aria-pressed={textSize === value}
                  onClick={() => updateSetting('text-size', setTextSize)(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <div>
              <strong>最初に開く画面</strong>
              <small>アプリを開いたときに、最初に出る画面を選びます。</small>
            </div>
            <div className="settings-segment" role="group" aria-label="最初に開く画面">
              {START_TABS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={startTab === value ? 'is-active' : ''}
                  aria-pressed={startTab === value}
                  onClick={() => updateSetting('start-tab', setStartTab)(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <div>
              <strong>凶方位の表示</strong>
              <small>検索結果に凶方位・時間帯も表示します。</small>
            </div>
            <button
              type="button"
              className={`settings-switch${showBadDirections ? ' is-on' : ''}`}
              aria-pressed={showBadDirections}
              aria-label="凶方位の表示"
              onClick={() => toggleSetting('show-bad-directions', setShowBadDirections)(showBadDirections)}
            >
              <span />
            </button>
          </div>
        </div>
      </section>

      <section className="settings-group">
        {settingsGroupHead('場所', '基準点とお気に入りの場所を確かめます。', settingsIcon('📍', (
          <>
            <path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 12 3.5 6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11z" />
            <circle cx="12" cy="10" r="2.3" />
          </>
        )))}
        <div className="settings-group-body">
          <PlaceSettings onChangeBasePoint={() => goMap()} />
        </div>
      </section>

      <section className="settings-group">
        {settingsGroupHead('通知', 'アプリを開いたときのお知らせを設定します。', settingsIcon('🔔', (
          <>
            <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
            <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
          </>
        )))}
        <div className="settings-group-body">
          <div className="settings-row">
            <div>
              <strong>お気に入り場所の通知</strong>
              <small>今の時間帯の最高方位にお気に入りがあるとき、アプリを開くとお知らせします。</small>
            </div>
            <button
              type="button"
              className={`settings-switch${favoriteBestNotify ? ' is-on' : ''}`}
              aria-pressed={favoriteBestNotify}
              aria-label="お気に入り場所の通知"
              onClick={() => toggleSetting('favorite-best-notify', setFavoriteBestNotify)(favoriteBestNotify)}
            >
              <span />
            </button>
          </div>
        </div>
      </section>

      <section className="settings-group">
        {settingsGroupHead('アカウント', null, settingsIcon('👤', (
          <>
            <circle cx="12" cy="8.5" r="3.6" />
            <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
          </>
        )))}
        <div className="settings-group-body is-plain">
          {billingNotice && <p className="account-note">{billingNotice}</p>}
          {lineLoginNotice && <p className="account-note">{lineLoginNotice}</p>}
          <AccountSettings />
        </div>
      </section>

      <section className="settings-group">
        {settingsGroupHead('このアプリについて', null, settingsIcon('📖', (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 11v5.5M12 7.8v.2" />
          </>
        )))}
        <div className="settings-group-body">
          <div className="settings-info-row">
            <span>バージョン</span>
            <strong className="lat">{APP_VERSION}</strong>
          </div>
          <button type="button" className="settings-link-row" onClick={() => setGuideOpen(true)}>
            <span>使い方ガイド</span>
            <b aria-hidden="true">›</b>
          </button>
          <button type="button" className="settings-link-row" onClick={() => setIntroOpen(true)}>
            <span>このアプリの紹介</span>
            <b aria-hidden="true">›</b>
          </button>
          {[LEGAL_DOCS.terms, LEGAL_DOCS.privacy].map((doc) => (
            <button key={doc.key} type="button" className="settings-link-row" onClick={() => setLegalDoc(doc.key)}>
              <span>{doc.title}</span>
              <b aria-hidden="true">›</b>
            </button>
          ))}
          <button
            type="button"
            className="settings-link-row"
            aria-expanded={feedbackOpen}
            onClick={() => setFeedbackOpen((v) => !v)}
          >
            <span>フィードバック</span>
            <b aria-hidden="true">{feedbackOpen ? '▾' : '›'}</b>
          </button>
          {feedbackOpen && (
            <div className="feedback-form">
              <label className="account-label" htmlFor="feedback-input">気づいた点やご要望をお送りください</label>
              <textarea
                id="feedback-input"
                className="account-input feedback-input"
                rows={4}
                maxLength={2000}
                value={feedbackText}
                onChange={(e) => { setFeedbackText(e.target.value); if (feedbackState !== 'sending') setFeedbackState('idle'); }}
                disabled={feedbackState === 'sending'}
              />
              {feedbackState === 'sent' && <p className="account-note">送信しました。ありがとうございます。</p>}
              {feedbackState === 'error' && <p className="account-error">送信に失敗しました。時間をおいてお試しください。</p>}
              {feedbackState === 'limited' && <p className="account-error">短時間に複数回送信されています。少し時間をおいてお試しください。</p>}
              <button
                type="button"
                className="account-btn"
                onClick={sendFeedback}
                disabled={feedbackState === 'sending' || !feedbackText.trim()}
              >
                {feedbackState === 'sending' ? '送信中…' : '送信する'}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );

  return (
    <div className="app app-with-tabs">
      <div className="vig" aria-hidden="true" />
      {legalDoc && <LegalPage docKey={legalDoc} onClose={() => setLegalDoc(null)} />}
      {guideOpen && <MapGuide onClose={() => setGuideOpen(false)} />}
      {introOpen && !legalDoc && (
        <IntroPage
          loggedIn={auth.loggedIn}
          onClose={closeIntro}
          onLogin={() => { closeIntro(); openAccountSettings(); }}
          onOpenToday={() => { closeIntro(); setActiveTab('home'); window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }}
          onOpenNow={() => { closeIntro(); goMap('time'); }}
          onOpenPlan={() => { closeIntro(); goMap('day'); }}
        />
      )}
      {activeTab === 'home' && (
        <HomeView
          isActive={activeTab === 'home'}
          limited={limited}
          unreadNotificationCount={unreadNotificationCount}
          onOpenNotifications={openNotifications}
          onGoMap={goMap}
          onGoSearch={goSearch}
          onGoTheme={goTheme}
          onOpenBoard={(target) => (target ? openFullBoard(target) : setActiveTab('board'))}
          onOpenGuide={() => setGuideOpen(true)}
          onLogin={openAccountSettings}
        />
      )}
      {activeTab === 'board' && boardView}
      {activeTab === 'search' && searchMode === null && !limited && (
        <SearchHub
          unreadNotificationCount={unreadNotificationCount}
          onOpenNotifications={openNotifications}
          onSelect={(entry) => (entry.key === 'theme' ? goTheme(entry.theme) : entry.target === 'map' ? goMap(entry.key) : goSearch(entry.key))}
          onOpenGuide={() => setGuideOpen(true)}
        />
      )}
      {(activeTab === 'map' || activeTab === 'search') && limited && (
        <main className="locked-view">
          <section className="locked-card">
            <h2 className="maru">吉方位</h2>
            <p>
              時盤お散歩・日盤遠出・ランキング・格局検索・地図での行き先探しは、ログインするとご利用いただけます。
            </p>
            <p className="locked-card-strong">{lockedMessage()}</p>
            <button type="button" className="access-notice-cta" onClick={openAccountSettings}>
              ログインする
            </button>
          </section>
        </main>
      )}
      {hasVisitedDirection && !limited && (
        <div hidden={!directionVisible}>
          <ReverseDirectionView
            isActive={directionVisible}
            variant={activeTab === 'search' ? 'search' : 'map'}
            autoMapGuide={activeTab === 'map' && !introOpen && !legalDoc}
            mode={activeTab === 'search' ? (searchMode || 'ranking') : mapMode}
            onModeChange={(next) => (activeTab === 'search' ? setSearchMode(next) : setMapMode(next))}
            onBackToSearch={() => setSearchMode(null)}
            onOpenMapTime={() => goMap('time')}
            onOpenMapDay={() => goMap('day')}
            themeRequest={themeRequest}
            longRangeLocked={longRangeLocked}
            longRangeLimit={longRangeLimit}
            annualMark={LONG_RANGE_SHOW_ANNUAL_MARK && auth.plan !== 'annual' && !auth.invited}
            onUpgrade={openAccountSettings}
            onOpenTimeRanking={() => { goSearch('timeRanking'); window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }}
            onOpenBoard={openFullBoard}
            showBad={showBadDirections}
            onShowBadChange={updateSetting('show-bad-directions', setShowBadDirections)}
            unreadNotificationCount={unreadNotificationCount}
            onOpenNotifications={openNotifications}
          />
        </div>
      )}
      {activeTab === 'settings' && settingsView}
      {activeTab === 'notifications' && (
        <NotificationsView
          items={notifications}
          readIds={readNotificationIds}
          onRead={markNotificationRead}
          onBack={() => setActiveTab(previousTab)}
        />
      )}

      <nav className="bottom-tabbar" aria-label="アプリメニュー">
        <button type="button" className={activeTab === 'home' ? 'is-active' : ''} onClick={() => setActiveTab('home')}>
          <span className="bottom-tab-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5z" />
            </svg>
          </span>
          <span>ホーム</span>
        </button>
        <button
          type="button"
          className={activeTab === 'board' ? 'is-active' : ''}
          onClick={() => setActiveTab('board')}
        >
          <span className="bottom-tab-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M4 9.33h16M4 14.67h16M9.33 4v16M14.67 4v16" />
            </svg>
          </span>
          <span>盤</span>
        </button>
        <button type="button" className={activeTab === 'map' ? 'is-active' : ''} onClick={() => goMap()}>
          <span className="bottom-tab-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 12 3.5 6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11z" />
              <circle cx="12" cy="10" r="2.3" />
            </svg>
          </span>
          <span>地図</span>
        </button>
        <button type="button" className={activeTab === 'search' ? 'is-active' : ''} onClick={() => goSearch(null)}>
          <span className="bottom-tab-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" />
            </svg>
          </span>
          <span>探す</span>
        </button>
        <button
          type="button"
          className={activeTab === 'settings' ? 'is-active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          <span className="bottom-tab-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </span>
          <span>その他</span>
        </button>
      </nav>
    </div>
  );
}
