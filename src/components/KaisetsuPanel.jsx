import React, { useEffect, useMemo, useState } from 'react';
import { lookupChito } from '../kimon/loadChito.js';
import { classifyPalace } from '../kaisetsu/classifyPalace.js';

// 表示順は ShouiPanel と同一の8宮並び（盤の論理順とは独立）。
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

// 願い5軸（classifyPalace / API と同一キー）。
const AXES = [
  { key: 'goen',    label: 'ご縁' },
  { key: 'shigoto', label: '仕事' },
  { key: 'kinun',   label: '金運' },
  { key: 'kenko',   label: '健康' },
  { key: 'benkyo',  label: '勉強' },
];

// ランク記号 → 配色クラス。ShouiPanel の既存クラス（吉=青 / 中立=accent / 凶=赤）を
// そのまま流用し、新規の色定義は増やさない。
export function rankClass(symbol) {
  if (symbol === '◎' || symbol === '○') return 'shoui-kichi';
  if (symbol === '△') return 'shoui-chu';
  return 'shoui-kyo'; // ▲ ×（および不明時）
}

// ランク記号 → 大表示ラベル。
export const RANK_LABEL = {
  '◎': '大吉',
  '○': '吉',
  '△': '平',
  '▲': '凶',
  '×': '大凶',
};

// 局key（lookupChito / API のキー、再計算トリガ）。
export function boardKey(board) {
  return (board?.meta?.kyokusu || '') + (board?.meta?.eto || '');
}

// 8宮ぶんのランク記号を classifyPalace で算出する。チップの記号も結論短文も
// 同一エンジン（classifyPalace）由来なので、表示が食い違うことはない。
export function computeRanks(key) {
  if (!key) return {};
  let row;
  try {
    row = lookupChito(key);
  } catch {
    return {};
  }
  const out = {};
  for (const p of PALACE_ORDER) {
    try {
      out[p] = classifyPalace(row, p).rank;
    } catch {
      out[p] = null;
    }
  }
  return out;
}

// フルリーディング枠はダミーのプレースホルダー固定。実データ（full）は一切
// 取得・注入しない（出し分けはサーバー側で完結、UI からは到達不能）。
const DUMMY_FULL = [
  'この方位がもたらす流れを、八門・九星・八神のかさなりから丁寧に読み解いていきます。あなたの願いごとに沿って、いつ・どこへ・どのように動くと追い風になるのか。',
  'さらに、避けておきたい時間帯や、相性のよい過ごし方まで。盤が示すサインを一つずつ言葉にして、行動に移せるかたちでお届けします。',
  '結論だけでなく、その理由まで腑に落ちる――そんな鑑定をご用意しています。',
];

export default function KaisetsuPanel({ board }) {
  const key = boardKey(board);
  const ranks = useMemo(() => computeRanks(key), [key]);

  const [selPalace, setSelPalace] = useState(board?.score?.best_overall || 'kan');
  const [selAxis, setSelAxis] = useState('goen');
  const [cache, setCache] = useState({}); // 局key -> palaces（short のみ）
  const [showSoon, setShowSoon] = useState(false);

  // 局key が変わったら選択宮をベスト宮へリセットし、CTA メッセージも畳む。
  useEffect(() => {
    setSelPalace(board?.score?.best_overall || 'kan');
    setShowSoon(false);
    // best_overall は局key に対して安定なので key だけを依存にする。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // short を API から取得（局keyごと1回だけ・取得済みは再フェッチしない）。
  useEffect(() => {
    if (!key || cache[key]) return;
    let alive = true;
    fetch(`/api/kaisetsu?key=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j && j.palaces) {
          setCache((c) => ({ ...c, [key]: j.palaces }));
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [key, cache]);

  if (!board || !board.score) return null;

  const palaces = cache[key] || null;
  const short = palaces?.[selPalace]?.[selAxis]?.short || null;
  const selRank = ranks[selPalace] || null;
  const disp = PALACE_DISPLAY[selPalace];

  return (
    <div className="kaisetsu-panel">
      <div className="kp-head">
        <span className="kp-title">方位の解説</span>
        <span className="kp-sub">願いごと別の結論</span>
      </div>

      {/* 8方位チップ（横スクロール・各宮のランク記号付き） */}
      <div className="kp-dir-row" role="tablist" aria-label="方位">
        {PALACE_ORDER.map((p) => {
          const d = PALACE_DISPLAY[p];
          const r = ranks[p];
          const on = p === selPalace;
          return (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={on}
              className={`kp-dir${on ? ' is-on' : ''}`}
              onClick={() => setSelPalace(p)}
            >
              <span className="kp-dir-name">{d.label}</span>
              <span className="kp-dir-dir">{d.direction}</span>
              {r && <span className={`kp-dir-rank ${rankClass(r)}`}>{r}</span>}
            </button>
          );
        })}
      </div>

      {/* 願い5軸チップ */}
      <div className="kp-axis-row" role="tablist" aria-label="願いごと">
        {AXES.map((a) => (
          <button
            key={a.key}
            type="button"
            role="tab"
            aria-selected={a.key === selAxis}
            className={`kp-axis${a.key === selAxis ? ' is-on' : ''}`}
            onClick={() => setSelAxis(a.key)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* 大ランク + 方位 + 結論短文 */}
      <div className="kp-result">
        <div className="kp-rank-block">
          <span className={`kp-rank ${selRank ? rankClass(selRank) : ''}`}>{selRank || '—'}</span>
          <span className="kp-rank-label">{selRank ? RANK_LABEL[selRank] : ''}</span>
        </div>
        <div className="kp-result-main">
          <div className="kp-result-dir">{disp ? `${disp.label}（${disp.direction}）` : ''}</div>
          <p className="kp-short">
            {short || (palaces ? 'この方位・願いごとの解説はありません。' : '読み込み中…')}
          </p>
        </div>
      </div>

      {/* フルリーディング（常時ロック・中身はダミー固定） */}
      <div className="kp-full">
        <div className="kp-full-label">フルリーディング</div>
        <div className="kp-full-blur" aria-hidden="true">
          {DUMMY_FULL.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </div>
        <div className="kp-lock">
          <button type="button" className="kp-cta" onClick={() => setShowSoon(true)}>
            <span className="kp-cta-icon" aria-hidden="true">🔒</span>
            フルリーディングを読む
          </button>
          {showSoon && <p className="kp-soon" role="status">準備中です。</p>}
          <p className="kp-trial">いまなら初回1回ぶんを無料でお試しいただけます。</p>
        </div>
      </div>
    </div>
  );
}
