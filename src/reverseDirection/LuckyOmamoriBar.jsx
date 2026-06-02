import React, { useEffect, useMemo, useState } from 'react';
import { getOmamori } from '../kimon/luckyOmamori.js';

export default function LuckyOmamoriBar({ selectedRanking, bestPalace, seed }) {
  const [isOpen, setIsOpen] = useState(false);
  const message = useMemo(
    () => getOmamori(bestPalace, seed),
    [bestPalace, seed],
  );

  useEffect(() => {
    setIsOpen(false);
  }, [seed, selectedRanking?.palace]);

  if (!selectedRanking || selectedRanking.score >= 0 || !message) return null;

  return (
    <div className="omamori-wrap">
      <button
        type="button"
        className="omamori-bar"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>🧭</span>
        <strong>{selectedRanking.label}へ行くなら、今日のお守り</strong>
        <span className="omamori-bar-arrow" aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div className="omamori-card">
          <small>今日のお守り</small>
          <p>{message}</p>
          <small>効くかどうかは……知らんけどな😏</small>
        </div>
      )}
    </div>
  );
}
