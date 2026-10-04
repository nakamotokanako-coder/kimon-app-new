/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IntroPage, { hasSeenIntro, markIntroSeen, priceLines, INTRO_SEEN_KEY } from './IntroPage.jsx';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('紹介ページ', () => {
  it('未ログインの人には「ログインして使う」と「まず今日の盤を見る」を出す', () => {
    const onClose = vi.fn();
    const onLogin = vi.fn();
    render(<IntroPage loggedIn={false} onClose={onClose} onLogin={onLogin} />);

    fireEvent.click(screen.getByRole('button', { name: 'ログインして使う' }));
    fireEvent.click(screen.getByRole('button', { name: 'まず今日の盤を見る' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ログイン中の人にはログインのボタンを出さない', () => {
    render(<IntroPage loggedIn onClose={() => {}} onLogin={() => {}} />);
    expect(screen.queryByRole('button', { name: 'ログインして使う' })).toBe(null);
    expect(screen.getAllByRole('button', { name: '閉じる' }).length).toBeGreaterThanOrEqual(1);
  });

  it('×ボタンと Esc で閉じられ、開いている間は後ろのページを止める', () => {
    const onClose = vi.fn();
    const { unmount } = render(<IntroPage loggedIn={false} onClose={onClose} onLogin={() => {}} />);
    expect(document.documentElement.classList.contains('sheet-scroll-lock')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    expect(document.documentElement.classList.contains('sheet-scroll-lock')).toBe(false);
  });

  it('料金は実際の設定どおりに書く（ベータ中は無料・正式版の値段は予定）', () => {
    expect(priceLines('beta')).toEqual([
      'いまはベータ期間です。ログインすると、全機能を無料で使えます。',
      '正式版は月額980円（税込）、または年額10,000円（税込）の予定です。',
    ]);
    expect(priceLines('paid')).toEqual([
      'プロ版は月額980円（税込）。1か月ごとの自動更新で、いつでも解約できます。',
      '年額プランは年額10,000円（税込）。最大1年先まで吉日・吉方位を検索できます。',
    ]);
  });

  it('効果をうたう表現を書かない', () => {
    const { container } = render(<IntroPage loggedIn={false} onClose={() => {}} onLogin={() => {}} />);
    expect(container.textContent).not.toMatch(/運が上が|開運|必ず|絶対|当たる|叶う|効果/u);
  });

  it('一度見たら、次からは自動で出さない', () => {
    expect(hasSeenIntro()).toBe(false);
    markIntroSeen();
    expect(window.localStorage.getItem(INTRO_SEEN_KEY)).toBe('1');
    expect(hasSeenIntro()).toBe(true);
  });
});
