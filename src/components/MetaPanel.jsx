function MetaCardGrid({ rows, emptyText = null }) {
  const visibleRows = rows.filter((row) => row.value);

  if (visibleRows.length === 0) {
    return emptyText ? <p className="ban-none">{emptyText}</p> : null;
  }

  return (
    <div className="meta-card-grid">
      {visibleRows.map((row) => (
        <div
          className={`meta-card${row.alert ? ' is-alert' : ''}${row.wide ? ' is-wide' : ''}${row.primary ? ' is-primary' : ''}`}
          key={row.key || row.label}
        >
          <div className="meta-card-label">{row.label}</div>
          <div className="meta-card-value lat">{row.value}</div>
        </div>
      ))}
    </div>
  );
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

  const infoRows = [
    { key: 'boardType', label: '盤種', value: `${meta.boardType}盤` },
    { key: 'kyokusu', label: '局数', value: meta.kyokusu, primary: true },
    { key: 'eto', label: 'キー干支', value: meta.eto, primary: true },
    { key: 'junshu', label: '旬首', value: meta.junshu },
    { key: 'chokufu', label: '直符', value: meta.chokufu },
    { key: 'chokushi', label: '直使', value: meta.chokushi },
    { key: 'kuubou', label: '空亡', value: meta.kuubou },
    { key: 'tenban_junshu_p', label: '旬首・天盤宮', value: meta.tenban_junshu_p },
    { key: 'chiban_junshu_p', label: '旬首・地盤宮', value: meta.chiban_junshu_p },
  ];

  const etoRows = [
    { key: 'eto_year', label: '年', value: meta.eto_year },
    { key: 'eto_month', label: '月', value: meta.eto_month },
    { key: 'eto_day', label: '日', value: meta.eto_day },
    { key: 'eto_time', label: '時', value: isHour ? meta.eto_time : null },
  ];

  return (
    <div className="meta-panel">
      <div className="meta-section">
        <div className="meta-section-title">
          <span className="meta-kicker lat">board info</span>
          <h3 className="maru">盤情報</h3>
        </div>
        <MetaCardGrid rows={infoRows} />
      </div>

      <div className="meta-section">
        <div className="meta-section-title">
          <span className="meta-kicker lat">eto</span>
          <h3 className="maru">干支</h3>
        </div>
        <MetaCardGrid rows={etoRows} />
      </div>

      {/* Phase 2B (2026-05-20): 九星セクションは盤情報パネルから削除
          （先生指示「情報の中に九星の情報はいらない」）。
          九星の計算ロジック自体は temporal data として温存。 */}

      <div className="meta-section">
        <div className="meta-section-title">
          <span className="meta-kicker lat">board level</span>
          <h3 className="maru">盤レベル判定</h3>
        </div>
        <MetaCardGrid rows={banRows} emptyText="特になし" />
      </div>
    </div>
  );
}
