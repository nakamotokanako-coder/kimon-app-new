import React from 'react';
import cloud from '../../assets/decorations/decoration-cloud.svg?raw';
import mountains from '../../assets/decorations/decoration-mountains.svg?raw';
import branch from '../../assets/decorations/decoration-branch.svg?raw';
import celestial from '../../assets/decorations/decoration-celestial.svg?raw';

// 背景の飾り（雲・遠くの山・枝・天体）。絵は src/assets/decorations/ の SVG ファイル。
// 色は固定しない（currentColor）。置く側の CSS で color と opacity を決める（目安は opacity 0.05〜0.2）。
// 飾りなので、読み上げには出さない。
//   <Decoration name="mountains" className="..." />

const DECORATIONS = { cloud, mountains, branch, celestial };

export const DECORATION_NAMES = Object.keys(DECORATIONS);

export default function Decoration({ name, className = '' }) {
  const svg = DECORATIONS[name];
  if (!svg) return null;
  return (
    <span
      className={`decoration decoration-${name}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
