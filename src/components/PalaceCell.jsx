import React from 'react';

const ACCENT_KAN = new Set(['乙', '丙', '丁']);
const DANGER_KAN = new Set(['庚']);

function renderKanText(value) {
  if (!value) return '－';
  return [...value].map((char, index) => {
    const className = ACCENT_KAN.has(char)
      ? 'kan-accent'
      : DANGER_KAN.has(char)
        ? 'kan-danger'
        : '';

    return className ? (
      <span className={className} key={`${char}-${index}`}>{char}</span>
    ) : (
      <React.Fragment key={`${char}-${index}`}>{char}</React.Fragment>
    );
  });
}

export default function PalaceCell({ label, zodiac, data, score, isCenter }) {
  const hasKyo = score?.detected_kakkyoku?.some((k) => k.kichi_kyo === 'kyo');
  const scoreTone = score?.score >= 40
    ? 'score-positive'
    : score?.score >= 0
      ? 'score-neutral'
      : 'score-negative';
  const cellClass = [
    'cell',
    isCenter ? 'cell-center' : '',
    score?.usable ? 'cell-usable' : '',
    hasKyo ? 'cell-has-kyo' : '',
  ].filter(Boolean).join(' ');

  if (isCenter || !data) {
    return (
      <div className={cellClass}>
        <div className="cell-header">
          <span className="palace-label">{label}</span>
          {zodiac && <span className="zodiac">{zodiac}</span>}
        </div>
        <div className="cell-empty">－</div>
      </div>
    );
  }

  return (
    <div className={cellClass}>
      <div className="cell-header">
        <span className="palace-label">{label}</span>
        {zodiac && <span className="zodiac">{zodiac}</span>}
        {score && <span className={`score-badge ${scoreTone}`}>{score.score}</span>}
      </div>
      <div className="row-shin-sei">
        <span className={`hasshin ${data.hasshin === '直符' ? 'is-chokufu' : ''}`}>
          {data.hasshin}
        </span>
        <span className="kyusei">{data.kyusei}</span>
      </div>
      <div className="row-tenban">{renderKanText(data.tenban)}</div>
      <div className="row-chiban">{renderKanText(data.chiban)}</div>
      <div className="row-hachimon">{data.hachimon}</div>
      {hasKyo && (
        <div className="kyo-tags">
          {score.detected_kakkyoku
            .filter((k) => k.kichi_kyo === 'kyo')
            .slice(0, 2)
            .map((k) => <span key={k.name}>{k.name}</span>)}
        </div>
      )}
    </div>
  );
}
