import React, { useState } from 'react';
import PalaceCell from './PalaceCell.jsx';
import BottomSheet from './BottomSheet.jsx';
import { isKuubouZodiac } from '../kimon/banLevel.js';

// 5×5 グリッド。中央 3×3 が宮セル、外周 12 マスに単独十二支ラベル。
// 北を下（南が上）= 先生Excel と同じデフォルト orientation。
// south_bottom 切替時は (row, col) を (6-row, 6-col) で点対称反転。
//
// Phase 2C-followup3 (2026-05-22): 角の 2 文字ペアを廃止し、各十二支を
// 紐づく宮の「真上/真下/真左/真右」に単独で配置（Phase 2C 原版の構造）。
//
// レイアウト（5×5）:
//
//   .   巳  午  未   .         ← 上辺: 巽/離/坤 の真上に 巳/午/未
//   辰  巽  離  坤   申        ← 左右辺: 巽真左=辰, 坤真右=申
//   卯  震  中  兌   酉        ← 中段: 震真左=卯, 兌真右=酉
//   寅  艮  坎  乾   戌        ← 左右辺: 艮真左=寅, 乾真右=戌
//   .   丑  子  亥   .         ← 下辺: 艮/坎/乾 の真下に 丑/子/亥
//
// 角ペアは廃止し、辰・巳 は別マスに配置（=元の宮 巽 を共有するが視覚的に分離）。
// 上辺/下辺/左右辺それぞれ 3 ラベルが等間隔（= 内側宮セルの cell-w 間隔）に並ぶ。

const PALACE_FIVE_ELEMENTS = {
  '坎': '水', '艮': '土', '震': '木', '巽': '木',
  '離': '火', '坤': '土', '兌': '金', '乾': '金',
};

const PALACE_DISPLAY = {
  son: { label: '巽', direction: '南東' },
  ri: { label: '離', direction: '南' },
  kun: { label: '坤', direction: '南西' },
  shin: { label: '震', direction: '東' },
  da: { label: '兌', direction: '西' },
  gon: { label: '艮', direction: '北東' },
  kan: { label: '坎', direction: '北' },
  ken: { label: '乾', direction: '北西' },
};

/** 北を下（南を上）= デフォルト＝先生Excel と同じ orientation の構成要素 */
const NB_ITEMS = [
  // ── 上辺（巽真上=巳・離真上=午・坤真上=未）──
  { type: 'zodiac', row: 1, col: 2, zodiac: '巳' },
  { type: 'zodiac', row: 1, col: 3, zodiac: '午' },
  { type: 'zodiac', row: 1, col: 4, zodiac: '未' },
  // ── 右辺（坤真右=申・兌真右=酉・乾真右=戌）──
  { type: 'zodiac', row: 2, col: 5, zodiac: '申' },
  { type: 'zodiac', row: 3, col: 5, zodiac: '酉' },
  { type: 'zodiac', row: 4, col: 5, zodiac: '戌' },
  // ── 下辺（艮真下=丑・坎真下=子・乾真下=亥）──
  { type: 'zodiac', row: 5, col: 2, zodiac: '丑' },
  { type: 'zodiac', row: 5, col: 3, zodiac: '子' },
  { type: 'zodiac', row: 5, col: 4, zodiac: '亥' },
  // ── 左辺（巽真左=辰・震真左=卯・艮真左=寅）──
  { type: 'zodiac', row: 2, col: 1, zodiac: '辰' },
  { type: 'zodiac', row: 3, col: 1, zodiac: '卯' },
  { type: 'zodiac', row: 4, col: 1, zodiac: '寅' },
  // ── 宮セル（内側 3×3） ──
  { type: 'cell', row: 2, col: 2, key: 'son',  label: '巽' },
  { type: 'cell', row: 2, col: 3, key: 'ri',   label: '離' },
  { type: 'cell', row: 2, col: 4, key: 'kun',  label: '坤' },
  { type: 'cell', row: 3, col: 2, key: 'shin', label: '震' },
  { type: 'cell', row: 3, col: 3, key: null,   label: '中' },
  { type: 'cell', row: 3, col: 4, key: 'da',   label: '兌' },
  { type: 'cell', row: 4, col: 2, key: 'gon',  label: '艮' },
  { type: 'cell', row: 4, col: 3, key: 'kan',  label: '坎' },
  { type: 'cell', row: 4, col: 4, key: 'ken',  label: '乾' },
];

function getItems(direction) {
  if (direction !== 'south_bottom') return NB_ITEMS;
  // 180° 点対称反転。単独ラベルは座標反転のみで内部処理は不要。
  return NB_ITEMS.map((it) => ({ ...it, row: 6 - it.row, col: 6 - it.col }));
}

export function getZodiacLabelClass(zodiac, kuubou) {
  return `zodiac-label${isKuubouZodiac(zodiac, kuubou) ? ' is-kuubou' : ''}`;
}

/** Build the board-level alert labels shown in the center palace. */
function buildCenterAlerts(banLevel) {
  if (!banLevel) return [];
  return [
    banLevel.kan_fukugin && '\u5e72\u4f0f\u541f',
    banLevel.sei_fukugin && '\u661f\u4f0f\u541f',
    banLevel.mon_fukugin && '\u9580\u4f0f\u541f',
    banLevel.sei_hangin && '\u661f\u53cd\u541f',
    banLevel.mon_hangin && '\u9580\u53cd\u541f',
    banLevel.gofuguuji && '\u4e94\u4e0d\u9047\u6642',
  ].filter(Boolean);
}

export default function BoardGrid({
  palaces,
  scores = {},
  banLevel = null,
  direction = 'north_bottom',
  kuubou = null,
  // Phase 2D (2026-05-21): 旬首マーカー用
  junshu = null,               // 旬首干（例 "庚"）
  tenbanJunshuPalace = null,   // 天盤旬首がある宮の日本語名（例 "離"）
  chibanJunshuPalace = null,   // 地盤旬首がある宮の日本語名（例 "兌"）
}) {
  const [selectedPalace, setSelectedPalace] = useState(null);
  const items = getItems(direction);
  const centerAlerts = buildCenterAlerts(banLevel);
  const selectedDisplay = selectedPalace ? PALACE_DISPLAY[selectedPalace] : null;
  const selectedSheetPalace = selectedPalace && selectedDisplay ? {
    key: selectedPalace,
    label: selectedDisplay.label,
    direction: selectedDisplay.direction,
    data: palaces?.[selectedPalace],
    score: scores?.[selectedPalace],
  } : null;

  const handleSelect = (palaceKey) => {
    setSelectedPalace((current) => (current === palaceKey ? null : palaceKey));
  };

  const handleOverlayTap = (event) => {
    const sheetTop = document.querySelector('.sheet')?.getBoundingClientRect().top ?? window.innerHeight;
    if (event.clientY >= sheetTop) {
      setSelectedPalace(null);
      return;
    }
    if (!document.elementsFromPoint) {
      setSelectedPalace(null);
      return;
    }
    const elements = document.elementsFromPoint(event.clientX, event.clientY);
    const palaceEl = elements.find((el) => (
      el !== event.currentTarget
      && el.dataset?.palaceKey
    ));
    if (palaceEl?.dataset?.palaceKey && palaceEl.dataset.palaceKey !== selectedPalace) {
      handleSelect(palaceEl.dataset.palaceKey);
      return;
    }
    setSelectedPalace(null);
  };

  return (
    <>
      <div className="board-grid">
        {items.map((it, idx) => {
          const style = { gridRow: it.row, gridColumn: it.col };
          if (it.type === 'zodiac') {
            const isKuubou = isKuubouZodiac(it.zodiac, kuubou);
            return (
              <div
                key={`Z-${idx}`}
                className={getZodiacLabelClass(it.zodiac, kuubou)}
                style={style}
                aria-label={isKuubou ? `${it.zodiac}（空亡）` : it.zodiac}
              >
                {it.zodiac}
              </div>
            );
          }
          const isCenter = it.key === null;
          return (
            <div
              key={`C-${idx}`}
              style={style}
              data-palace-key={!isCenter ? it.key : undefined}
            >
              <PalaceCell
                label={it.label}
                element={PALACE_FIVE_ELEMENTS[it.label] || ''}
                data={isCenter ? null : palaces[it.key]}
                score={isCenter ? null : scores[it.key]}
                isCenter={isCenter}
                centerAlerts={isCenter ? centerAlerts : []}
                junshu={junshu}
                isTenbanJunshuPalace={!isCenter && it.label === tenbanJunshuPalace}
                isChibanJunshuPalace={!isCenter && it.label === chibanJunshuPalace}
                isSelected={!isCenter && selectedPalace === it.key}
                isDimmed={!isCenter && selectedPalace !== null && selectedPalace !== it.key}
                onSelect={!isCenter ? () => handleSelect(it.key) : undefined}
              />
            </div>
          );
        })}
      </div>
      <BottomSheet
        palace={selectedSheetPalace}
        onClose={() => setSelectedPalace(null)}
        onOverlayTap={handleOverlayTap}
      />
    </>
  );
}
