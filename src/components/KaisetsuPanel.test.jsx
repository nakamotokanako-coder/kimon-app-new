/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const SHORT_TEXT = 'short api text';
const MID_TEXT = 'mid paid api text';
const FULL_TEXT = 'full paid api text';

function makeBoard(meta = KNOWN_META, best = 'kan') {
  return { meta, score: { best_overall: best } };
}

function palacesFor(entry) {
  return {
    kan: { goen: entry },
  };
}

function mockFetchAuth(authBody, { fullStatus = 200, fullThrows = false } = {}) {
  const calls = [];
  global.fetch = vi.fn(async (url) => {
    const href = String(url);
    calls.push(href);
    if (href === '/api/auth/me') {
      return { ok: true, json: async () => authBody };
    }
    if (href.startsWith('/api/kaisetsu?')) {
      return { ok: true, json: async () => ({ key: KNOWN_KEY, version: 'test', palaces: palacesFor({ short: SHORT_TEXT }) }) };
    }
    if (href.startsWith('/api/kaisetsu-full?')) {
      if (fullThrows) throw new Error('network_error');
      if (fullStatus === 403) {
        return { ok: false, status: 403, json: async () => ({ error: 'forbidden' }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          key: KNOWN_KEY,
          version: 'test',
          palaces: palacesFor({ short: SHORT_TEXT, mid: MID_TEXT, full: FULL_TEXT }),
        }),
      };
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  return calls;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete global.fetch;
});

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

  it('初期描画ではフルリーディングのロック背景を描画し、初回無料文言は出さない', () => {
    const html = renderToStaticMarkup(<KaisetsuPanel board={makeBoard()} />);
    expect(html).toContain('kp-full-blur');
    expect(html).toContain('フルリーディング');
    expect(html).not.toContain('いまなら初回1回ぶんを無料');
  });

  it('初期描画時に short/mid/full の実データを含まない（フェッチ前・出し分けはサーバー側）', () => {
    const html = renderToStaticMarkup(<KaisetsuPanel board={makeBoard()} />);
    // フェッチ前なので結論はプレースホルダーのみ。
    expect(html).toContain('読み込み中');
    // ロック中身はダミー固定。旧CTA押下メッセージ(準備中)は廃止。
    expect(html).not.toContain('準備中です');
    expect(html).not.toContain(SHORT_TEXT);
    expect(html).not.toContain(MID_TEXT);
    expect(html).not.toContain(FULL_TEXT);
  });
});

describe('KaisetsuPanel フルリーディング配線', () => {
  it('未ログインでは kaisetsu-full をfetchせず、mid/full由来テキストをDOMに出さない', async () => {
    const calls = mockFetchAuth({ loggedIn: false });
    render(<KaisetsuPanel board={makeBoard()} />);

    await screen.findByText('フルリーディングはログイン後にご利用いただけます。');

    expect(calls.some((url) => url.startsWith('/api/kaisetsu-full?'))).toBe(false);
    expect(document.body.textContent).not.toContain(MID_TEXT);
    expect(document.body.textContent).not.toContain(FULL_TEXT);
  });

  it('ログイン済みfreeでは kaisetsu-full をfetchせず、mid/full由来テキストをDOMに出さない', async () => {
    const calls = mockFetchAuth({ loggedIn: true, email: 'free@example.com', status: 'free' });
    render(<KaisetsuPanel board={makeBoard()} />);

    await screen.findByText('フルリーディングはプロ版で解放されます。プロ版は現在準備中です。');

    expect(calls.some((url) => url.startsWith('/api/kaisetsu-full?'))).toBe(false);
    expect(screen.queryByText('ログインして読む')).toBe(null);
    expect(document.body.textContent).not.toContain(MID_TEXT);
    expect(document.body.textContent).not.toContain(FULL_TEXT);
  });

  it('paid確認後のみ kaisetsu-full をfetchし、fullだけを表示する', async () => {
    const calls = mockFetchAuth({ loggedIn: true, email: 'paid@example.com', status: 'paid' });
    render(<KaisetsuPanel board={makeBoard()} />);

    await screen.findByText(FULL_TEXT);

    const authIndex = calls.indexOf('/api/auth/me');
    const fullIndex = calls.findIndex((url) => url.startsWith('/api/kaisetsu-full?'));
    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(fullIndex).toBeGreaterThan(authIndex);
    expect(document.body.textContent).toContain(FULL_TEXT);
    expect(document.body.textContent).not.toContain(MID_TEXT);
    expect(screen.queryByText('ログインして読む')).toBe(null);
  });

  it('未ログインCTAで設定タブ遷移callbackを呼ぶ', async () => {
    mockFetchAuth({ loggedIn: false });
    const onOpenAccountSettings = vi.fn();
    render(<KaisetsuPanel board={makeBoard()} onOpenAccountSettings={onOpenAccountSettings} />);

    fireEvent.click(await screen.findByText('ログインして読む'));

    expect(onOpenAccountSettings).toHaveBeenCalledTimes(1);
  });

  it('paid中に403を受けたらpaid扱いを解除し、fullキャッシュを破棄する', async () => {
    mockFetchAuth({ loggedIn: true, email: 'paid@example.com', status: 'paid' }, { fullStatus: 403 });
    render(<KaisetsuPanel board={makeBoard()} />);

    await waitFor(() => {
      expect(screen.getByText('フルリーディングはプロ版で解放されます。プロ版は現在準備中です。')).toBeTruthy();
    });
    expect(document.body.textContent).not.toContain(MID_TEXT);
    expect(document.body.textContent).not.toContain(FULL_TEXT);
  });

  it('paid中のfull取得失敗ではエラーメッセージを表示する', async () => {
    mockFetchAuth({ loggedIn: true, email: 'paid@example.com', status: 'paid' }, { fullThrows: true });
    render(<KaisetsuPanel board={makeBoard()} />);

    await screen.findByText('読み込みに失敗しました');

    expect(document.body.textContent).not.toContain(MID_TEXT);
    expect(document.body.textContent).not.toContain(FULL_TEXT);
  });
});
