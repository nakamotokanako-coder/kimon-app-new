import React from 'react';

// 九星の略表記（数字漢字）→ 完全名称（先生指示 2026-05-19 Task 2）
const KYUSEI_FULL_NAMES = {
  '一': '一白水星', '二': '二黒土星', '三': '三碧木星',
  '四': '四緑木星', '五': '五黄土星', '六': '六白金星',
  '七': '七赤金星', '八': '八白土星', '九': '九紫火星',
};

// 既に完全名称（例「二黒土星」）の場合はそのまま返す（冪等）
function toKyuseiFullName(num) {
  if (!num) return '—';
  return KYUSEI_FULL_NAMES[num] ?? num;
}

export default function MetaPanel({ meta, banLevel }) {
  if (!meta) return null;
  const isHour = meta.boardType === '時';

  // 盤レベル判定: 伏吟・反吟・門迫・五不遇時 は該当時のみ赤字表示。
  // 空亡 は常に存在する旬空のため通常色で常時表示。
  const banRows = banLevel
    ? [
        { key: 'fukugin', label: '伏吟', value: banLevel.fukugin, alert: true },
        { key: 'hangin', label: '反吟', value: banLevel.hangin, alert: true },
        { key: 'monpaku', label: '門迫', value: banLevel.monpaku, alert: true },
        { key: 'kuubou', label: '空亡', value: banLevel.kuubou, alert: false },
        { key: 'gofuguuji', label: '五不遇時', value: banLevel.gofuguuji, alert: true },
      ].filter((r) => r.value)
    : [];

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
          <dt>年</dt><dd>{toKyuseiFullName(meta.kyusei_year)}</dd>
          <dt>月</dt><dd>{toKyuseiFullName(meta.kyusei_month)}</dd>
          <dt>日</dt><dd>{toKyuseiFullName(meta.kyusei_day)}</dd>
        </dl>
      </div>

      <div className="meta-section">
        <h3>盤レベル判定</h3>
        {banRows.length > 0 ? (
          <dl>
            {banRows.map((r) => (
              <React.Fragment key={r.key}>
                <dt>{r.label}</dt>
                <dd className={r.alert ? 'ban-alert' : ''}>{r.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        ) : (
          <p className="ban-none">特になし</p>
        )}
      </div>
    </div>
  );
}
