/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LegalPage from './LegalPage.jsx';
import { LEGAL_DOCS, OPEN_LEGAL_EVENT, openLegal, PRIVACY, TERMS } from '../legal/documents.js';

afterEach(cleanup);

describe('利用規約・プライバシーポリシー', () => {
  it('それぞれのページを開けて、× と Esc で閉じられる', () => {
    const onClose = vi.fn();
    render(<LegalPage docKey="privacy" onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'プライバシーポリシー' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(PRIVACY.sections.length);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getAllByRole('button', { name: '閉じる' })[0]);
    expect(onClose).toHaveBeenCalledTimes(2);
    cleanup();
    render(<LegalPage docKey="terms" onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: '利用規約' })).toBeTruthy();
  });

  it('知らない名前では何も出さない', () => {
    const { container } = render(<LegalPage docKey="unknown" onClose={() => {}} />);
    expect(container.textContent).toBe('');
  });

  it('プライバシーポリシーは、実際に使っている外部サービスと、預かる情報を書いている', () => {
    const text = JSON.stringify(PRIVACY);
    for (const name of ['Vercel', 'Upstash', 'Resend', 'Gmail', 'Stripe', 'Nominatim', 'Overpass', '国土地理院', 'Google Fonts', 'Googleマップ']) {
      expect(text).toContain(name);
    }
    for (const item of ['メールアドレス', 'お気に入り', 'フィードバック', 'IPアドレス', '現在地', 'クッキー']) {
      expect(text).toContain(item);
    }
    expect(text).toContain('クレジットカードの番号は、このアプリでは受け取らず、保存もしません');
  });

  it('利用規約の料金は、実際の設定どおり。効果を約束しない', () => {
    const text = JSON.stringify(TERMS);
    expect(text).toContain('月額980円（税込）');
    expect(text).toContain('年額10,000円（税込）');
    expect(text).toContain('結果や効果を約束するものではありません');
    expect(text).not.toMatch(/運が上が|開運|必ず当た/u);
  });

  it('合図で開ける（設定・ログイン画面から）', () => {
    const got = [];
    const handler = (event) => got.push(event.detail);
    window.addEventListener(OPEN_LEGAL_EVENT, handler);
    openLegal('terms');
    window.removeEventListener(OPEN_LEGAL_EVENT, handler);
    expect(got).toEqual(['terms']);
    expect(Object.keys(LEGAL_DOCS)).toEqual(['privacy', 'terms']);
  });
});
