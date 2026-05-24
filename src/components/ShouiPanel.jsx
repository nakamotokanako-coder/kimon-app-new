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

function ShouiDetail({ entry, signLabel, signClass }) {
  const text = entry?.display_text
    || [entry?.modern, entry?.practical].filter(Boolean).join('　')
    || '—';

  return (
    <div className="shoui-detail-block">
      <h4>
        {entry.name}
        {signLabel && (
          <span className={`shoui-sign ${signClass}`}>{signLabel}</span>
        )}
      </h4>
      <p className="shoui-text">{text}</p>
    </div>
  );
}

function JukanDetailRow({ jukan, colSpan }) {
  const entry = getJukanShouiByPair(jukan.tenban, jukan.chiban);
  if (!entry) {
    return (
      <tr className="shoui-detail">
        <td colSpan={colSpan}>
          <div className="shoui-detail-block">
            {jukan.name} の解説は辞書にありません（tenban={jukan.tenban} /
            chiban={jukan.chiban}）
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr className="shoui-detail">
      <td colSpan={colSpan}>
        <ShouiDetail
          entry={entry}
          signLabel={entry.sign}
          signClass={jukanColorClass(entry.sign)}
        />
      </td>
    </tr>
  );
}

function KakkyokuDetailRow({ kakkyoku, colSpan }) {
  const entry = getKakkyokuShoui(kakkyoku.name);
  if (!entry) {
    return (
      <tr className="shoui-detail">
        <td colSpan={colSpan}>
          <div className="shoui-detail-block">
            {kakkyoku.name} の解説は辞書にありません
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr className="shoui-detail">
      <td colSpan={colSpan}>
        <ShouiDetail
          entry={entry}
          signLabel={kakkyoku.kichi_kyo === 'kichi' ? '〇' : '×'}
          signClass={kakkyokuColorClass(kakkyoku.kichi_kyo)}
        />
      </td>
    </tr>
  );
}

const COL_COUNT = 6;

export default function ShouiPanel({ board }) {
  // openKey: 'jukan-{pKey}-{idx}' | 'kakkyoku-{pKey}-{idx}' | null
  const [openKey, setOpenKey] = useState(null);

  if (!board || !board.score) return null;

  const toggle = (key) => setOpenKey((cur) => (cur === key ? null : key));

  return (
    <div className="shoui-panel">
      <div className="shoui-context">
        十干剋応・格局の象意（先生監修 2026-05-24）／クリックで原文・現代の読み替え・実務での示唆を表示
      </div>
      <table className="shoui-table">
        <thead>
          <tr>
            <th>宮</th>
            <th>方位</th>
            <th>八門</th>
            <th>十干剋応</th>
            <th>格局</th>
            <th>点数</th>
          </tr>
        </thead>
        <tbody>
          {PALACE_ORDER.map((pKey) => {
            const cell = board.palaces?.[pKey];
            if (!cell) return null;
            const display = PALACE_DISPLAY[pKey];
            const score = board.score.palaces?.[pKey];
            const jukkan = score?.detected_jukkan || [];
            const kakkyoku = score?.detected_kakkyoku || [];

            const openJukanIdx =
              openKey && openKey.startsWith(`jukan-${pKey}-`)
                ? parseInt(openKey.split('-').pop(), 10)
                : null;
            const openKakkyokuIdx =
              openKey && openKey.startsWith(`kakkyoku-${pKey}-`)
                ? parseInt(openKey.split('-').pop(), 10)
                : null;

            return (
              <React.Fragment key={pKey}>
                <tr>
                  <td>{display.label}</td>
                  <td>{display.direction}</td>
                  <td>{cell.hachimon || '—'}</td>
                  <td>
                    {jukkan.length === 0 ? (
                      <span className="shoui-term-empty">—</span>
                    ) : (
                      <div className="shoui-term-list">
                        {jukkan.map((j, i) => {
                          const key = `jukan-${pKey}-${i}`;
                          return (
                            <button
                              key={key}
                              type="button"
                              className={`shoui-term ${jukanColorClass(j.kikkyo)}`}
                              aria-expanded={openKey === key}
                              onClick={() => toggle(key)}
                            >
                              {j.kikkyo}{j.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td>
                    {kakkyoku.length === 0 ? (
                      <span className="shoui-term-empty">—</span>
                    ) : (
                      <div className="shoui-term-list">
                        {kakkyoku.map((k, i) => {
                          const key = `kakkyoku-${pKey}-${i}`;
                          const prefix = k.kichi_kyo === 'kichi' ? '〇' : '×';
                          return (
                            <button
                              key={key}
                              type="button"
                              className={`shoui-term ${kakkyokuColorClass(k.kichi_kyo)}`}
                              aria-expanded={openKey === key}
                              onClick={() => toggle(key)}
                            >
                              {prefix}{k.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td>{typeof score?.score === 'number' ? score.score : '—'}</td>
                </tr>
                {openJukanIdx != null && jukkan[openJukanIdx] && (
                  <JukanDetailRow
                    jukan={jukkan[openJukanIdx]}
                    colSpan={COL_COUNT}
                  />
                )}
                {openKakkyokuIdx != null && kakkyoku[openKakkyokuIdx] && (
                  <KakkyokuDetailRow
                    kakkyoku={kakkyoku[openKakkyokuIdx]}
                    colSpan={COL_COUNT}
                  />
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
