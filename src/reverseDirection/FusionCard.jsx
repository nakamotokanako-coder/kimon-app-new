import React, { useMemo, useState } from 'react';
import { lookupChito } from '../kimon/loadChito.js';
import { classifyPalace, axisCapForTotal, capAxisRanks } from '../kaisetsu/classifyPalace.js';
import { detectSandaiKyokaku } from '../kaisetsu/kyoVeto.js';
import { useKaisetsuPalace } from '../kaisetsu/useKaisetsuPalace.js';
import { splitProse, stripBold } from '../kaisetsu/renderProse.jsx';
import { parseKaisetsuKey } from '../kaisetsu/boardKey.js';
import { getMiniBoardToneClass } from './reverseDirection.js';
import L3Sheet from '../components/yoho/L3Sheet.jsx';
import { lockedMessage } from '../../lib/accessPolicy.js';

// 願い5軸（classifyPalace / kaisetsu API と同一キー。KaisetsuPanel.jsx と同じ表示ラベル）。
export const AXES = [
  { key: 'goen',    label: 'ご縁' },
  { key: 'shigoto', label: '仕事運' },
  { key: 'kinun',   label: '金運' },
  { key: 'kenko',   label: '健康運' },
  { key: 'benkyo',  label: '勉強運' },
];

// 総合スコア（reverseDirection.js 由来）のトーン → 吉凶バッジ文言。
// 軸チップの◎○△▲×（kaisetsu 由来）は総合点を超えない（docs/axis_score_alignment_v2.md）。
export const BADGE_LABEL = { daikichi: '大吉', shokichi: '吉', churitsu: '中立', kyo: '凶' };

export function scoreText(score) {
  return `${score > 0 ? '+' : ''}${score}`;
}

// その日時の総合点（scorePalace の結果）から決まる、テーマ別の上限。
function actualCap(palaceScore) {
  if (!palaceScore || !Number.isFinite(palaceScore.score)) return null;
  return axisCapForTotal(palaceScore.score, Boolean(detectSandaiKyokaku(palaceScore)));
}

// axisRanks は classifyPalace から直接算出する（認証・ネットワークに依存せず常時表示）。
// KaisetsuPanel.jsx の computeRanks() と同じデータ源・同じ壊れ方（例外を握りつぶし null）。
// classifyPalace は局と干支だけで決まる総合点までしか見られないので、palaceScore（その日時の総合点）を
// 渡すと、日付で決まる凶（五不遇時・歳格・月格・日格など）の分まで上限を掛ける。
export function computeAxisRanks(key, palace, palaceScore = null) {
  if (!key || !palace) return null;
  try {
    const parsed = parseKaisetsuKey(key);
    const row = lookupChito(parsed.key);
    const ranks = classifyPalace(row, palace, { boardType: parsed.boardType }).axisRanks || null;
    return capAxisRanks(ranks, actualCap(palaceScore));
  } catch {
    return null;
  }
}

/**
 * 日付で決まる凶のために、テーマ別の評価を解説文より下げたときの一言。下げていなければ ''。
 * 解説文は局と干支ごとに作ってあるので、その日だけの凶は文章に入っていない。
 */
export function dateCapNote(key, palace, palaceScore) {
  const cap = actualCap(palaceScore);
  if (!key || !palace || !cap) return '';
  try {
    const parsed = parseKaisetsuKey(key);
    const base = classifyPalace(lookupChito(parsed.key), palace, { boardType: parsed.boardType }).axisRanks;
    const shown = capAxisRanks(base, cap);
    return Object.keys(base).some((axis) => base[axis] !== shown[axis])
      ? 'この日時だけの凶が重なっているので、◎○×は解説の文より低く出しています。'
      : '';
  } catch {
    return '';
  }
}

// mid本文を「見出し=リード」「残り=本文」に分割する。
// 段落つきの文章（見出し＋空行＋本文。src/kaisetsu/composeProse.js）は段落で、1段落だけの文は最初の句点で分ける。
export function splitMid(mid) {
  if (!mid) return { lead: '', body: '' };
  if (mid.includes('\n\n')) {
    const split = splitProse(mid);
    return { lead: split.lead, body: stripBold(split.body) };
  }
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
 * テーマ別の◎○×は総合点を超えない（docs/axis_score_alignment_v2.md）。
 *
 * 軸選択（selAxis）は L3ボトムシートと共有するため親から controlled props で受け取る
 * （PR-5・L3ボトムシート）。boardKey/banLevel は L3 に転送するだけで自身の表示には使わない。
 */
export default function FusionCard({
  best,
  boardKey,
  banLevel = null,
  selAxis = 'goen',
  onAxisChange,
  onGoToSearch,
}) {
  const [isL3Open, setIsL3Open] = useState(false);
  const palace = best?.palace || null;
  const axisRanks = useMemo(() => computeAxisRanks(boardKey, palace, best?.palaceScore), [boardKey, palace, best?.palaceScore]);
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

  const toneClass = getMiniBoardToneClass(best.score, best.palaceScore);
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
    if (short) bodyNode = <div className="m-body m-cta">{lockedMessage()}</div>;
  }

  return (
    <>
      <div className="reverse-card fusion" onClick={() => setIsL3Open(true)}>
        <div className="f-top">
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
                onClick={(event) => {
                  event.stopPropagation();
                  onAxisChange?.(a.key);
                }}
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

        <div className="fusion-more-hint">詳しく ›</div>
      </div>

      <L3Sheet
        best={isL3Open ? best : null}
        boardKey={boardKey}
        banLevel={banLevel}
        selAxis={selAxis}
        onAxisChange={onAxisChange}
        onClose={() => setIsL3Open(false)}
        onGoToSearch={onGoToSearch}
      />
    </>
  );
}
