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
        kakkyoku: 10,
      },
      detected_kakkyoku: [
        { name: '天遁', kichi_kyo: 'kichi', score: 10, meaning: '吉格' },
      ],
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('BottomSheet', () => {
  it('宮データを渡すとレンダリングされる', () => {
    render(<BottomSheet palace={makePalace()} onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: '坎の詳細' })).toBeTruthy();
    expect(screen.getByText('坎（北）')).toBeTruthy();
    expect(screen.getByText('+70')).toBeTruthy();
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
    const { container } = render(<BottomSheet palace={makePalace()} onClose={onClose} />);

    fireEvent.click(container.querySelector('.bs-overlay'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ハンドルクリックで onClose を呼ぶ', () => {
    const onClose = vi.fn();
    render(<BottomSheet palace={makePalace()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('格局がある宮では格局カードが表示される', () => {
    const { container } = render(<BottomSheet palace={makePalace()} onClose={() => {}} />);

    expect(container.querySelector('.kakkyoku-card')).toBeTruthy();
    expect(screen.getByText('天遁')).toBeTruthy();
    expect(screen.getByText('吉格')).toBeTruthy();
  });

  it('格局がない宮では格局カードが表示されない', () => {
    const palace = makePalace({
      score: {
        score: 10,
        breakdown: { hachimon: 20 },
        detected_kakkyoku: [],
      },
    });
    const { container } = render(<BottomSheet palace={palace} onClose={() => {}} />);

    expect(container.querySelector('.kakkyoku-card')).toBe(null);
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

  it('「なぜこの評価？」をクリックすると展開/折りたたみする', () => {
    const { container } = render(<BottomSheet palace={makePalace()} onClose={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'なぜこの評価？' });
    const detail = container.querySelector('.why-detail');

    expect(detail.className).not.toContain('open');
    fireEvent.click(toggle);
    expect(detail.className).toContain('open');
    expect(screen.getByText('八門')).toBeTruthy();
    expect(screen.getByText('+40')).toBeTruthy();
    fireEvent.click(toggle);
    expect(detail.className).not.toContain('open');
  });
});
