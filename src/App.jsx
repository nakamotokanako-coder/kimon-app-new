import React, { useState, useMemo } from 'react';
import { buildBoard } from './kimon/buildBoard.js';
import { scoreBoard } from './kimon/scoreEngine.js';
import InputControls from './components/InputControls.jsx';
import MetaPanel from './components/MetaPanel.jsx';
import BoardGrid from './components/BoardGrid.jsx';
import ShouiPanel from './components/ShouiPanel.jsx';

const DEFAULT_THEME = 'dark-gold';
const THEMES = [
  { name: 'dark-gold', label: '黒金' },
  { name: 'navy-silver', label: '紺銀' },
  { name: 'washi-vermillion', label: '和' },
];
const THEME_NAMES = new Set(THEMES.map((theme) => theme.name));

function applyInitialTheme() {
  if (typeof document === 'undefined') return DEFAULT_THEME;

  let theme = DEFAULT_THEME;
  try {
    theme = localStorage.getItem('kimon-theme') || DEFAULT_THEME;
  } catch {
    theme = DEFAULT_THEME;
  }
  if (!THEME_NAMES.has(theme)) theme = DEFAULT_THEME;

  document.documentElement.dataset.theme = theme;
  return theme;
}

const INITIAL_THEME = applyInitialTheme();

export default function App() {
  const [state, setState] = useState({
    // 日盤の対応期間は 2026-01-01〜2044-01-31（day_kyokusu.csv）。
    // 初期値は範囲内の日付にする。
    date: '2026-05-18',
    hour: 0,
    boardType: '日',
  });
  const [theme, setTheme] = useState(INITIAL_THEME);
  const [direction, setDirection] = useState('north_bottom');
  const [error, setError] = useState(null);

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

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-row">
          <div className="brand-block">
            <span className="brand-mark">秘</span>
            <div>
              <h1>奇門遁甲</h1>
              <p className="subtitle">日盤・時盤デモ</p>
            </div>
          </div>
          <div className="header-controls">
            <div className="theme-switcher" aria-label="テーマ切替">
              {THEMES.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={theme === item.name ? 'is-active' : ''}
                  aria-pressed={theme === item.name}
                  onClick={() => handleThemeChange(item.name)}
                >
                  {item.label}
                </button>
              ))}
            </div>
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
        </div>
      </header>

      <main className="app-main">
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
              <MetaPanel meta={board.meta} banLevel={board.banLevel} />
              <BoardGrid
                palaces={board.palaces}
                scores={board.score?.palaces}
                direction={direction}
                kuubou={board.banLevel?.kuubou_text}
              />
            </div>
            <ShouiPanel board={board} />
          </>
        )}
      </main>
    </div>
  );
}
