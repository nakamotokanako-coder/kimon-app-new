import React, { useState } from 'react';
import { lookupShoui } from '../kimon/loadShoui.js';

const KYUSEI_TO_NUM = {
  天蓬: '一',
  天芮: '二',
  天冲: '三',
  天輔: '四',
  天禽: '五',
  天心: '六',
  天柱: '七',
  天任: '八',
  天英: '九',
};

const PALACE_DISPLAY = {
  son:  { label: '巽', number: 4 },
  ri:   { label: '離', number: 9 },
  kun:  { label: '坤', number: 2 },
  shin: { label: '震', number: 3 },
  da:   { label: '兌', number: 7 },
  gon:  { label: '艮', number: 8 },
  kan:  { label: '坎', number: 1 },
  ken:  { label: '乾', number: 6 },
};

const PALACE_ORDER = ['son', 'ri', 'kun', 'shin', 'da', 'gon', 'kan', 'ken'];

function isValidEntry(row) {
  return row && row.name && row.name !== '×';
}

export default function ShouiPanel({ board }) {
  const [openPair, setOpenPair] = useState(null);

  if (!board) return null;

  const chokufuNum = KYUSEI_TO_NUM[board.meta.chokufu];

  const rows = PALACE_ORDER.map((pKey) => {
    const cell = board.palaces[pKey];
    const display = PALACE_DISPLAY[pKey];
    const upperNum = KYUSEI_TO_NUM[cell.kyusei];
    const lowerNum = chokufuNum;
    const pair = upperNum && lowerNum ? upperNum + lowerNum : null;
    const shoui = pair ? lookupShoui(pair) : null;
    return { pKey, display, kyusei: cell.kyusei, pair, shoui };
  });

  return (
    <div className="shoui-panel">
      <div className="shoui-notice">
        ※ 象意の上卦・下卦の組み合わせは<strong>暫定ロジック</strong>です。
        先生確認後に正式版へ更新します。
      </div>

      <div className="shoui-context">
        現在の直符: <strong>{board.meta.chokufu}</strong>
        （下卦 = {chokufuNum || '?'}）／ 各宮の九星 = 上卦
      </div>

      <table className="shoui-table">
        <thead>
          <tr>
            <th>宮</th>
            <th>九星</th>
            <th>卦組合せ</th>
            <th>卦名</th>
            <th>吉凶</th>
            <th>キーワード</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ pKey, display, kyusei, pair, shoui }) => {
            const valid = isValidEntry(shoui);
            const isOpen = openPair === pair;
            return (
              <React.Fragment key={pKey}>
                <tr className={!valid ? 'shoui-row-empty' : ''}>
                  <td>{display.label}{display.number}</td>
                  <td>{kyusei || '—'}</td>
                  <td>{pair || '—'}</td>
                  <td>{valid ? shoui.name : '—'}</td>
                  <td className={`kikkyo kikkyo-${valid ? shoui.kikkyo : 'na'}`}>
                    {valid ? shoui.kikkyo : '—'}
                  </td>
                  <td>{valid ? (shoui.keyword === '—' ? '' : shoui.keyword) : ''}</td>
                  <td>
                    {valid && shoui.meaning && shoui.meaning !== '×' && (
                      <button
                        type="button"
                        className="shoui-toggle"
                        onClick={() => setOpenPair(isOpen ? null : pair)}
                      >
                        {isOpen ? '閉じる' : '詳細'}
                      </button>
                    )}
                  </td>
                </tr>
                {isOpen && valid && (
                  <tr className="shoui-detail">
                    <td colSpan={7}>{shoui.meaning}</td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
