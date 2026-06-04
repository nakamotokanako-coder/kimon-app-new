import React, { useEffect, useState, useMemo } from 'react';
import { buildBoard } from './kimon/buildBoard.js';
import { scoreBoard } from './kimon/scoreEngine.js';
import InputControls from './components/InputControls.jsx';
import MetaPanel from './components/MetaPanel.jsx';
import BoardGrid from './components/BoardGrid.jsx';
import ShouiPanel from './components/ShouiPanel.jsx';
import ReverseDirectionView from './reverseDirection/ReverseDirectionView.jsx';

const DEFAULT_THEME = 'void';
const THEMES = [
  { name: 'void', label: '漆黒', dot: '#ffd368' },
  { name: 'blue', label: '深海', dot: '#46e8ff' },
  { name: 'purple', label: '星雲', dot: '#c98bff' },
  { name: 'pearl', label: 'パール', dot: 'linear-gradient(135deg,#fff,#f0e6ee 55%,#e6eef7)' },
  { name: 'pink', label: 'ピンク', dot: '#ef8fb4' },
];
const THEME_NAMES = new Set(THEMES.map((theme) => theme.name));
/** 旧テーマ名 → 宇宙テーマ名（既存ユーザーの localStorage 互換） */
const LEGACY_THEME_MAP = {
  'dark-gold': 'void',
  'navy-silver': 'blue',
  'washi-vermillion': 'pearl',
  'dusty-pink': 'pink',
};

function getTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
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

export default function App() {
  const [state, setState] = useState({
    date: getTodayJst(),
    hour: 0,
    boardType: '\u65e5',
  });
  const [theme, setTheme] = useState(INITIAL_THEME);
  const [direction, setDirection] = useState('north_bottom');
  const [activeTab, setActiveTab] = useState('board');
  const [hasVisitedDirection, setHasVisitedDirection] = useState(false);
  const [error, setError] = useState(null);
  const [boardReturnTab, setBoardReturnTab] = useState(null);
  const [boardScrollRequest, setBoardScrollRequest] = useState(0);

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
              <h1>奇門遁甲</h1>
              <p className="subtitle">日盤・時盤メモ</p>
            </div>
          </div>
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
          onChange={handleChange}
        />

        {error && <div className="error">エラー: {error}</div>}

        {board && (
          <>
            <div className="board-area">
              <BoardGrid
                palaces={board.palaces}
                scores={board.score?.palaces}
                banLevel={board.banLevel}
                direction={direction}
                kuubou={board.banLevel?.kuubou_text}
                junshu={board.meta?.junshu}
                tenbanJunshuPalace={board.meta?.tenban_junshu_p}
                chibanJunshuPalace={board.meta?.chiban_junshu_p}
              />
              <MetaPanel meta={board.meta} banLevel={board.banLevel} />
            </div>
            <ShouiPanel board={board} />
          </>
        )}
      </main>
    </>
  );

  const settingsView = (
    <main className="settings-view">
      <section className="settings-card">
        <h2>設定</h2>
        <p>テーマと盤の方位表示を切り替えます。</p>

        <div className="settings-section">
          <h3>テーマ</h3>
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

        <div className="settings-section">
          <h3>盤の方位表示</h3>
          <div className="direction-toggle" aria-label="方位表示">
            <span className="direction-label">方位</span>
            <label>
              <input
                type="radio"
                name="direction"
                value="north_bottom"
                checked={direction === 'north_bottom'}
                onChange={() => setDirection('north_bottom')}
              />
              北を下
            </label>
            <label>
              <input
                type="radio"
                name="direction"
                value="south_bottom"
                checked={direction === 'south_bottom'}
                onChange={() => setDirection('south_bottom')}
              />
              南を下
            </label>
          </div>
        </div>
      </section>
    </main>
  );

  return (
    <div className="app app-with-tabs">
      <div className="vig" aria-hidden="true" />
      {activeTab === 'board' && boardView}
      {hasVisitedDirection && (
        <div hidden={activeTab !== 'direction'}>
          <ReverseDirectionView
            isActive={activeTab === 'direction'}
            onOpenBoard={openFullBoard}
          />
        </div>
      )}
      {activeTab === 'settings' && settingsView}

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
          <span className="bottom-tab-icon">⚙</span>
          <span>設定</span>
        </button>
      </nav>
    </div>
  );
}
