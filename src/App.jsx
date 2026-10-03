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
import { lockedMessage } from '../lib/accessPolicy.js';
import { computeDynamicNotices } from './notifications/dynamicNotices.js';
import packageJson from '../package.json';

const DEFAULT_THEME = 'void';
const THEMES = [
  { name: 'void', label: '漆黒', dot: '#ffd368' },
  { name: 'blue', label: '深海', dot: '#3fc4d8' },
  { name: 'pearl', label: 'パール', dot: 'linear-gradient(135deg,#fff,#f0e6ee 55%,#e6eef7)' },
  { name: 'pink', label: 'ピンク', dot: '#c0897e' },
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
const NOTIFICATIONS = [
  {
    id: 'ops-2026-06-05',
    type: 'ops',
    sender: '運営',
    title: 'テーマ表示を調整しました',
    body: '各テーマのアクセントカラーと誌面トーンを整えました。表示に気づいた点があればフィードバックから送れます。',
    date: '2026/06/05',
  },
  {
    id: 'teacher-2026-06-04',
    type: 'ops',
    sender: '運営',
    title: '吉方位を見るときの目安',
    body: '短い外出は時盤、遠出や予定づくりは日盤を中心に見ると整理しやすくなります。',
    date: '2026/06/04',
  },
  {
    id: 'history-2026-06-03',
    type: 'history',
    sender: '通知履歴',
    title: 'お気に入り通知の準備中',
    body: 'お気に入り地点が最高方位になったときの通知は、今後の配線で有効化します。',
    date: '2026/06/03',
  },
];

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
  iconStyle: readStoredSetting('icon-style', 'emoji'),
  textSize: readStoredSetting('text-size', 'medium'),
});

export default function App() {
  const auth = useAuth();
  // 全機能を使えない人（未ログインなど）は「今日の盤の閲覧」だけ（lib/accessPolicy.js）。
  // 判定中（loading）は今日の盤のまま表示し、確定してから絞る（ちらつき防止）。
  const limited = auth.phase === 'ready' && !auth.full;
  const [state, setState] = useState({
    date: getBoardDate(),
    hour: 0,
    boardType: '\u65e5',
  });
  const [theme, setTheme] = useState(INITIAL_THEME);
  const [direction, setDirection] = useState('north_bottom');
  const [activeTab, setActiveTab] = useState('board');
  const [previousTab, setPreviousTab] = useState('board');
  const [hasVisitedDirection, setHasVisitedDirection] = useState(false);
  const [error, setError] = useState(null);
  const [boardReturnTab, setBoardReturnTab] = useState(null);
  const [boardScrollRequest, setBoardScrollRequest] = useState(0);
  const [iconStyle, setIconStyle] = useState(() => readStoredSetting('icon-style', 'emoji'));
  const [textSize, setTextSize] = useState(() => readStoredSetting('text-size', 'medium'));
  const [omamoriReminder, setOmamoriReminder] = useState(() => readStoredBoolSetting('omamori-reminder'));
  const [favoriteBestNotify, setFavoriteBestNotify] = useState(() => readStoredBoolSetting('favorite-best-notify'));
  const [showBadDirections, setShowBadDirections] = useState(() => readStoredBoolSetting('show-bad-directions'));
  const [readNotificationIds, setReadNotificationIds] = useState(() => readStoredJsonArray(NOTIFICATION_READ_KEY));
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackState, setFeedbackState] = useState('idle'); // idle | sending | sent | error | limited
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // 表示の設定を <html> に反映（アイコン切替・文字サイズ）。
  useEffect(() => {
    applyDisplaySettings({ iconStyle, textSize });
  }, [iconStyle, textSize]);

  // 通知の設定に応じたお知らせ（今日のお守り・お気に入りが最高方位）。タブを切り替えるたびに計算し直す。
  const dynamicNotices = useMemo(
    () => computeDynamicNotices({ omamoriReminder, favoriteBestNotify }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [omamoriReminder, favoriteBestNotify, activeTab],
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
                kaisetsuKey={`${board.meta?.kyokusu || ''}${board.meta?.eto || ''}`}
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

  const settingsView = (
    <main className="settings-view">
      <section className="settings-card">
        <h2 className="maru">設定</h2>
        <p>テーマと表示まわりを切り替えます。</p>

        <div className="settings-section">
          <h3 className="maru">テーマ</h3>
          <div className="theme-chips" role="group" aria-label="テーマ切替">
            {THEMES.map((item) => (
              <button
                key={item.name}
                type="button"
                className={`theme-chip${theme === item.name ? ' is-active' : ''}`}
                aria-pressed={theme === item.name}
                onClick={() => handleThemeChange(item.name)}
              >
                <span
                  className="theme-chip-dot"
                  style={{
                    background: item.dot,
                    boxShadow: item.dot.startsWith('linear')
                      ? '0 0 0 1px rgba(0,0,0,.12)'
                      : `0 0 7px ${item.dot}`,
                  }}
                  aria-hidden="true"
                />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-divider">
          <span className="lat">DISPLAY</span>
        </div>

        <div className="settings-section settings-panel-section">
          <div className="settings-section-head">
            <h3 className="maru">表示</h3>
            <span className="lat">Display</span>
          </div>
          <div className="settings-row">
            <div>
              <strong>アイコン切替</strong>
              <small>絵文字 / 色のつかない線の記号</small>
            </div>
            <div className="settings-segment" role="group" aria-label="アイコン切替">
              {[
                ['emoji', '絵文字'],
                ['line', '線アイコン'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={iconStyle === value ? 'is-active' : ''}
                  aria-pressed={iconStyle === value}
                  onClick={() => updateSetting('icon-style', setIconStyle)(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <div>
              <strong>文字サイズ</strong>
              <small>小 / 中 / 大</small>
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
        </div>

        <div className="settings-section settings-panel-section">
          <div className="settings-section-head">
            <h3 className="maru">通知</h3>
            <span className="lat">Notice</span>
          </div>
          <div className="settings-row">
            <div>
              <strong>お守りリマインド</strong>
              <small>今日のお守りを引いていないとき、アプリを開くとお知らせします</small>
            </div>
            <button
              type="button"
              className={`settings-switch${omamoriReminder ? ' is-on' : ''}`}
              aria-pressed={omamoriReminder}
              onClick={() => toggleSetting('omamori-reminder', setOmamoriReminder)(omamoriReminder)}
            >
              <span />
            </button>
          </div>
          <div className="settings-row">
            <div>
              <strong>お気に入りが最高方位になったら通知</strong>
              <small>今の時間帯の最高方位にお気に入りがあるとき、アプリを開くとお知らせします</small>
            </div>
            <button
              type="button"
              className={`settings-switch${favoriteBestNotify ? ' is-on' : ''}`}
              aria-pressed={favoriteBestNotify}
              onClick={() => toggleSetting('favorite-best-notify', setFavoriteBestNotify)(favoriteBestNotify)}
            >
              <span />
            </button>
          </div>
        </div>

        <div className="settings-section settings-panel-section">
          <div className="settings-section-head">
            <h3 className="maru">プロ</h3>
            <span className="lat">Pro</span>
          </div>
          <div className="settings-row">
            <div>
              <strong>凶も見る</strong>
              <small>吉方位タブで、凶の方位・時間帯も表示します（「吉のみ表示」と連動）</small>
            </div>
            <button
              type="button"
              className={`settings-switch${showBadDirections ? ' is-on' : ''}`}
              aria-pressed={showBadDirections}
              onClick={() => toggleSetting('show-bad-directions', setShowBadDirections)(showBadDirections)}
            >
              <span />
            </button>
          </div>
        </div>

        <div className="settings-section settings-panel-section">
          <div className="settings-section-head">
            <h3 className="maru">アカウント</h3>
            <span className="lat">Account</span>
          </div>
          <AccountSettings />
        </div>

        <div className="settings-section settings-panel-section">
          <div className="settings-section-head">
            <h3 className="maru">このアプリについて</h3>
            <span className="lat">About</span>
          </div>
          <div className="settings-info-row">
            <span>バージョン</span>
            <strong className="lat">{APP_VERSION}</strong>
          </div>
          {['利用規約', 'プライバシーポリシー'].map((label) => (
            <div key={label} className="settings-link-row is-disabled" aria-disabled="true">
              <span>{label}</span>
              <small>準備中</small>
            </div>
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
      {activeTab === 'board' && boardView}
      {activeTab === 'direction' && limited && (
        <main className="locked-view">
          <section className="locked-card">
            <span className="board-kicker lat">LUCKY DIRECTION</span>
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
        <div hidden={activeTab !== 'direction'}>
          <ReverseDirectionView
            isActive={activeTab === 'direction'}
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
        <button
          type="button"
          className={activeTab === 'board' ? 'is-active' : ''}
          onClick={() => setActiveTab('board')}
        >
          <span className="bottom-tab-icon">▦</span>
          <span>盤</span>
        </button>
        <button
          type="button"
          className={activeTab === 'direction' ? 'is-active' : ''}
          onClick={() => {
            setHasVisitedDirection(true);
            setActiveTab('direction');
          }}
        >
          <span className="bottom-tab-icon">✦</span>
          <span>吉方位</span>
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
          <span>設定</span>
        </button>
      </nav>
    </div>
  );
}
