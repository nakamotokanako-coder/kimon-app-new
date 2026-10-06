import React from 'react';
import { PURPOSE_ICONS } from './purposeIcons.jsx';
import { ACTION_ICONS } from './actionIcons.jsx';
import { RESULT_ICONS } from './resultIcons.jsx';
import { NAV_ICONS } from './navIcons.jsx';
import { QIMEN_ICONS } from './qimenIcons.jsx';

// アプリの線画アイコン。1つの決まりで描く。
//   viewBox 0 0 24 24 ／ 線 1.6 ／ 丸い端・丸い角 ／ 塗りなし
//   色は固定しない（currentColor）。色は置く側の CSS の color で決める。
//     ふだん … 文字の色のまま    選択中 … 親に color: var(--accent) を付ける
//   塗りが要るのは「評価の星」だけ（filled）。ほかは線だけで見せる。
//   格局の絵や背景の飾りは線画にしない。運営者が用意した絵（public/divination）を使う。
// 使い方:
//   <Icon name="purpose-shrine" />            24px
//   <Icon name="star" filled />               塗った星
// 絵そのものは、種類ごとのファイル（purposeIcons.jsx など）に置く。

export const ICONS = {
  ...PURPOSE_ICONS,
  ...ACTION_ICONS,
  ...RESULT_ICONS,
  ...NAV_ICONS,
  ...QIMEN_ICONS,
};

export const ICON_NAMES = Object.keys(ICONS);

export default function Icon({
  name,
  size = 24,
  strokeWidth = 1.6,
  filled = false,
  title = '',
  className = '',
  ...rest
}) {
  const icon = ICONS[name];
  if (!icon) return null;
  return (
    <svg
      className={`icon icon-${name}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
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
