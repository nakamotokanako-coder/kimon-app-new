import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import KaisetsuPanel, {
  rankClass,
  RANK_LABEL,
  boardKey,
  computeRanks,
} from './KaisetsuPanel.jsx';

// 実在する局key（kaisetsuApi.test.js と同じ既知キー）。
const KNOWN_KEY = '陰1局丁卯';
// "陰1局" + "丁卯" に分解して board.meta を組み立てる。
const KNOWN_META = { kyokusu: '陰1局', eto: '丁卯' };

function makeBoard(meta = KNOWN_META, best = 'kan') {
  return { meta, score: { best_overall: best } };
}

describe('rankClass', () => {
  it('吉(◎○)は青(shoui-kichi)', () => {
    expect(rankClass('◎')).toBe('shoui-kichi');
    expect(rankClass('○')).toBe('shoui-kichi');
  });
  it('平(△)は中立(shoui-chu)', () => {
    expect(rankClass('△')).toBe('shoui-chu');
  });
  it('凶(▲×)および不明は赤(shoui-kyo)', () => {
    expect(rankClass('▲')).toBe('shoui-kyo');
    expect(rankClass('×')).toBe('shoui-kyo');
    expect(rankClass(null)).toBe('shoui-kyo');
  });
});

describe('RANK_LABEL', () => {
  it('5段すべてにラベルがある', () => {
    expect(Object.keys(RANK_LABEL).sort()).toEqual(['◎', '○', '△', '▲', '×'].sort());
  });
});

describe('boardKey', () => {
  it('kyokusu + eto を連結する', () => {
    expect(boardKey(makeBoard())).toBe(KNOWN_KEY);
  });
  it('board が無ければ空文字', () => {
    expect(boardKey(null)).toBe('');
  });
});

describe('computeRanks', () => {
  it('既知キーで8宮すべてに classifyPalace のランク記号が付く', () => {
    const ranks = computeRanks(KNOWN_KEY);
    const palaces = ['son', 'ri', 'kun', 'shin', 'da', 'gon', 'kan', 'ken'];
    for (const p of palaces) {
      expect(['◎', '○', '△', '▲', '×']).toContain(ranks[p]);
    }
  });
  it('不正キーでも例外を投げず空オブジェクト', () => {
    expect(computeRanks('存在しない局')).toEqual({});
    expect(computeRanks('')).toEqual({});
  });
});

describe('KaisetsuPanel 静的レンダリング', () => {
  it('score 無しなら何も描画しない', () => {
    expect(renderToStaticMarkup(<KaisetsuPanel board={{ meta: KNOWN_META }} />)).toBe('');
    expect(renderToStaticMarkup(<KaisetsuPanel board={null} />)).toBe('');
  });

  it('フルリーディングのロック枠とCTAを常に描画する', () => {
    const html = renderToStaticMarkup(<KaisetsuPanel board={makeBoard()} />);
    expect(html).toContain('kp-full-blur');
    expect(html).toContain('kp-cta');
    expect(html).toContain('フルリーディング');
    expect(html).toContain('いまなら初回1回ぶんを無料');
  });

  it('初期描画時に short/full の実データを含まない（フェッチ前・出し分けはサーバー側）', () => {
    const html = renderToStaticMarkup(<KaisetsuPanel board={makeBoard()} />);
    // フェッチ前なので結論はプレースホルダーのみ。
    expect(html).toContain('読み込み中');
    // ロック中身はダミー固定。CTA押下メッセージ(準備中)は初期状態では未表示。
    expect(html).not.toContain('準備中です');
  });
});
