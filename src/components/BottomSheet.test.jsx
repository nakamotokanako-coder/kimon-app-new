/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BottomSheet from './BottomSheet.jsx';

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

  it('軸セグメントのボタンをクリックすると activeAxis が切り替わる', () => {
    render(<BottomSheet palace={makePalace()} onClose={() => {}} />);

    const goen = screen.getByRole('tab', { name: 'ご縁' });
    const shigoto = screen.getByRole('tab', { name: '仕事' });

    expect(goen.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(shigoto);
    expect(shigoto.getAttribute('aria-selected')).toBe('true');
    expect(goen.getAttribute('aria-selected')).toBe('false');
  });

  it('5軸比較に実評価の記号を表示する', () => {
    render(<BottomSheet palace={makePalace()} onClose={() => {}} />);

    const symbols = [...document.body.querySelectorAll('.axis-symbol')].map((node) => node.textContent);
    expect(symbols).toHaveLength(5);
    expect(symbols.every((symbol) => ['◎', '○', '△', '×'].includes(symbol))).toBe(true);
    expect(screen.queryByText(/準備中/)).toBe(null);
  });

  it('kaisetsu-full API の軸別 mid 本文を表示する', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        palaces: {
          kan: {
            goen: { mid: 'ご縁のmid解説です。' },
            shigoto: { mid: '仕事のmid解説です。' },
          },
        },
      }),
    });

    render(<BottomSheet palace={makePalace()} kaisetsuKey="1甲" onClose={() => {}} />);

    expect(await screen.findByText('ご縁のmid解説です。')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '仕事' }));
    expect(screen.getByText('仕事のmid解説です。')).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith('/api/kaisetsu-full?key=1%E7%94%B2', { credentials: 'same-origin' });
  });

  it('kaisetsu-full API が403の時も月額プラン案内を表示しない', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'forbidden' }),
    });

    render(<BottomSheet palace={makePalace()} kaisetsuKey="2乙" onClose={() => {}} />);

    expect(await screen.findByText('解説を表示できませんでした。')).toBeTruthy();
    expect(screen.queryByText(/月額プラン/)).toBe(null);
  });

  it('「評価の解説」をクリックすると展開/折りたたみする', () => {
    render(<BottomSheet palace={makePalace()} onClose={() => {}} />);
    const toggle = screen.getByRole('button', { name: '評価の解説' });
    const detail = document.body.querySelector('.why-detail');

    expect(detail.className).not.toContain('open');
    fireEvent.click(toggle);
    expect(detail.className).toContain('open');
    expect(screen.getByText('八門（休門）')).toBeTruthy();
    expect(screen.getByText(/人間関係の調和を促し/)).toBeTruthy();
    expect(screen.getByText(/文書がらみの争い/)).toBeTruthy();
    expect(screen.getByText(/対外的な文章は1日寝かせて校閲/)).toBeTruthy();
    expect(screen.getByText(/人間関係の調和を促し/).className).toContain('kichi');
    expect(screen.getByText(/文書がらみの争い/).className).toContain('kyo');
    expect(screen.queryByText('+40')).toBe(null);
    expect(screen.queryByText('-10')).toBe(null);
    expect(screen.getByText('総合評価')).toBeTruthy();
    expect(screen.getAllByText('+70').length).toBeGreaterThanOrEqual(1);
    fireEvent.click(toggle);
    expect(detail.className).not.toContain('open');
  });
});
