import React from 'react';
import { PURPOSE_ICONS } from './purposeIcons.jsx';
import { ACTION_ICONS } from './actionIcons.jsx';
import { RESULT_ICONS } from './resultIcons.jsx';
import { NAV_ICONS } from './navIcons.jsx';
import { QIMEN_ICONS } from './qimenIcons.jsx';
import { SYMBOL_ICONS } from './symbolIcons.jsx';

// アプリの線画アイコン。1つの決まりで描く。
//   viewBox 0 0 24 24（格局の印 symbol-* だけ 0 0 48 48）／ 線 1.6 ／ 丸い端・丸い角 ／ 塗りなし
//   色は固定しない（currentColor）。色は置く側の CSS の color で決める。
//     ふだん … 文字の色のまま    選択中 … 親に color: var(--accent) を付ける
//   塗りが要るのは「評価の星」だけ（filled）。ほかは線だけで見せる。
// 使い方:
//   <Icon name="purpose-shrine" />            24px
//   <Icon name="symbol-shendun" size={48} />  格局の印
//   <Icon name="star" filled />               塗った星
// 絵そのものは、種類ごとのファイル（purposeIcons.jsx など）に置く。

export const ICONS = {
  ...PURPOSE_ICONS,
  ...ACTION_ICONS,
  ...RESULT_ICONS,
  ...NAV_ICONS,
  ...QIMEN_ICONS,
  ...SYMBOL_ICONS,
};

export const ICON_NAMES = Object.keys(ICONS);

export default function Icon({
  name,
  size,
  strokeWidth = 1.6,
  filled = false,
  title = '',
  className = '',
  ...rest
}) {
  const icon = ICONS[name];
  if (!icon) return null;
  const box = icon.box || 24;
  const pixels = size ?? box;
  return (
    <svg
      className={`icon icon-${name}${className ? ` ${className}` : ''}`}
      width={pixels}
      height={pixels}
      viewBox={`0 0 ${box} ${box}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {typeof icon.draw === 'function' ? icon.draw({ filled }) : icon.draw}
    </svg>
  );
}
