import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import './BottomSheet.css';

const AXIS_NAMES = ['ご縁', '仕事', '金運', '健康', '勉強'];

const BREAKDOWN_LABELS = {
  tenban_kan: '天盤干',
  hachimon: '八門',
  kyusei: '九星',
  hasshin: '八神',
  jukkan_kokuou: '十干剋応',
  kakkyoku: '格局',
  monpaku: '門迫',
  kuubou: '空亡',
  ban_level_minus: '盤全体',
  junri_bonus: '順利',
};

function getBadge(score = 0) {
  if (score >= 60) return { label: '大吉', className: 'kichi' };
  if (score >= 20) return { label: '吉', className: 'kichi' };
  if (score >= -10) return { label: '中立', className: 'chu' };
  return { label: '凶', className: 'kyo' };
}

function scoreText(score) {
  if (typeof score !== 'number') return '—';
  return `${score > 0 ? '+' : ''}${score}`;
}

function buildBreakdown(score) {
  const breakdown = score?.breakdown || {};
  return Object.entries(BREAKDOWN_LABELS)
    .map(([key, label]) => ({ label, score: breakdown[key] }))
    .filter((item) => typeof item.score === 'number' && item.score !== 0);
}

function normalizeKakkyoku(kakkyoku) {
  if (!kakkyoku) return null;
  return {
    name: kakkyoku.name,
    meaning: kakkyoku.meaning || kakkyoku.keyword || kakkyoku.reading || '',
  };
}

export default function BottomSheet({ palace, onClose }) {
  const [activeAxis, setActiveAxis] = useState(0);
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    setActiveAxis(0);
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

  const score = palace?.score?.score;
  const badge = getBadge(score);
  const kakkyoku = normalizeKakkyoku(palace?.score?.detected_kakkyoku?.[0]);
  const breakdown = useMemo(() => buildBreakdown(palace?.score), [palace?.score]);

  if (!palace) return null;

  return createPortal(
    <>
      <div
        className="bs-overlay open"
        aria-hidden="true"
        onClick={onClose}
      />
      <section
        className="bottom-sheet open"
        role="dialog"
        aria-modal="true"
        aria-label={`${palace.label}の詳細`}
      >
        <button
          type="button"
          className="bs-handle"
          aria-label="閉じる"
          onClick={onClose}
        />

        <div className="sh-header">
          <div className="sh-dir">
            <span className="sh-dir-name">{palace.label}（{palace.direction}）</span>
            <span className={`sh-score ${score >= 0 ? 'plus' : 'minus'}`}>
              {scoreText(score)}
            </span>
            <span className={`sh-badge ${badge.className}`}>{badge.label}</span>
          </div>
          <div className="sh-meta">
            {[palace.data?.hachimon, palace.data?.hasshin, palace.data?.kyusei].filter(Boolean).join('・') || '—'}
          </div>
          <div className="sh-kanpair">
            天盤{palace.data?.tenban || '—'} / 地盤{palace.data?.chiban || '—'}
          </div>
        </div>

        {kakkyoku && (
          <div className="kakkyoku-card">
            <div className="kk-art">墨絵</div>
            <div className="kk-info">
              <div className="kk-name">{kakkyoku.name}</div>
              <div className="kk-desc">
                {kakkyoku.meaning || '格局の詳しい説明は準備中です'}
              </div>
            </div>
          </div>
        )}

        <div className="axis-compare">
          <div className="axis-compare-title">5軸ざっくり比較</div>
          {AXIS_NAMES.map((label) => (
            <div className="axis-row" key={label}>
              <span className="axis-label">{label}</span>
              <span className="axis-val pending">—（準備中）</span>
            </div>
          ))}
        </div>

        <div className="axis-seg" role="tablist" aria-label="願いごと">
          {AXIS_NAMES.map((label, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={activeAxis === index}
              className={`axis-btn ${activeAxis === index ? 'active' : ''}`}
              onClick={() => setActiveAxis(index)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="reading">
          <div className="reading-title">{AXIS_NAMES[activeAxis]}</div>
          <p>（準備中：Phase 2 で解説テキストが入ります）</p>
        </div>

        <button
          type="button"
          className={`why-toggle ${whyOpen ? 'open' : ''}`}
          aria-expanded={whyOpen}
          onClick={() => setWhyOpen((current) => !current)}
        >
          なぜこの評価？
        </button>
        <div className={`why-detail ${whyOpen ? 'open' : ''}`}>
          {breakdown.length > 0 ? (
            breakdown.map((item) => (
              <div className="why-item" key={item.label}>
                <span className="factor">{item.label}</span>
                <span className={`pts ${item.score >= 0 ? 'plus' : 'minus'}`}>
                  {scoreText(item.score)}
                </span>
              </div>
            ))
          ) : (
            <div className="why-empty">評価内訳はありません</div>
          )}
        </div>

        <div className="sh-actions">
          <button type="button" className="sh-action" onClick={() => {}}>
            この方位で行き先を探す →
          </button>
          {kakkyoku && (
            <button type="button" className="sh-action" onClick={() => {}}>
              この格局が出る日を探す →
            </button>
          )}
        </div>
      </section>
    </>,
    document.body
  );
}
