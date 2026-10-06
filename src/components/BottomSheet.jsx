import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { computeAxisRanks, BADGE_LABEL } from '../reverseDirection/FusionCard.jsx';
import { getMiniBoardToneClass } from '../reverseDirection/reverseDirection.js';
import { buildScoreBreakdown, dateBoundParagraph } from '../kimon/palaceExplain.js';
import { buildElementStudyCards, buildKakkyokuStudyCards } from '../kimon/studyCards.js';
import StudyCard from './StudyCard.jsx';
import { useKaisetsuPalace } from '../kaisetsu/useKaisetsuPalace.js';
import { ProseText } from '../kaisetsu/renderProse.jsx';
import { lockedMessage } from '../../lib/accessPolicy.js';
import './BottomSheet.css';

// 盤のセルをタップしたときの詳細シート。2つの層に分ける。
//   1. この方位をどう使う？ … 専門の知識がなくても分かる結論（点数・吉凶・ひとこと・5テーマ・テーマ別の読み方）
//   2. この盤から学ぶ       … この判定になった理由。実際の盤を教材にして、格局や八門を覚える（学習カード）
// 情報は減らさない。同じ強さで並べず、階層を分ける。
// 判定・文章はすべて吉方位タブと同じ出どころを使う（画面ごとに評価がぶれないように）:
//   吉凶バッジ … reverseDirection.getMiniBoardToneClass（吉方位タブと同じ基準）
//   5テーマの◎○× … classifyPalace の軸ランク（FusionCard.computeAxisRanks）
//   解説文 … /api/kaisetsu・/api/kaisetsu-full（useKaisetsuPalace。出し分けは lib/accessPolicy.js）
//             全機能を使える人には、吉方位タブと同じ4段落の文章（full）を出す
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

/** 吉凶ごとの、ひとことの結論（効果は約束しない。使う・使わないの目安だけ） */
export const TONE_HEADLINE = {
  daikichi: '積極的に使いたい方位',
  shokichi: '使いやすい方位',
  churitsu: '良くも悪くもない方位',
  kyo: '積極的には使わない方位',
};

/** 5テーマのうち、向いているもの・向かないものを一文にする */
export function summarizeAxes(axisRanks) {
  if (!axisRanks) return '';
  const good = AXES.filter((a) => axisRanks[a.key] === '◎' || axisRanks[a.key] === '○').map((a) => a.label);
  const soso = AXES.filter((a) => axisRanks[a.key] === '△').map((a) => a.label);
  if (good.length === AXES.length) return '5つのテーマすべてに向いています。';
  if (good.length > 0) return `向いているのは、${good.join('・')}です。`;
  if (soso.length > 0) return `どのテーマにも強くは向きません。使うなら、${soso.join('・')}の用事にとどめます。`;
  return 'どのテーマにも向きません。大事な用事は、別の方位を選びます。';
}

function rankClass(symbol) {
  if (symbol === '◎' || symbol === '○') return 'good';
  if (symbol === '△') return 'neutral';
  if (symbol === '▲' || symbol === '×') return 'bad';
  return 'neutral';
}

export default function BottomSheet({ palace, kaisetsuKey, onClose, onOverlayTap, onOpenAccountSettings, prev, next, onNavigate }) {
  const contentRef = useRef(null);
  const [activeAxis, setActiveAxis] = useState('goen');
  const [whyOpen, setWhyOpen] = useState(false);
  const { palaces, fullPalaces, fullErrorKey, isPaid, auth } = useKaisetsuPalace(palace ? kaisetsuKey : null);

  // 隣の方位へ移ったら先頭から読めるように戻す。「評価の解説」の開閉は見比べやすいようにそのまま、閉じたら畳む。
  useEffect(() => {
    if (!palace?.key) setWhyOpen(false);
    else if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [palace?.key]);

  useEffect(() => {
    if (!palace) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, palace]);

  // 開いている間は後ろのページを止める（指の動きが後ろのページに取られて、シートが動かなくなるのを防ぐ）。
  const isOpen = Boolean(palace);
  useEffect(() => {
    if (!isOpen) return undefined;
    const root = document.documentElement;
    root.classList.add('sheet-scroll-lock');
    return () => root.classList.remove('sheet-scroll-lock');
  }, [isOpen]);

  const axisRanks = useMemo(() => computeAxisRanks(kaisetsuKey, palace?.key), [kaisetsuKey, palace?.key]);
  const breakdown = useMemo(
    () => buildScoreBreakdown(palace?.score, palace?.data, palace?.banLevel),
    [palace?.score, palace?.data, palace?.banLevel],
  );
  const kakkyokuCards = useMemo(() => buildKakkyokuStudyCards(palace?.score, palace?.data), [palace?.score, palace?.data]);
  const elementCards = useMemo(() => buildElementStudyCards(palace?.score, palace?.data), [palace?.score, palace?.data]);

  if (!palace) return null;

  const score = palace.score?.score;
  const badge = getBadge(score, palace.score);
  const headline = TONE_HEADLINE[getMiniBoardToneClass(score || 0, palace.score)] || '';
  const axisSummary = summarizeAxes(axisRanks);
  const axisLabel = AXES.find((a) => a.key === activeAxis)?.label || '';

  const short = palaces?.[palace.key]?.[activeAxis]?.short || null;
  const cell = fullPalaces?.[palace.key]?.[activeAxis];
  const reading = cell?.full || cell?.mid || null;
  let readingNode;
  if (isPaid) {
    if (fullErrorKey === kaisetsuKey) {
      readingNode = <p className="reading-state error">解説を取得できませんでした。時間をおいてもう一度お試しください。</p>;
    } else {
      readingNode = (
        reading
          ? <ProseText text={reading} className="reading-state ready" />
          : (
            <p className="reading-state loading">
              {fullPalaces ? 'この願いごとの詳しい解説はまだありません。' : '解説を読み込んでいます。'}
            </p>
          )
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
        className="sheet ds open"
        role="dialog"
        aria-modal="true"
        aria-label={`${palace.label}の詳細`}
      >
        <div className="sheet-top">
          <div className="sheet-handle" aria-hidden="true" onClick={onClose} />
          {/* 中央が、いま見ている方位。左右が、隣の方位 */}
          <div className="sheet-nav">
            {onNavigate && prev && (
              <button type="button" className="sheet-nav-btn is-prev" aria-label={`前の方位（${prev.direction}）`} onClick={() => onNavigate(prev.key)}>
                <span aria-hidden="true">←</span> {prev.direction}
              </button>
            )}
            <p className="sheet-nav-now" aria-hidden="true">
              <strong>{palace.direction}</strong><span>{palace.label}</span>
            </p>
            {onNavigate && next && (
              <button type="button" className="sheet-nav-btn is-next" aria-label={`次の方位（${next.direction}）`} onClick={() => onNavigate(next.key)}>
                {next.direction} <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
          <button type="button" className="sheet-close-btn" aria-label="閉じる" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="sheet-content" ref={contentRef}>
          {/* ── 1. この方位をどう使う？ ── */}
          <section className="ds-section ds-use" aria-label="この方位をどう使う？">
            <p className="ds-eyebrow">この方位をどう使う？</p>
            <div className="sh-header">
              <div className="sh-dir">
                <span className="sh-dir-name">{palace.label}（{palace.direction}）</span>
                <span className={`sh-score ${score >= 0 ? 'plus' : 'minus'}`}>
                  {scoreText(score)}
                </span>
                {badge.label && <span className={`sh-badge ${badge.className}`}>{badge.label}</span>}
              </div>
              {headline && <p className="ds-headline">{headline}</p>}
              {axisSummary && <p className="ds-summary">{axisSummary}</p>}
            </div>

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
              <div className="reading-title">{axisLabel}の読み方</div>
              {readingNode}
              {dateBoundParagraph(palace.score) && (
                <ProseText text={dateBoundParagraph(palace.score)} className="date-bound-prose" />
              )}
            </div>
          </section>

          {/* ── 2. この盤から学ぶ ── */}
          <section className="ds-section ds-learn" aria-label="この盤から学ぶ">
            <p className="ds-eyebrow">この盤から学ぶ</p>
            <h3 className="ds-title">この判定になった理由</h3>

            <div className="ds-placement">
              <p className="ds-placement-label">この方位の配置</p>
              <div className="sh-meta">
                {[palace.data?.hachimon, palace.data?.hasshin, palace.data?.kyusei].filter(Boolean).join('・') || '—'}
              </div>
              <div className="sh-kanpair">
                天盤{palace.data?.tenban || '—'} / 地盤{palace.data?.chiban || '—'}
              </div>
            </div>

            {kakkyokuCards.length > 0 ? (
              <>
                <p className="ds-lead">この方位には、格局が{kakkyokuCards.length}つ出ています。</p>
                <ul className="ds-index" aria-label="出ている格局">
                  {kakkyokuCards.map((card) => (
                    <li key={card.id} className={`tone-${card.tone}`}>
                      <span>{card.name}</span>
                      <b>{card.toneLabel}</b>
                    </li>
                  ))}
                </ul>
                {kakkyokuCards.map((card) => (
                  <StudyCard key={card.id} card={card} className="kakkyoku-card" />
                ))}
              </>
            ) : (
              <p className="ds-lead">この方位には、格局は出ていません。配置の要素だけで点数が決まっています。</p>
            )}

            {elementCards.length > 0 && (
              <>
                <h4 className="ds-subtitle">配置の要素</h4>
                {elementCards.map((card) => <StudyCard key={card.id} card={card} />)}
              </>
            )}

            <div className="why-card">
              <button
                type="button"
                className={`why-toggle ${whyOpen ? 'open' : ''}`}
                aria-expanded={whyOpen}
                aria-label="評価の解説"
                onClick={() => setWhyOpen((current) => !current)}
              >
                点数の内訳
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
          </section>
        </div>
      </section>
    </>,
    document.body
  );
}
