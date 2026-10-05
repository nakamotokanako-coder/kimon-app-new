/* @vitest-environment jsdom */
import React from 'react';
import { existsSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IntroPage, {
  hasSeenIntro, markIntroSeen, priceInfo, INTRO_SEEN_KEY, MAIN_CTA, SPOTS, STEPS, USAGES,
} from './IntroPage.jsx';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const setup = (props = {}) => {
  const handlers = { onClose: vi.fn(), onLogin: vi.fn(), onOpenToday: vi.fn(), onOpenNow: vi.fn(), onOpenPlan: vi.fn() };
  const view = render(<IntroPage loggedIn={false} {...handlers} {...props} />);
  return { ...handlers, ...view };
};

describe('紹介ページ（LP）の流れ', () => {
  it('「今日、どっちへ行く？」で始まり、「探す → 選ぶ → そして実際に動く」で終わる', () => {
    const { container } = setup();
    const order = [...container.querySelectorAll('.lp > header, .lp > section')].map((el) => el.getAttribute('aria-label') || 'hero');
    expect(order).toEqual(['hero', '使い方は、かんたん4ステップ', '2つの使い方', 'その方位には、何がある？', '盤は簡略化しない', '無料と料金', 'まとめ']);
    expect(container.querySelector('.lp-h1').textContent).toBe('今日、どっちへ行く？');
    expect(container.querySelector('.lp-tagline').textContent).toBe('吉方位を、日常の行き先へ');
    expect(container.querySelector('.lp-final-copy').textContent).toBe('探す→選ぶ→そして実際に動く');
  });

  it('4ステップは、実際に使う順番（日時 → 理由 → 地図 → 出かける）', () => {
    const { container } = setup();
    expect([...container.querySelectorAll('.lp-step h4')].map((h) => h.textContent)).toEqual(['日時を選ぶ', '吉の理由がわかる', '地図で探す', '実際に出かける']);
    expect([...container.querySelectorAll('.lp-step-no')].map((n) => n.textContent)).toEqual(['01', '02', '03', '04']);
  });

  it('タイトルは句点で終わらない。効果を約束する表現を書かない', () => {
    const { container } = setup();
    for (const el of container.querySelectorAll('h2, h3, h4, .lp-tagline, .lp-final-copy, .lp-final-note')) {
      expect(el.textContent.endsWith('。')).toBe(false);
    }
    expect(container.textContent).not.toMatch(/運が上が|運を動か|運気|開運|必ず|絶対|当たる|叶う|効果/u);
  });
});

describe('紹介ページのボタン（押したあと何が起きるかが分かる文言）', () => {
  it('メインのボタンは上と下の2か所。「今日の吉方位を見る」でホームへ', () => {
    const { onOpenToday } = setup();
    const buttons = screen.getAllByRole('button', { name: new RegExp(MAIN_CTA) });
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => fireEvent.click(button));
    expect(onOpenToday).toHaveBeenCalledTimes(2);
    expect(screen.getByText('登録なしでも、今日の盤が見られます')).toBeTruthy();
  });

  it('NOW は「今から行ける場所を見る」、PLAN は「予定日から探す」', () => {
    const { onOpenNow, onOpenPlan, container } = setup();
    expect(USAGES.map((u) => u.label)).toEqual(['NOW', 'PLAN']);
    fireEvent.click(screen.getByRole('button', { name: /今から行ける場所を見る/ }));
    fireEvent.click(screen.getByRole('button', { name: /予定日から探す/ }));
    expect(onOpenNow).toHaveBeenCalledTimes(1);
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.lp-usage.is-now h4').textContent).toBe('今から吉方位へ');
    expect(container.querySelector('.lp-usage.is-plan h4').textContent).toBe('休みの日から旅先を探す');
    expect(container.textContent).not.toContain('詳しくはこちら');
  });

  it('未ログインの人にはログインの案内を出し、ログイン中の人には出さない', () => {
    const { onLogin } = setup();
    fireEvent.click(screen.getByRole('button', { name: /ログインしてすべての機能を使う/ }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    cleanup();
    setup({ loggedIn: true });
    expect(screen.queryByRole('button', { name: /ログインしてすべての機能を使う/ })).toBe(null);
    expect(screen.getAllByRole('button', { name: new RegExp(MAIN_CTA) })).toHaveLength(2);
  });

  it('×ボタンと Esc で閉じられ、開いている間は後ろのページを止める', () => {
    const { onClose, unmount } = setup();
    expect(document.documentElement.classList.contains('sheet-scroll-lock')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    expect(document.documentElement.classList.contains('sheet-scroll-lock')).toBe(false);
  });
});

describe('紹介ページの中身', () => {
  it('載せているアプリの画面と写真は、実際にあるファイル', () => {
    const { container } = setup();
    const files = new Set([...container.querySelectorAll('img')].map((img) => img.getAttribute('src')));
    for (const el of container.querySelectorAll('[style*="background-image"]')) {
      files.add(el.style.backgroundImage.replace(/^url\(["']?|["']?\)$/g, ''));
    }
    expect(files.size).toBeGreaterThanOrEqual(12);
    for (const file of files) {
      expect(file.startsWith('/lp/')).toBe(true);
      expect(existsSync(`public${file}`), file).toBe(true);
    }
    // アプリの画面は、実際の画面を撮ったもの（スマホの枠に入れて見せる）
    expect([...container.querySelectorAll('.lp-phone img')].map((img) => img.getAttribute('src'))).toEqual(['/lp/screen-home.webp', '/lp/screen-map.webp']);
    expect(STEPS.map((s) => s.image)).toEqual(['step-date.webp', 'step-reason.webp', 'step-map.webp', 'spot-shrine.webp']);
  });

  it('飾りの画像は読み上げない。中身のある画像には説明を付ける', () => {
    const { container } = setup();
    for (const img of container.querySelectorAll('img.lp-deco')) expect(img.getAttribute('alt')).toBe('');
    for (const img of container.querySelectorAll('.lp-phone img, .lp-step-image img')) expect(img.getAttribute('alt').length).toBeGreaterThan(5);
  });

  it('その方位には何がある？: スポットの例を4つ見せる', () => {
    const { container } = setup();
    const section = container.querySelector('.lp-map');
    expect(within(section).getByRole('heading', { name: 'その方位には、何がある？' })).toBeTruthy();
    expect(SPOTS).toHaveLength(4);
    expect([...section.querySelectorAll('.lp-spot strong')].map((s) => s.textContent)).toEqual(['カフェでひと息', '神社へお参り', '観光スポットへ', 'お気に入りの店を探す']);
  });

  it('無料を先に伝え、料金は実際の設定どおり（ベータ中は無料・正式版の値段は予定）', () => {
    const { container } = setup();
    const price = container.querySelector('.lp-price');
    expect(price.textContent.indexOf('まずは無料で使えます')).toBeLessThan(price.textContent.indexOf('月額980円'));
    expect(price.querySelector('.lp-price-badge').textContent).toBe('β期間中無料');
    expect(priceInfo('beta')).toMatchObject({
      status: '現在、ベータ期間中',
      plansLabel: '正式版（予定）',
      plans: ['月額980円（税込）', '年額10,000円（税込）'],
      note: '正式版は、いつでも解約できます。',
    });
    expect(priceInfo('paid')).toMatchObject({ status: 'プロ版', plans: ['月額980円（税込）', '年額10,000円（税込）'] });
  });

  it('一度見たら、次からは自動で出さない', () => {
    expect(hasSeenIntro()).toBe(false);
    markIntroSeen();
    expect(window.localStorage.getItem(INTRO_SEEN_KEY)).toBe('1');
    expect(hasSeenIntro()).toBe(true);
  });
});
