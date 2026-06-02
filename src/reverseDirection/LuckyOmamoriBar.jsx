import React, { useEffect, useMemo, useState } from 'react';
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

function splitOmamoriLines(message) {
  if (!message) return [];
  return message
    .replace(/([。！？♪])/g, '$1\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function LuckyOmamoriBar({ bestPalace, isActive, seed }) {
  const [isOpen, setIsOpen] = useState(false);
  const message = useMemo(
    () => getOmamori(bestPalace, seed),
    [bestPalace, seed],
  );
  const closing = useMemo(() => getClosing(seed), [seed]);
  const [categoryIcon, categoryLabel] = getCategory(message || '');

  useEffect(() => {
    setIsOpen(false);
  }, [isActive, seed]);

  if (!message) return null;

  return (
    <aside className="omamori-wrap" aria-label="開運のお守り">
      <button
        type="button"
        className={`omamori-bar ${isOpen ? 'is-open' : ''}`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="omamori-bar-icon" aria-hidden="true">🧧</span>
        <span className="omamori-bar-text">
          <strong>開運のお守り</strong>
          <small>タップして引く</small>
        </span>
        <span className="omamori-bar-plus" aria-hidden="true">＋</span>
      </button>
      <div className={`omamori-sheet ${isOpen ? 'is-open' : ''}`}>
        <div className="omamori-pouch">
          <div className="omamori-cord" aria-hidden="true" />
          <div className="omamori-frame">
            <div className="omamori-crest" aria-hidden="true">❖</div>
            <div className="omamori-title">開運のお守り</div>
            <div className="omamori-category">
              <span aria-hidden="true">{categoryIcon}</span>
              {categoryLabel}
            </div>
            <div className="omamori-body">
              {splitOmamoriLines(message).map((line, index) => (
                <span className="omamori-line" key={`${index}-${line}`}>{line}</span>
              ))}
            </div>
            {closing && (
              <>
                <div className="omamori-separator" aria-hidden="true" />
                <p className="omamori-closing">{closing}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
