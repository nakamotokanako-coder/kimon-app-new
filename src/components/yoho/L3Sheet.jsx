import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useKaisetsuPalace } from '../../kaisetsu/useKaisetsuPalace.js';
import {
  AXES,
  BADGE_LABEL,
  computeAxisRanks,
  dateCapNote,
  scoreText,
} from '../../reverseDirection/FusionCard.jsx';
import { getMiniBoardToneClass } from '../../reverseDirection/reverseDirection.js';
import { dateBoundParagraph } from '../../kimon/palaceExplain.js';
import { ProseText } from '../../kaisetsu/renderProse.jsx';
import { lockedMessage } from '../../../lib/accessPolicy.js';

// 時盤お散歩モードのFusionCard（L2）をタップすると開く30秒の層（L3）。
// 開閉の実装（createPortal・常時マウント・.openクラス・Escape対応）は
// src/components/BottomSheet.jsx（盤タブ）と同じ方式。点数は総合点だけを出す（要素ごとの内訳は出さない）。
export default function L3Sheet({ best, boardKey, banLevel, selAxis, onAxisChange, onClose, onGoToSearch }) {
  const palace = best?.palace || null;

  useEffect(() => {
    if (!best) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [best, onClose]);

  // 開いている間は後ろのページを止める（指の動きが後ろのページや地図に取られて、シートが動かなくなるのを防ぐ）。
  const isOpen = Boolean(best);
  useEffect(() => {
    if (!isOpen) return undefined;
    const root = document.documentElement;
    root.classList.add('sheet-scroll-lock');
    return () => root.classList.remove('sheet-scroll-lock');
  }, [isOpen]);

  const axisRanks = useMemo(() => computeAxisRanks(boardKey, palace, best?.palaceScore), [boardKey, palace, best?.palaceScore]);
  const capNote = useMemo(() => dateCapNote(boardKey, palace, best?.palaceScore), [boardKey, palace, best?.palaceScore]);
  const { palaces, fullPalaces, fullErrorKey, isPaid } = useKaisetsuPalace(boardKey);

  if (!best) return null;

  const toneClassName = getMiniBoardToneClass(best.score, best.palaceScore);
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
      full
        ? <ProseText text={full} className="l3-reading-text" />
        : <p className="l3-reading-text">{fullPalaces ? 'この方位・願いごとの解説はありません。' : '読み込み中…'}</p>
    );
  } else {
    readingNode = (
      <>
        <p className="l3-reading-text">{short || (palaces ? 'この方位・願いごとの解説はありません。' : '読み込み中…')}</p>
        {short && <p className="l3-reading-cta">{lockedMessage()}</p>}
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
        <div className="l3-top">
          <div className="l3-handle" aria-hidden="true" onClick={onClose} />
          <button type="button" className="l3-close" aria-label="閉じる" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="l3-content">
          <div className="l3-header">
            <div className="dir-badge">
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
            {capNote && <p className="l3-reading-text date-cap-note">{capNote}</p>}
            {dateBoundParagraph(best.palaceScore) && (
              <ProseText text={dateBoundParagraph(best.palaceScore)} className="date-bound-prose l3-reading-text" />
            )}
          </div>

          <div className="l3-walk-tip">
            <p>500m以上・5分ほど滞在すると効果が出やすいとされます（目安の効果は5日）。</p>
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
