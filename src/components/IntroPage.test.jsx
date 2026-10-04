/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IntroPage, { hasSeenIntro, markIntroSeen, priceInfo, INTRO_SEEN_KEY } from './IntroPage.jsx';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('紹介ページ', () => {
  it('未ログインの人には「ログインしてすべての機能を使う」と「まず今日の盤を見る」を出す', () => {
    const onClose = vi.fn();
    const onLogin = vi.fn();
    render(<IntroPage loggedIn={false} onClose={onClose} onLogin={onLogin} />);

    fireEvent.click(screen.getByRole('button', { name: 'ログインしてすべての機能を使う' }));
    fireEvent.click(screen.getByRole('button', { name: 'まず今日の盤を見る' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ログイン中の人にはログインのボタンを出さず、「今日の吉方位を見る」で閉じる', () => {
    const onClose = vi.fn();
    render(<IntroPage loggedIn onClose={onClose} onLogin={() => {}} />);
    expect(screen.queryByRole('button', { name: 'ログインしてすべての機能を使う' })).toBe(null);
    expect(screen.queryByRole('button', { name: 'まず今日の盤を見る' })).toBe(null);
    fireEvent.click(screen.getByRole('button', { name: '今日の吉方位を見る' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('前半で価値（4つの問い・2つの使い方・盤は簡略化しない）、後半でログインと料金を伝える', () => {
    const { container } = render(<IntroPage loggedIn={false} onClose={() => {}} onLogin={() => {}} />);
    const order = [...container.querySelectorAll('.intro-inner > header, .intro-inner > section')]
      .map((el) => el.getAttribute('aria-label') || 'hero');
    expect(order).toEqual(['hero', 'できること', '2つの使い方', '盤は簡略化しない', 'ログインについて', '料金', 'まとめ']);
    expect(container.querySelector('.intro-title').textContent).toBe('吉方位を、日常の行き先へ。');
    expect([...container.querySelectorAll('.intro-question h4')].map((h) => h.textContent)).toEqual([
      '今日、どっちへ行く？',
      'なぜ、この方位が吉なの？',
      'その方位には、何がある？',
      '次の休み、いつ・どっちへ行く？',
    ]);
    // 03 は一番の違いなので、強めに見せる
    expect(container.querySelector('.intro-question.is-featured h4').textContent).toBe('その方位には、何がある？');
    expect(container.querySelector('.intro-emphasis').textContent).toBe('目的地から方位を見るだけでなく、方位から目的地を探せます。');
    expect([...container.querySelectorAll('.intro-usage-board')].map((el) => el.textContent)).toEqual(['時盤', '日盤']);
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
    expect(priceInfo('beta')).toEqual({
      status: '現在、ベータ期間中',
      lead: 'ログインすると、すべての機能を無料で使えます。',
      plansLabel: '正式版（予定）',
      plans: ['月額980円（税込）', '年額10,000円（税込）'],
      note: '正式版は、いつでも解約できます。',
    });
    expect(priceInfo('paid')).toMatchObject({
      status: 'プロ版',
      plans: ['月額980円（税込）', '年額10,000円（税込）'],
      note: '自動更新です。いつでも解約できます。',
    });
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
