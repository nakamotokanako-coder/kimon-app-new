import React from 'react';

/**
 * 奇門三盤ルート画面（準備中プレースホルダ）。
 * 1日3方位ルート機能は将来実装予定。鍵🔒は飾りで、現状はアクセス制限なし。
 */
export default function SanbanRouteView() {
  return (
    <div className="sanban-route-view" aria-label="奇門三盤ルート（準備中）">
      <div className="sanban-route-icon" aria-hidden="true">🔒</div>
      <h3 className="sanban-route-title">奇門三盤ルート</h3>
      <p className="sanban-route-lead">
        1日に吉方位を3つ巡る<br />
        先生流の極意「玉の輿ツアー」
      </p>
      <p className="sanban-route-status">準備中</p>

      <hr className="sanban-route-divider" />

      <ul className="sanban-route-features">
        <li>1日に usable な吉方位が3つ揃う日を検索</li>
        <li>3スポット巡回ルートを地図に表示</li>
        <li>時盤ベース（自然時補正あり）</li>
      </ul>

      <p className="sanban-route-footer">今後のアップデートをお待ちください</p>
    </div>
  );
}
