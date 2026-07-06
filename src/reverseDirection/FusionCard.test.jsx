/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FusionCard, { computeAxisRanks, splitMid } from './FusionCard.jsx';

// 実在する局key（KaisetsuPanel.test.jsx / kaisetsuApi.test.js と同じ既知キー）。
const KNOWN_KEY = '陰1局丁卯';
// classifyPalace(KNOWN_KEY, 'kan').axisRanks === { goen:'○', shigoto:'△', kinun:'△', kenko:'▲', benkyo:'○' }
const BEST = {
  palace: 'kan',
  label: '北',
  short: 'N',
  score: 30,
  reasons: ['開門', '直符'],
  palaceData: { hachimon: '開門', hasshin: '直符', kyusei: '天輔', tenban: '乙', chiban: '丁' },
};

const SHORT_TEXT = 'short api text';
const MID_TEXT_GOEN = 'ご縁の短文リード。ご縁の本文がここに続く。';
const MID_TEXT_KENKO = '健康の短文リード。健康の本文がここに続く。';

function palacesFor(entries) {
  return { kan: entries };
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
      return {
        ok: true,
        json: async () => ({
          key: KNOWN_KEY,
          version: 'test',
          palaces: palacesFor({ goen: { short: SHORT_TEXT } }),
        }),
      };
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
          palaces: palacesFor({
            goen: { short: SHORT_TEXT, mid: MID_TEXT_GOEN, full: 'full goen' },
            kenko: { short: SHORT_TEXT, mid: MID_TEXT_KENKO, full: 'full kenko' },
          }),
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

describe('computeAxisRanks', () => {
  it('既知キー・宮で classifyPalace の axisRanks をそのまま返す', () => {
    expect(computeAxisRanks(KNOWN_KEY, 'kan')).toEqual({
      goen: '○', shigoto: '△', kinun: '△', kenko: '▲', benkyo: '○',
    });
  });
  it('不正キーでも例外を投げず null', () => {
    expect(computeAxisRanks('存在しない局', 'kan')).toBe(null);
    expect(computeAxisRanks('', 'kan')).toBe(null);
    expect(computeAxisRanks(KNOWN_KEY, null)).toBe(null);
  });
});

describe('splitMid', () => {
  it('1文目をリード・2文目以降を本文に分割する', () => {
    expect(splitMid('ご縁の短文リード。ご縁の本文がここに続く。')).toEqual({
      lead: 'ご縁の短文リード。',
      body: 'ご縁の本文がここに続く。',
    });
  });
  it('文が無ければリードのみ・本文は空文字', () => {
    expect(splitMid('句点なしの一文')).toEqual({ lead: '句点なしの一文', body: '' });
  });
  it('空/undefinedでも例外を投げない', () => {
    expect(splitMid('')).toEqual({ lead: '', body: '' });
    expect(splitMid(undefined)).toEqual({ lead: '', body: '' });
  });
});

describe('FusionCard 軸切替（paid）', () => {
  it('デフォルトはご縁。軸チップのランク記号は classifyPalace 由来で表示される', async () => {
    mockFetchAuth({ loggedIn: true, email: 'paid@example.com', status: 'paid' });
    render(<FusionCard best={BEST} boardKey={KNOWN_KEY} />);

    await screen.findByText(MID_TEXT_GOEN.split('。')[0] + '。');
    const chips = screen.getAllByRole('tab');
    const goenChip = chips.find((el) => el.textContent.includes('ご縁'));
    const kenkoChip = chips.find((el) => el.textContent.includes('健康'));
    expect(goenChip.textContent).toContain('○');
    expect(kenkoChip.textContent).toContain('▲');
    expect(goenChip.getAttribute('aria-selected')).toBe('true');
  });

  it('軸チップをクリックするとランク記号・リード・本文が連動して切り替わる', async () => {
    mockFetchAuth({ loggedIn: true, email: 'paid@example.com', status: 'paid' });
    render(<FusionCard best={BEST} boardKey={KNOWN_KEY} />);

    await screen.findByText('ご縁の短文リード。');
    const kenkoChip = screen.getAllByRole('tab').find((el) => el.textContent.includes('健康'));
    fireEvent.click(kenkoChip);

    await screen.findByText('健康の短文リード。');
    expect(screen.getByText('健康の本文がここに続く。')).toBeTruthy();
    expect(kenkoChip.getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText('ご縁の短文リード。')).toBe(null);
  });
});

describe('FusionCard フォールバック', () => {
  it('未ログインでは kaisetsu-full をfetchせず、short をリードに・本文位置は軽いCTAにする', async () => {
    const calls = mockFetchAuth({ loggedIn: false });
    render(<FusionCard best={BEST} boardKey={KNOWN_KEY} />);

    await screen.findByText(SHORT_TEXT);

    expect(calls.some((url) => url.startsWith('/api/kaisetsu-full?'))).toBe(false);
    expect(document.body.textContent).not.toContain(MID_TEXT_GOEN);
    expect(document.body.textContent).toContain('ログインすると続きが読めます。');
  });

  it('paid中のfull取得失敗ではクラッシュせず「読み込みに失敗しました」を表示する', async () => {
    mockFetchAuth({ loggedIn: true, email: 'paid@example.com', status: 'paid' }, { fullThrows: true });
    render(<FusionCard best={BEST} boardKey={KNOWN_KEY} />);

    await screen.findByText('読み込みに失敗しました');
  });

  it('paid中に403を受けてもクラッシュしない', async () => {
    mockFetchAuth({ loggedIn: true, email: 'paid@example.com', status: 'paid' }, { fullStatus: 403 });
    render(<FusionCard best={BEST} boardKey={KNOWN_KEY} />);

    await screen.findByText(SHORT_TEXT);
  });

  it('best が無くてもクラッシュせず該当なし表示', () => {
    mockFetchAuth({ loggedIn: false });
    render(<FusionCard best={null} boardKey={KNOWN_KEY} />);
    expect(screen.getByText('該当なし')).toBeTruthy();
  });
});
