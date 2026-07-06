import React, { useMemo, useState } from 'react';
import { lookupChito } from '../kimon/loadChito.js';
import { classifyPalace } from '../kaisetsu/classifyPalace.js';
import { useKaisetsuPalace } from '../kaisetsu/useKaisetsuPalace.js';
import { getMiniBoardToneClass } from './reverseDirection.js';

// 願い5軸（classifyPalace / kaisetsu API と同一キー。KaisetsuPanel.jsx と同じ表示ラベル）。
export const AXES = [
  { key: 'goen',    label: 'ご縁' },
  { key: 'shigoto', label: '仕事' },
  { key: 'kinun',   label: '金運' },
  { key: 'kenko',   label: '健康' },
  { key: 'benkyo',  label: '勉強' },
];

// 総合スコア（reverseDirection.js 由来）のトーン → 吉凶バッジ文言。
// 軸チップの◎○△▲×（kaisetsu 由来）とは別エンジンの評価であるため、
// バッジは "総合スコア" 側にのみ責務を持たせる（axisRanks とは食い違い得る。
// docs/axis_score_mismatch_v1.md 参照）。
const BADGE_LABEL = { daikichi: '大吉', shokichi: '吉', churitsu: '中立', kyo: '凶' };

function scoreText(score) {
  return `${score > 0 ? '+' : ''}${score}`;
}

// axisRanks は classifyPalace から直接算出する（認証・ネットワークに依存せず常時表示）。
// KaisetsuPanel.jsx の computeRanks() と同じデータ源・同じ壊れ方（例外を握りつぶし null）。
export function computeAxisRanks(key, palace) {
  if (!key || !palace) return null;
  try {
    const row = lookupChito(key);
    return classifyPalace(row, palace).axisRanks || null;
  } catch {
    return null;
  }
}

// mid本文（2〜3文）を「1文目=リード」「2文目以降=本文」に分割する。
export function splitMid(mid) {
  if (!mid) return { lead: '', body: '' };
  const idx = mid.indexOf('。');
  if (idx === -1) return { lead: mid, body: '' };
  const lead = mid.slice(0, idx + 1);
  const body = mid.slice(idx + 1).trim();
  return { lead, body };
}

/**
 * 時盤お散歩モードの最大吉カード（統合カード）。
 * 点数・吉凶バッジは reverse.rankings（reverseDirection.js）由来のまま、
 * 軸チップ＋意味テキストは kaisetsu（classifyPalace / /api/kaisetsu-full）由来。
 * 2つのデータ源は独立エンジンで食い違うことがあるため、UI上「テーマ別」と
 * ラベリングして総合スコアとは別軸の評価であることを明示する。
 */
export default function FusionCard({ best, boardKey }) {
  const [selAxis, setSelAxis] = useState('goen');
  const palace = best?.palace || null;
  const axisRanks = useMemo(() => computeAxisRanks(boardKey, palace), [boardKey, palace]);
  const { palaces, fullPalaces, fullErrorKey, isPaid } = useKaisetsuPalace(boardKey);

  if (!best) {
    return (
      <div className="reverse-card fusion">
        <div className="f-top">
          <div className="f-meta">
            <div className="f-tags">該当なし</div>
            <div className="f-tags" style={{ opacity: 0.7 }}>吉のみ表示中です。凶も見ると全方位を確認できます。</div>
          </div>
        </div>
      </div>
    );
  }

  const toneClass = getMiniBoardToneClass(best.score);
  const badgeLabel = BADGE_LABEL[toneClass] || '';
  const tags = [best.palaceData?.hachimon, best.palaceData?.hasshin, best.palaceData?.kyusei]
    .filter(Boolean)
    .join('・');
  const ganshi = `天盤${best.palaceData?.tenban || '-'} / 地盤${best.palaceData?.chiban || '-'}`;

  const fetchFailed = fullErrorKey === boardKey;
  const short = palaces?.[palace]?.[selAxis]?.short || null;
  const mid = isPaid ? fullPalaces?.[palace]?.[selAxis]?.mid || null : null;

  let leadText;
  let bodyNode = null;
  if (fetchFailed) {
    leadText = '読み込みに失敗しました';
  } else if (isPaid) {
    if (mid) {
      const split = splitMid(mid);
      leadText = split.lead;
      if (split.body) bodyNode = <div className="m-body">{split.body}</div>;
    } else {
      leadText = fullPalaces ? 'この方位・願いごとの解説はありません。' : '読み込み中…';
    }
  } else {
    leadText = short || (palaces ? 'この方位・願いごとの解説はありません。' : '読み込み中…');
    if (short) bodyNode = <div className="m-body m-cta">ログインすると続きが読めます。</div>;
  }

  return (
    <div className="reverse-card fusion">
      <div className="f-top">
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

      <div className="fusion-axis-kicker">テーマ別の相性</div>
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
              onClick={() => setSelAxis(a.key)}
            >
              {a.label}
              <span className="rk">{rank}</span>
            </button>
          );
        })}
      </div>

      <div className="meaning" style={{ borderLeftColor: `var(--axis-${selAxis})` }}>
        <div className="m-lead">{leadText}</div>
        {bodyNode}
      </div>
    </div>
  );
}
