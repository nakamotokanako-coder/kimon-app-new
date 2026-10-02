import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { computeAxisRanks, BADGE_LABEL } from '../reverseDirection/FusionCard.jsx';
import { getMiniBoardToneClass } from '../reverseDirection/reverseDirection.js';
import { buildScoreBreakdown, listKakkyoku } from '../kimon/palaceExplain.js';
import { useKaisetsuPalace } from '../kaisetsu/useKaisetsuPalace.js';
import { lockedMessage } from '../../lib/accessPolicy.js';
import './BottomSheet.css';

// 盤のセルをタップしたときの詳細シート。
// 判定・文章はすべて吉方位タブと同じ出どころを使う（画面ごとに評価がぶれないように）:
//   吉凶バッジ … reverseDirection.getMiniBoardToneClass（吉方位タブと同じ基準）
//   5テーマの◎○× … classifyPalace の軸ランク（FusionCard.computeAxisRanks）
//   解説文 … /api/kaisetsu・/api/kaisetsu-full（useKaisetsuPalace。出し分けは lib/accessPolicy.js）
//   評価の解説 … kimon/palaceExplain.js（点数付き。行を足すと総合点になる）

const AXES = [
  { key: 'goen', label: 'ご縁' },
  { key: 'shigoto', label: '仕事' },
  { key: 'kinun', label: '金運' },
  { key: 'kenko', label: '健康' },
  { key: 'benkyo', label: '勉強' },
];

const axisClassName = (key) => ({
  kenko: 'kenkou',
  benkyo: 'benkyou',
}[key] || key);

const TONE_TO_BADGE_CLASS = { daikichi: 'kichi', shokichi: 'kichi', churitsu: 'chu', kyo: 'kyo' };

export function getBadge(score = 0, scoreResult = null) {
  const tone = getMiniBoardToneClass(score, scoreResult);
  return { label: BADGE_LABEL[tone] || '', className: TONE_TO_BADGE_CLASS[tone] || 'chu' };
}

function scoreText(score) {
  if (typeof score !== 'number') return '—';
  return `${score > 0 ? '+' : ''}${score}`;
}

function rankClass(symbol) {
  if (symbol === '◎' || symbol === '○') return 'good';
  if (symbol === '△') return 'neutral';
  if (symbol === '▲' || symbol === '×') return 'bad';
  return 'neutral';
}

export default function BottomSheet({ palace, kaisetsuKey, onClose, onOverlayTap, onOpenAccountSettings }) {
  const [activeAxis, setActiveAxis] = useState('goen');
  const [whyOpen, setWhyOpen] = useState(false);
  const { palaces, fullPalaces, fullErrorKey, isPaid, auth } = useKaisetsuPalace(palace ? kaisetsuKey : null);

  useEffect(() => {
    setWhyOpen(false);
  }, [palace?.key]);

  useEffect(() => {
    if (!palace) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, palace]);

  const axisRanks = useMemo(() => computeAxisRanks(kaisetsuKey, palace?.key), [kaisetsuKey, palace?.key]);
  const breakdown = useMemo(
    () => buildScoreBreakdown(palace?.score, palace?.data, palace?.banLevel),
    [palace?.score, palace?.data, palace?.banLevel],
  );
  const kakkyokuList = useMemo(() => listKakkyoku(palace?.score), [palace?.score]);

  if (!palace) return null;

  const score = palace.score?.score;
  const badge = getBadge(score, palace.score);
  const axisLabel = AXES.find((a) => a.key === activeAxis)?.label || '';

  const short = palaces?.[palace.key]?.[activeAxis]?.short || null;
  const mid = fullPalaces?.[palace.key]?.[activeAxis]?.mid || null;
  let readingNode;
  if (isPaid) {
    if (fullErrorKey === kaisetsuKey) {
      readingNode = <p className="reading-state error">解説を取得できませんでした。時間をおいてもう一度お試しください。</p>;
    } else {
      readingNode = (
        <p className={`reading-state ${mid ? 'ready' : 'loading'}`}>
          {mid || (fullPalaces ? 'この願いごとの詳しい解説はまだありません。' : '解説を読み込んでいます。')}
        </p>
      );
    }
  } else {
    readingNode = (
      <>
        <p className={`reading-state ${short ? 'ready' : 'loading'}`}>
          {short || (palaces ? 'この願いごとの解説はまだありません。' : '解説を読み込んでいます。')}
        </p>
        {auth.phase === 'ready' && (
          <div className="reading-lock">
            <p className="reading-lock-note">{lockedMessage()}</p>
            {!auth.loggedIn && onOpenAccountSettings && (
              <button type="button" className="reading-lock-cta" onClick={() => { onClose?.(); onOpenAccountSettings(); }}>
                ログインする
              </button>
            )}
          </div>
        )}
      </>
    );
  }

  return createPortal(
    <>
      <div
        className="sheet-overlay open"
        aria-hidden="true"
        onClick={onOverlayTap || onClose}
      />
      <section
        className="sheet open"
        role="dialog"
        aria-modal="true"
        aria-label={`${palace.label}の詳細`}
      >
        <button
          type="button"
          className="sheet-handle"
          aria-label="閉じる"
          onClick={onClose}
        />

        <div className="sheet-content">
          <div className="sh-header">
            <div className="sh-dir">
              <span className="sh-dir-name">{palace.label}（{palace.direction}）</span>
              <span className={`sh-score ${score >= 0 ? 'plus' : 'minus'}`}>
                {scoreText(score)}
              </span>
              {badge.label && <span className={`sh-badge ${badge.className}`}>{badge.label}</span>}
            </div>
            <div className="sh-meta">
              {[palace.data?.hachimon, palace.data?.hasshin, palace.data?.kyusei].filter(Boolean).join('・') || '—'}
            </div>
            <div className="sh-kanpair">
              天盤{palace.data?.tenban || '—'} / 地盤{palace.data?.chiban || '—'}
            </div>
          </div>

          {kakkyokuList.map((k) => (
            <div className={`kakkyoku-card ${k.tone}`} key={k.name}>
              <div className="kk-info">
                <div className="kk-name">{k.name}</div>
                <div className="kk-desc">{k.meaning || 'この格局の説明は登録されていません。'}</div>
              </div>
            </div>
          ))}

          <div className="axis-compare-title sh-axis-title">5テーマの評価</div>
          <div className="axis-seg" role="tablist" aria-label="願いごと">
            {AXES.map((axis) => {
              const symbol = axisRanks?.[axis.key] || '—';
              const on = activeAxis === axis.key;
              return (
                <button
                  key={axis.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-axis={axis.key}
                  className={`axis-btn ${on ? `active ${axisClassName(axis.key)}` : ''}`}
                  onClick={() => setActiveAxis(axis.key)}
                >
                  {axis.label}
                  <span className={`axis-symbol ${rankClass(symbol)}`}>{symbol}</span>
                </button>
              );
            })}
          </div>

          <div
            className={`reading text-card ${axisClassName(activeAxis)}`}
            data-axis={activeAxis}
          >
            <div className="reading-title">{axisLabel}</div>
            {readingNode}
          </div>

          <div className="why-card">
            <button
              type="button"
              className={`why-toggle ${whyOpen ? 'open' : ''}`}
              aria-expanded={whyOpen}
              onClick={() => setWhyOpen((current) => !current)}
            >
              評価の解説
            </button>
            <div className={`why-detail ${whyOpen ? 'open' : ''}`}>
              {breakdown.length > 0 ? (
                <>
                  {breakdown.map((item) => (
                    <div className="why-item why-row" key={item.key}>
                      <span className="factor">{item.label}</span>
                      <span className={`pts ${item.points >= 0 ? 'plus' : 'minus'}`}>{scoreText(item.points)}</span>
                      <span className={`why-desc ${item.tone}`}>{item.desc}</span>
                    </div>
                  ))}
                  {typeof score === 'number' && (
                    <div className="why-item why-row total">
                      <span className="factor">総合評価</span>
                      <span className={`pts ${score >= 0 ? 'plus' : 'minus'}`}>{scoreText(score)}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="why-empty">評価内訳はありません</div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>,
    document.body
  );
}
