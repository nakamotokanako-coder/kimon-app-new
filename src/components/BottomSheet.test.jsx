/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BottomSheet, { getBadge } from './BottomSheet.jsx';
import { computeAxisRanks } from '../reverseDirection/FusionCard.jsx';

const KNOWN_KEY = '陰1局丁卯';

function mockFetch({ me }) {
  const calls = [];
  global.fetch = vi.fn(async (url) => {
    const href = String(url);
    calls.push(href);
    if (href === '/api/auth/me') return { ok: true, status: 200, json: async () => me };
    if (href.startsWith('/api/kaisetsu-full?')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ palaces: { kan: { goen: { mid: 'ご縁のmid解説です。' }, shigoto: { mid: '仕事のmid解説です。' } } } }),
      };
    }
    if (href.startsWith('/api/kaisetsu?')) {
      return { ok: true, status: 200, json: async () => ({ palaces: { kan: { goen: { short: 'ご縁のshort解説。' } } } }) };
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  return calls;
}

function makePalace(overrides = {}) {
  return {
    key: 'kan',
    label: '坎',
    direction: '北',
    data: {
      hachimon: '休門',
      hasshin: '六合',
      kyusei: '天蓬',
      tenban: '乙',
      chiban: '丙',
    },
    score: {
      score: 70,
      breakdown: {
        tenban_kan: 10,
        hachimon: 40,
        hasshin: 20,
        jukkan_kokuou: -10,
        kakkyoku: 10,
      },
      detected_jukkan: [
        { name: '月奇孛師', kikkyo: '凶', tenban: '乙', chiban: '丙' },
      ],
      detected_kakkyoku: [
        { name: '天遁', kichi_kyo: 'kichi', score: 10, meaning: '吉格' },
      ],
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete global.fetch;
});

describe('BottomSheet', () => {
  it('宮データを渡すとレンダリングされる', () => {
    const { container } = render(<BottomSheet palace={makePalace()} onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: '坎の詳細' })).toBeTruthy();
    expect(container.firstChild).toBe(null);
    expect(document.body.querySelector('.sheet-overlay.open')).toBeTruthy();
    expect(document.body.querySelector('.sheet.open')).toBeTruthy();
    expect(document.body.querySelector('.sheet-content')).toBeTruthy();
    expect(screen.getByText('坎（北）')).toBeTruthy();
    expect(screen.getAllByText('+70').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('大吉')).toBeTruthy();
    expect(screen.getByText('休門・六合・天蓬')).toBeTruthy();
    expect(screen.getByText('天盤乙 / 地盤丙')).toBeTruthy();
  });

  it('宮データが null の時はレンダリングされない', () => {
    const { container } = render(<BottomSheet palace={null} onClose={() => {}} />);

    expect(container.firstChild).toBe(null);
  });

  it('オーバーレイクリックで onClose を呼ぶ', () => {
    const onClose = vi.fn();
    render(<BottomSheet palace={makePalace()} onClose={onClose} />);

    fireEvent.click(document.body.querySelector('.sheet-overlay'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ハンドルクリックで onClose を呼ぶ', () => {
    const onClose = vi.fn();
    render(<BottomSheet palace={makePalace()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('格局がある宮では格局カードが表示される', () => {
    render(<BottomSheet palace={makePalace()} onClose={() => {}} />);

    expect(document.body.querySelector('.kakkyoku-card')).toBeTruthy();
    expect(screen.getByText('天遁')).toBeTruthy();
    expect(screen.getAllByText(/天盤の丙/).length).toBeGreaterThanOrEqual(1);
  });

  it('格局がない宮では格局カードが表示されない', () => {
    const palace = makePalace({
      score: {
        score: 10,
        breakdown: { hachimon: 20 },
        detected_kakkyoku: [],
      },
    });
    render(<BottomSheet palace={palace} onClose={() => {}} />);

    expect(document.body.querySelector('.kakkyoku-card')).toBe(null);
  });

  it('テーマのタブをクリックすると選択が切り替わる', () => {
    render(<BottomSheet palace={makePalace()} onClose={() => {}} />);

    const goen = screen.getByRole('tab', { name: /ご縁/ });
    const shigoto = screen.getByRole('tab', { name: /仕事/ });

    expect(goen.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(shigoto);
    expect(shigoto.getAttribute('aria-selected')).toBe('true');
    expect(goen.getAttribute('aria-selected')).toBe('false');
  });

  it('5テーマの◎○×は吉方位タブと同じ classifyPalace の軸ランク（タブと一体で二重表示しない）', () => {
    mockFetch({ me: { loggedIn: false } });
    render(<BottomSheet palace={makePalace()} kaisetsuKey={KNOWN_KEY} onClose={() => {}} />);

    const expected = computeAxisRanks(KNOWN_KEY, 'kan');
    const symbols = [...document.body.querySelectorAll('.axis-btn .axis-symbol')].map((node) => node.textContent);
    expect(symbols).toEqual(['goen', 'shigoto', 'kinun', 'kenko', 'benkyo'].map((k) => expected[k]));
    expect(document.body.querySelector('.axis-compare-card')).toBe(null);
  });

  it('全機能を使える人には kaisetsu-full の軸別 mid 本文を表示する', async () => {
    mockFetch({ me: { loggedIn: true, email: 'a@example.com', status: 'free', full: true } });

    render(<BottomSheet palace={makePalace()} kaisetsuKey={KNOWN_KEY} onClose={() => {}} />);

    expect(await screen.findByText('ご縁のmid解説です。')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /仕事/ }));
    expect(screen.getByText('仕事のmid解説です。')).toBeTruthy();
  });

  it('未ログインではエラーにせず、短い解説＋ログインの案内を出す（kaisetsu-full は呼ばない）', async () => {
    const calls = mockFetch({ me: { loggedIn: false } });
    const onOpenAccountSettings = vi.fn();

    render(
      <BottomSheet palace={makePalace()} kaisetsuKey={KNOWN_KEY} onClose={() => {}} onOpenAccountSettings={onOpenAccountSettings} />,
    );

    expect(await screen.findByText('ご縁のshort解説。')).toBeTruthy();
    expect(screen.getByText('ログインすると、ベータ期間中は全機能を無料で使えます。')).toBeTruthy();
    expect(screen.queryByText(/表示できませんでした/)).toBe(null);
    expect(calls.some((url) => url.startsWith('/api/kaisetsu-full'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'ログインする' }));
    expect(onOpenAccountSettings).toHaveBeenCalledTimes(1);
  });

  it('「評価の解説」は点数付きで、行を足すと総合評価になる', () => {
    render(<BottomSheet palace={makePalace()} onClose={() => {}} />);
    const toggle = screen.getByRole('button', { name: '評価の解説' });
    const detail = document.body.querySelector('.why-detail');

    expect(detail.className).not.toContain('open');
    fireEvent.click(toggle);
    expect(detail.className).toContain('open');
    expect(screen.getByText('八門（休門）')).toBeTruthy();
    expect(screen.getByText('和やかさをもたらす門。休息・仲直り・縁談に向く。')).toBeTruthy();
    expect(screen.getByText('+40')).toBeTruthy();
    expect(screen.getByText('-10')).toBeTruthy();
    expect(screen.getByText('総合評価')).toBeTruthy();
    const pts = [...detail.querySelectorAll('.why-row:not(.total) .pts')].map((el) => Number(el.textContent));
    expect(pts.reduce((a, b) => a + b, 0)).toBe(70);
    fireEvent.click(toggle);
    expect(detail.className).not.toContain('open');
  });

  it('格局は全件カードで出し、仮置きの「墨絵」は出さない', () => {
    const palace = makePalace();
    palace.score.detected_kakkyoku = [
      { name: '天遁', kichi_kyo: 'kichi', score: 10 },
      { name: '天網四張', kichi_kyo: 'kyo', score: -10 },
    ];
    render(<BottomSheet palace={palace} onClose={() => {}} />);
    expect(document.body.querySelectorAll('.kakkyoku-card')).toHaveLength(2);
    expect(screen.queryByText('墨絵')).toBe(null);
  });

  it('吉凶バッジは吉方位タブと同じ基準（+10 は「吉」）', () => {
    expect(getBadge(10).label).toBe('吉');
    expect(getBadge(40).label).toBe('大吉');
    expect(getBadge(0).label).toBe('中立');
    expect(getBadge(-5).label).toBe('凶');
  });
});
