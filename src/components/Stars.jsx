import React, { useMemo } from 'react';

/**
 * 宇宙テーマの星空 + ヴィネット（ダーク3テーマのみ表示）。
 *
 * モック board_cosmos_genkou.html の box-shadow 散布方式を移植。
 * - 3レイヤー（極小×多数 / 小×中量 / 中×少数アクセント）
 * - 座標は useMemo でマウント時に一度だけ生成し、再レンダーで再配置しない
 * - 星色はテーマ変数 var(--star1/2/3) を box-shadow 内で直接参照するため、
 *   テーマ切替時は座標を作り直さず色だけ追従する（軽量）
 * - 明るいテーマ（pearl/pink）では CSS 側で opacity:0 にして消す
 */
function genShadow(count, size, colorVar) {
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const x = (Math.random() * 100).toFixed(2);
    const y = (Math.random() * 100).toFixed(2);
    parts.push(`${x}vw ${y}vh 0 ${size} var(${colorVar})`);
  }
  return parts.join(',');
}

export default function Stars() {
  // モックの個数目安: 60 / 28 / 10（実機が重ければここを減らす）
  const layers = useMemo(
    () => [
      { cls: 'stars s1', shadow: genShadow(60, '-0.5px', '--star1') },
      { cls: 'stars s2', shadow: genShadow(28, '0px', '--star2') },
      { cls: 'stars s3', shadow: genShadow(10, '0.4px', '--star3') },
    ],
    [],
  );

  return (
    <>
      <div className="sky" aria-hidden="true">
        {layers.map((layer) => (
          <div key={layer.cls} className={layer.cls} style={{ boxShadow: layer.shadow }} />
        ))}
      </div>
      <div className="vig" aria-hidden="true" />
    </>
  );
}
