import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useKaisetsuPalace } from '../../kaisetsu/useKaisetsuPalace.js';
import {
  AXES,
  BADGE_LABEL,
  computeAxisRanks,
  scoreText,
} from '../../reverseDirection/FusionCard.jsx';
import { getMiniBoardToneClass } from '../../reverseDirection/reverseDirection.js';
import { buildYohoBreakdown, yohoElementText, yohoToneClass } from '../../reverseDirection/yohoKaisetsuBreakdown.js';

// 時盤お散歩モードのFusionCard（L2）をタップすると開く30秒の層（L3）。
// 開閉の実装（createPortal・常時マウント・.openクラス・Escape対応）は
// src/components/BottomSheet.jsx（盤タブ）と同じ方式を踏襲する（盤タブ側は変更しない）。
export default function L3Sheet({ best, boardKey, banLevel, selAxis, onAxisChange, onClose, onGoToSearch }) {
  const [whyOpen, setWhyOpen] = useState(false);
  const palace = best?.palace || null;

  useEffect(() => {
    setWhyOpen(false);
  }, [palace]);

  useEffect(() => {
    if (!best) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [best, onClose]);

  const axisRanks = useMemo(() => computeAxisRanks(boardKey, palace), [boardKey, palace]);
  const { palaces, fullPalaces, fullErrorKey, isPaid } = useKaisetsuPalace(boardKey);
  const breakdown = useMemo(
    () => (best ? buildYohoBreakdown(best.palaceScore, best.palaceData) : []),
    [best],
  );

  if (!best) return null;

  const toneClassName = getMiniBoardToneClass(best.score);
  const badgeLabel = BADGE_LABEL[toneClassName] || '';
  const tags = [best.palaceData?.hachimon, best.palaceData?.hasshin, best.palaceData?.kyusei]
    .filter(Boolean)
    .join('・');
  const ganshi = `天盤${best.palaceData?.tenban || '-'} / 地盤${best.palaceData?.chiban || '-'}`;
  const activeAxis = AXES.find((a) => a.key === selAxis) || AXES[0];

  const fetchFailed = fullErrorKey === boardKey;
  const short = palaces?.[palace]?.[selAxis]?.short || null;
  const full = isPaid ? fullPalaces?.[palace]?.[selAxis]?.full || null : null;

  let readingNode;
  if (fetchFailed) {
    readingNode = <p className="l3-reading-text">読み込みに失敗しました</p>;
  } else if (isPaid) {
    readingNode = (
      <p className="l3-reading-text">
        {full || (fullPalaces ? 'この方位・願いごとの解説はありません。' : '読み込み中…')}
      </p>
    );
  } else {
    readingNode = (
      <>
        <p className="l3-reading-text">{short || (palaces ? 'この方位・願いごとの解説はありません。' : '読み込み中…')}</p>
        {short && <p className="l3-reading-cta">ログインすると続きが読めます。</p>}
      </>
    );
  }

  const handleGoToSearch = () => {
    onClose?.();
    onGoToSearch?.();
  };

  return createPortal(
    <>
      <div className="l3-overlay open" aria-hidden="true" onClick={onClose} />
      <section
        className="l3-sheet open"
        role="dialog"
        aria-modal="true"
        aria-label={`${best.label}の詳細`}
      >
        <button type="button" className="l3-handle" aria-label="閉じる" onClick={onClose} />

        <div className="l3-content">
          <div className="l3-header">
            <div className="dir-badge">
              <span className="en">{best.short}</span>
              <span className="jp">{best.label}</span>
            </div>
            <div className="f-score metal lat">{scoreText(best.score)}</div>
            <div className="f-meta">
              <div className="f-tags">{tags || '—'}</div>
              <div className="f-tags" style={{ opacity: 0.7 }}>{ganshi}</div>
            </div>
            {badgeLabel && <div className="kichi-badge">{badgeLabel}</div>}
          </div>

          <div className="fusion-axis-kicker">5軸の評価</div>
          <div className="axes" role="tablist" aria-label="願いごと">
            {AXES.map((a) => {
              const on = a.key === selAxis;
              const rank = axisRanks?.[a.key] || '—';
              return (
                <button
                  key={a.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className={`axis${on ? ' on' : ''}`}
                  style={on ? { background: `var(--axis-${a.key})`, borderColor: `var(--axis-${a.key})` } : undefined}
                  onClick={() => onAxisChange?.(a.key)}
                >
                  {a.label}
                  <span className="rk">{rank}</span>
                </button>
              );
            })}
          </div>

          <div className="meaning l3-reading" style={{ borderLeftColor: `var(--axis-${selAxis})` }}>
            <div className="m-lead">{activeAxis.label}の読み</div>
            {readingNode}
          </div>

          <div className="l3-walk-tip">
            <p>500m以上・5分ほど滞在すると効果が出やすいとされます（目安の効果は5日）。</p>
          </div>

          <div className="l3-why">
            <button
              type="button"
              className={`l3-why-toggle${whyOpen ? ' open' : ''}`}
              aria-expanded={whyOpen}
              onClick={() => setWhyOpen((value) => !value)}
            >
              評価の解説
            </button>
            <div className={`l3-why-detail${whyOpen ? ' open' : ''}`}>
              {breakdown.length > 0 ? (
                breakdown.map((item) => (
                  <div className="l3-why-row" key={item.key}>
                    <span className="l3-why-factor">{item.label}</span>
                    <span className={`l3-why-desc shoui-${yohoToneClass(item.score)}`}>
                      {yohoElementText(item.key, best.palaceScore, best.palaceData, banLevel)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="l3-why-empty">評価内訳はありません</div>
              )}
            </div>
          </div>

          <div className="l3-actions">
            <button type="button" className="l3-action-primary" onClick={handleGoToSearch}>
              この方位で行き先を探す →
            </button>
          </div>
        </div>
      </section>
    </>,
    document.body,
  );
}
