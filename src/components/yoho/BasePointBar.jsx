import React, { useState } from 'react';
import { ic } from '../../utils/icons.js';
import BasePointSheet from './BasePointSheet.jsx';
import { getLongitudeCorrectionMinutes } from '../../reverseDirection/reverseDirection.js';

function formatCorrection(minutes) {
  if (minutes === 0) return '±0分';
  return `${minutes > 0 ? '+' : ''}${minutes}分`;
}

/**
 * 長い住所を、短い地名にする（「東京都板橋区仲宿13番15号」→「東京・板橋区」）。
 * 都道府県と、その次の市区町村までを拾う。住所の形でなければ、そのまま返す。
 */
export function shortPlaceName(name) {
  const text = String(name || '').trim();
  const match = text.match(/^(北海道|東京都|(?:京都|大阪)府|.{2,3}県)(.+?[市区町村])/u);
  if (!match) return text;
  const prefecture = match[1] === '北海道' ? '北海道' : match[1].slice(0, -1);
  return `${prefecture}・${match[2]}`;
}

export default function BasePointBar({
  center,
  baseName = '現在地',
  onCenterChange,
  // 地図タブ用: 補正の分数と経度は出さない（詳しい人向けの数字。押したときの説明に入れる）
  compact = false,
  // 「目的で選ぶ」用: 現在地・自然時・現在時刻を1枚のカードにまとめる（経度は出さない）。渡すのは「22:24」の形
  nowLabel = '',
  // 格局検索用: 短い地名と自然時だけを1行で出す（番地と経度は出さない。「変更」の中で見られる）
  simple = false,
}) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const longitude = Number(center?.[0]);
  const latitude = Number(center?.[1]);
  const correction = getLongitudeCorrectionMinutes(longitude);
  const longitudeLabel = Number.isFinite(longitude) ? longitude.toFixed(2) : '--';
  const sheetCenter = Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null;

  const handleSelectCenter = (nextCenter, nextName) => {
    onCenterChange?.(nextCenter, nextName);
    setIsSheetOpen(false);
  };

  return (
    <>
      <div
        className={`base-bar${compact ? ' is-compact' : ''}${nowLabel ? ' is-card' : ''}${simple ? ' is-simple' : ''}`}
        title={simple
          ? `${baseName || '現在地'}／経度 ${longitudeLabel}`
          : (compact ? `自然時補正 ${formatCorrection(correction)}／経度 ${longitudeLabel}` : undefined)}
        aria-label="基準点"
      >
        <div className="base-meta">
          <span className="base-pin" aria-hidden="true">{ic('📍')}</span>
          <strong>{simple ? shortPlaceName(baseName) || '現在地' : baseName || '現在地'}</strong>
          {(nowLabel || simple) && <span className="base-natural">自然時 {formatCorrection(correction)}</span>}
          {nowLabel && <small className="base-now">現在 {nowLabel}</small>}
          {!compact && !nowLabel && !simple && <span className="base-mono">{formatCorrection(correction)}</span>}
          {!compact && !nowLabel && !simple && <span className="base-mono">経度{longitudeLabel}</span>}
        </div>
        <button type="button" className="base-change" onClick={() => setIsSheetOpen(true)}>
          {nowLabel ? '変更' : '変更▾'}
        </button>
      </div>
      {isSheetOpen && (
        <BasePointSheet
          currentCenter={sheetCenter}
          onClose={() => setIsSheetOpen(false)}
          onSelectCenter={handleSelectCenter}
        />
      )}
    </>
  );
}
