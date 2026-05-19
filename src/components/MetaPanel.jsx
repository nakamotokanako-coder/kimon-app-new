import React from 'react';

export default function MetaPanel({ meta }) {
  if (!meta) return null;
  const isHour = meta.boardType === '時';

  return (
    <div className="meta-panel">
      <div className="meta-section">
        <h3>盤情報</h3>
        <dl>
          <dt>盤種</dt><dd>{meta.boardType}盤</dd>
          <dt>局数</dt><dd>{meta.kyokusu}</dd>
          <dt>キー干支</dt><dd>{meta.eto}</dd>
          <dt>旬首</dt><dd>{meta.junshu}</dd>
          <dt>直符</dt><dd>{meta.chokufu}</dd>
          <dt>直使</dt><dd>{meta.chokushi}</dd>
          <dt>空亡</dt><dd>{meta.kuubou}</dd>
          <dt>旬首・天盤宮</dt><dd>{meta.tenban_junshu_p}</dd>
          <dt>旬首・地盤宮</dt><dd>{meta.chiban_junshu_p}</dd>
        </dl>
      </div>

      <div className="meta-section">
        <h3>暦情報</h3>
        <dl>
          <dt>日付</dt><dd>{meta.date}{isHour ? ` ${meta.hour}:00` : ''}</dd>
          <dt>節気</dt><dd>{meta.sekki24 || '—'}</dd>
          <dt>陰陽</dt><dd>{meta.inton_youton || '—'}</dd>
          <dt>三元</dt><dd>{meta.sangen || '—'}</dd>
          <dt>節気局数</dt><dd>{meta.kyokusu}</dd>
          <dt>時局数</dt><dd>{meta.time_kyokusu || '—'}</dd>
        </dl>
      </div>

      <div className="meta-section">
        <h3>干支</h3>
        <dl>
          <dt>年</dt><dd>{meta.eto_year}</dd>
          <dt>月</dt><dd>{meta.eto_month}</dd>
          <dt>日</dt><dd>{meta.eto_day}</dd>
          {isHour && <><dt>時</dt><dd>{meta.eto_time}</dd></>}
        </dl>
      </div>

      <div className="meta-section">
        <h3>九星</h3>
        <dl>
          <dt>年</dt><dd>{meta.kyusei_year || '—'}</dd>
          <dt>月</dt><dd>{meta.kyusei_month || '—'}</dd>
          <dt>日</dt><dd>{meta.kyusei_day || '—'}</dd>
        </dl>
      </div>
    </div>
  );
}
