import React from 'react';

// 使い方ガイド用の説明図（Googleマップの共有リンクを貼る手順）。
// 実際の画面の写真は使わず、形だけをまねた図を描く（人の名前や写真が写らないように。他社の画面をそのまま載せないように）。
// 色はテーマの色（CSS の変数）を使う。押す場所だけ、アクセントの色の輪で示す。

const frame = { fill: 'var(--bg-cell)', stroke: 'var(--border-subtle)', strokeWidth: 1.5 };
const soft = { fill: 'color-mix(in srgb, var(--text-secondary) 16%, transparent)' };
const line = { fill: 'none', stroke: 'var(--text-secondary)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const text = { fill: 'var(--text-primary)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' };
const small = { fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'inherit' };
const ring = { fill: 'none', stroke: 'var(--accent)', strokeWidth: 3 };
const callout = { fill: 'var(--accent)', fontSize: 12, fontWeight: 800, fontFamily: 'inherit' };

// 1. Googleマップで場所を開いて、共有のボタンを押す
function PlaceCardFigure() {
  return (
    <svg viewBox="0 0 320 150" role="img" aria-label="場所の名前の右にある、共有のボタンを押す">
      <rect x="4" y="4" width="312" height="142" rx="16" {...frame} />
      <text x="20" y="38" {...text}>お店や施設の名前</text>
      <rect x="20" y="50" width="120" height="8" rx="4" {...soft} />
      {/* 保存・共有・閉じる の丸いボタン */}
      <circle cx="196" cy="36" r="17" {...soft} />
      <path d="M190 28h12v16l-6-5-6 5z" {...line} />
      <circle cx="240" cy="36" r="17" {...soft} />
      <path d="M240 42V27M234 32l6-6 6 6M232 38v8h16v-8" {...line} />
      <circle cx="240" cy="36" r="22" {...ring} />
      <circle cx="284" cy="36" r="17" {...soft} />
      <path d="M278 30l12 12M290 30l-12 12" {...line} />
      <text x="240" y="78" textAnchor="middle" {...callout}>ここを押す（共有）</text>
      {/* 下に並ぶボタン */}
      <rect x="20" y="98" width="72" height="30" rx="15" {...soft} />
      <rect x="102" y="98" width="88" height="30" rx="15" {...soft} />
      <rect x="200" y="98" width="72" height="30" rx="15" {...soft} />
    </svg>
  );
}

// 2. 出てきた画面で「コピー」を押す
function ShareSheetFigure() {
  return (
    <svg viewBox="0 0 320 150" role="img" aria-label="共有の画面で、コピーを押す">
      <rect x="4" y="4" width="312" height="142" rx="16" {...frame} />
      <rect x="20" y="18" width="34" height="34" rx="8" {...soft} />
      <rect x="64" y="22" width="150" height="9" rx="4.5" {...soft} />
      <rect x="64" y="38" width="90" height="7" rx="3.5" {...soft} />
      <path d="M20 64h280" stroke="var(--border-subtle)" strokeWidth="1" />
      {/* 丸いボタンが横に並ぶ。左端が「コピー」 */}
      <circle cx="52" cy="98" r="22" {...soft} />
      <path d="M46 92h9v13h-9zM50 89h9v13" {...line} />
      <circle cx="52" cy="98" r="27" {...ring} />
      <text x="52" y="140" textAnchor="middle" {...callout}>コピー</text>
      {[124, 196, 268].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="98" r="22" {...soft} />
          <rect x={cx - 16} y="130" width="32" height="6" rx="3" {...soft} />
        </g>
      ))}
    </svg>
  );
}

// 3. 奇門遁甲Zの検索の欄に貼り付けて、検索を押す
function PasteFigure() {
  return (
    <svg viewBox="0 0 320 110" role="img" aria-label="奇門遁甲Zの検索の欄に貼り付けて、検索を押す">
      <rect x="4" y="4" width="312" height="102" rx="16" {...frame} />
      <rect x="18" y="20" width="212" height="38" rx="10" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      <text x="28" y="44" {...small}>https://maps.app.goo.gl/…</text>
      <rect x="240" y="20" width="62" height="38" rx="10" fill="var(--accent)" />
      <text x="271" y="44" textAnchor="middle" fill="var(--bg-main)" fontSize="13" fontWeight="800" fontFamily="inherit">検索</text>
      <rect x="236" y="16" width="70" height="46" rx="13" {...ring} />
      <text x="124" y="86" textAnchor="middle" {...callout}>貼り付けて「検索」</text>
    </svg>
  );
}

export const LINK_STEP_FIGURES = [PlaceCardFigure, ShareSheetFigure, PasteFigure];
