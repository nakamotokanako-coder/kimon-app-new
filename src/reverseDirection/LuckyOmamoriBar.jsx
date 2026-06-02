import React, { useMemo } from 'react';
import { getClosing, getOmamori } from '../kimon/luckyOmamori.js';

const CATEGORIES = [
  ['アクション', '🚶', '開運アクション'],
  ['フード', '🍣', '開運フード'],
  ['ドリンク', '🍵', '開運ドリンク'],
  ['カラー', '🎨', 'ラッキーカラー'],
  ['アイテム', '💎', 'ラッキーアイテム'],
  ['パーソン', '🧑', 'ラッキーパーソン'],
  ['アニマル', '🐾', 'ラッキーアニマル'],
];

function getCategory(message) {
  const heading = message.split('は')[0];
  const category = CATEGORIES.find(([word]) => heading.includes(word));
  return category ? category.slice(1) : ['🍀', '今日のお告げ'];
}

export default function LuckyOmamoriBar({ bestPalace, seed }) {
  const message = useMemo(
    () => getOmamori(bestPalace, seed),
    [bestPalace, seed],
  );
  const closing = useMemo(() => getClosing(seed), [seed]);
  const [categoryIcon, categoryLabel] = getCategory(message || '');

  if (!message) return null;

  return (
    <aside className="omamori-pouch" aria-label="今日のお守り">
      <div className="omamori-cord" aria-hidden="true" />
      <div className="omamori-frame">
        <div className="omamori-crest" aria-hidden="true">❖</div>
        <div className="omamori-title">今日のお守り</div>
        <div className="omamori-category">
          <span aria-hidden="true">{categoryIcon}</span>
          {categoryLabel}
        </div>
        <p className="omamori-body">{message}</p>
        {closing && (
          <>
            <div className="omamori-separator" aria-hidden="true" />
            <p className="omamori-closing">{closing}</p>
          </>
        )}
      </div>
    </aside>
  );
}
