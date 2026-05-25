import React, { useState } from 'react';
import {
  getJukanShouiByPair,
  getKakkyokuShoui,
} from '../kimon/loadShouiDict.js';

// 8宮の表示順は既存と同じ（盤の論理順とは独立）
const PALACE_ORDER = ['son', 'ri', 'kun', 'shin', 'da', 'gon', 'kan', 'ken'];

const PALACE_DISPLAY = {
  son:  { label: '巽', direction: '南東' },
  ri:   { label: '離', direction: '南' },
  kun:  { label: '坤', direction: '南西' },
  shin: { label: '震', direction: '東' },
  da:   { label: '兌', direction: '西' },
  gon:  { label: '艮', direction: '北東' },
  kan:  { label: '坎', direction: '北' },
  ken:  { label: '乾', direction: '北西' },
};

// 先生指示: 吉=青 / 中立=黄 / 凶=赤
function jukanColorClass(kikkyo) {
  if (kikkyo === '〇') return 'shoui-kichi';
  if (kikkyo === '×') return 'shoui-kyo';
  return 'shoui-chu'; // △
}

function kakkyokuColorClass(kichi_kyo) {
  return kichi_kyo === 'kichi' ? 'shoui-kichi' : 'shoui-kyo';
}

function ShouiDetail({ term }) {
  const { entry, name, signLabel, signClass, missingText } = term;
  const text = entry?.display_text
    || [entry?.modern, entry?.practical].filter(Boolean).join('　')
    || missingText
    || '—';

  return (
    <div className={`shoui-detail-block ${signClass}`}>
      <h4>
        {entry?.name || name}
        {signLabel && (
          <span className={`shoui-sign ${signClass}`}>{signLabel}</span>
        )}
      </h4>
      <p className="shoui-text">{text}</p>
    </div>
  );
}

function buildJukanTerm(jukan, pKey, index) {
  const entry = getJukanShouiByPair(jukan.tenban, jukan.chiban);
  const signLabel = entry?.sign || jukan.kikkyo;
  return {
    key: `jukan-${pKey}-${index}`,
    name: jukan.name,
    label: `${jukan.kikkyo}${jukan.name}`,
    entry,
    signLabel,
    signClass: jukanColorClass(signLabel),
    missingText: `${jukan.name} の解説は辞書にありません（tenban=${jukan.tenban} / chiban=${jukan.chiban}）`,
  };
}

function buildKakkyokuTerm(kakkyoku, pKey, index) {
  const entry = getKakkyokuShoui(kakkyoku.name);
  const signLabel = kakkyoku.kichi_kyo === 'kichi' ? '〇' : '×';
  return {
    key: `kakkyoku-${pKey}-${index}`,
    name: kakkyoku.name,
    label: `${signLabel}${kakkyoku.name}`,
    entry,
    signLabel,
    signClass: kakkyokuColorClass(kakkyoku.kichi_kyo),
    missingText: `${kakkyoku.name} の解説は辞書にありません`,
  };
}

function TermChips({ title, terms, openKeys, onToggle }) {
  return (
    <div className="shoui-term-group">
      <div className="shoui-term-label">{title}</div>
      {terms.length === 0 ? (
        <span className="shoui-term-empty">—</span>
      ) : (
        <div className="shoui-term-list">
          {terms.map((term) => {
            const isOpen = openKeys.includes(term.key);
            return (
              <button
                key={term.key}
                type="button"
                className={`shoui-term shoui-chip ${term.signClass}`}
                aria-expanded={isOpen}
                onClick={() => onToggle(term.key)}
              >
                <span>{term.label}</span>
                <span className="shoui-caret" aria-hidden="true">
                  {isOpen ? '▲' : '▼'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ShouiPanel({ board }) {
  const [openKeys, setOpenKeys] = useState([]);

  if (!board || !board.score) return null;

  const toggle = (key) => {
    setOpenKeys((cur) => (
      cur.includes(key)
        ? cur.filter((item) => item !== key)
        : [...cur, key]
    ));
  };

  return (
    <div className="shoui-panel">
      <div className="shoui-context">
        十干剋応・格局の象意（先生監修 2026-05-24）
      </div>
      <div className="shoui-palace-list">
        {PALACE_ORDER.map((pKey) => {
          const cell = board.palaces?.[pKey];
          if (!cell) return null;
          const display = PALACE_DISPLAY[pKey];
          const score = board.score.palaces?.[pKey];
          const jukkan = score?.detected_jukkan || [];
          const kakkyoku = score?.detected_kakkyoku || [];
          const jukanTerms = jukkan.map((j, index) => buildJukanTerm(j, pKey, index));
          const kakkyokuTerms = kakkyoku.map((k, index) => buildKakkyokuTerm(k, pKey, index));
          const allTerms = [...jukanTerms, ...kakkyokuTerms];
          const openTerms = allTerms.filter((term) => openKeys.includes(term.key));

          return (
            <section className="shoui-palace-card" key={pKey}>
              <header className="shoui-palace-header">
                <div className="shoui-palace-name">
                  <span>{display.label}</span>
                  <small>{display.direction}</small>
                </div>
                <dl className="shoui-palace-meta">
                  <div>
                    <dt>八門</dt>
                    <dd>{cell.hachimon || '—'}</dd>
                  </div>
                  <div>
                    <dt>点数</dt>
                    <dd>{typeof score?.score === 'number' ? score.score : '—'}</dd>
                  </div>
                </dl>
              </header>

              <div className="shoui-chip-area">
                <TermChips
                  title="十干剋応"
                  terms={jukanTerms}
                  openKeys={openKeys}
                  onToggle={toggle}
                />
                <TermChips
                  title="格局"
                  terms={kakkyokuTerms}
                  openKeys={openKeys}
                  onToggle={toggle}
                />
              </div>

              {openTerms.length > 0 && (
                <div className="shoui-detail-list">
                  {openTerms.map((term) => (
                    <ShouiDetail key={term.key} term={term} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
