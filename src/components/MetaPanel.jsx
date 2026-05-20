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

  // Phase 2A (2026-05-20): 表示文言を細分化（先生指示）。
  //   伏吟 → 干伏吟 / 星伏吟 / 門伏吟（独立カウント・複数同時可）
  //   反吟 → 星反吟 / 門反吟
  //   門迫・空亡・五不遇時 は文言変更なし
  // 配色とレイアウトは Phase 2B で扱うため、本フェーズは触らない。
  const banRows = banLevel
    ? [
        { key: 'kan_fukugin', label: '干伏吟', value: banLevel.kan_fukugin ? '該当' : null, alert: true },
        { key: 'sei_fukugin', label: '星伏吟', value: banLevel.sei_fukugin ? '該当' : null, alert: true },
        { key: 'mon_fukugin', label: '門伏吟', value: banLevel.mon_fukugin ? '該当' : null, alert: true },
        { key: 'sei_hangin', label: '星反吟', value: banLevel.sei_hangin ? '該当' : null, alert: true },
        { key: 'mon_hangin', label: '門反吟', value: banLevel.mon_hangin ? '該当' : null, alert: true },
        { key: 'monpaku', label: '門迫', value: banLevel.monpaku_palaces?.length ? '該当' : null, alert: true },
        { key: 'kuubou', label: '空亡', value: banLevel.kuubou_text, alert: false },
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
