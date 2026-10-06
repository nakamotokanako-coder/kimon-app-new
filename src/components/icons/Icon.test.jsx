/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Icon, ICON_NAMES } from './index.js';
import { KAKKYOKU_USES } from '../../reverseDirection/kakkyokuSearch.js';

afterEach(cleanup);

// 決まりどおりに描いてあるか（色を固定しない・線の太さと端がそろっている）。
const REQUIRED = [
  'purpose-shrine', 'purpose-love', 'purpose-work', 'purpose-money', 'purpose-study', 'purpose-home', 'purpose-travel', 'purpose-purification',
  'search', 'arrow-left', 'arrow-right', 'chevron-down', 'chevron-up', 'bookmark', 'share', 'edit', 'close', 'reset', 'filter',
  'crown', 'star', 'calendar', 'compass', 'map', 'location', 'check-circle', 'info', 'clock', 'direction',
  'nav-home', 'nav-board', 'nav-map', 'nav-search', 'nav-more',
  'qimen-yin-yang', 'qimen-nine-grid', 'qimen-direction', 'qimen-sun', 'qimen-moon', 'qimen-cloud',
];

describe('線画アイコン', () => {
  it('頼まれたアイコンがすべてある', () => {
    for (const name of REQUIRED) expect(ICON_NAMES, name).toContain(name);
  });

  it('どのアイコンも、色を固定せず（currentColor）、同じ線で描く', () => {
    for (const name of ICON_NAMES) {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg, name).toBeTruthy();
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.getAttribute('fill')).toBe('none');
      expect(svg.getAttribute('stroke-width')).toBe('1.6');
      expect(svg.getAttribute('stroke-linecap')).toBe('round');
      expect(svg.getAttribute('stroke-linejoin')).toBe('round');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      // 色の直書き・文字・グラデーションを入れない
      expect(container.innerHTML, name).not.toMatch(/#[0-9a-fA-F]{3,8}|rgb\(|<text|Gradient/);
      for (const el of svg.querySelectorAll('[fill]')) expect(['none', 'currentColor']).toContain(el.getAttribute('fill'));
      cleanup();
    }
  });

  it('大きさと線の太さを変えられる。星は塗れる。名前が無ければ何も出さない', () => {
    const { container } = render(<Icon name="star" size={16} strokeWidth={2} filled title="評価" />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(svg.querySelector('path').getAttribute('fill')).toBe('currentColor');
    expect(svg.getAttribute('aria-label')).toBe('評価');
    cleanup();
    expect(render(<Icon name="star" />).container.querySelector('path').getAttribute('fill')).toBe('none');
    cleanup();
    expect(render(<Icon name="no-such-icon" />).container.innerHTML).toBe('');
  });

  it('格局検索で使うアイコンは、すべてある', () => {
    for (const use of KAKKYOKU_USES) expect(ICON_NAMES, use.key).toContain(use.icon);
    // 格局の印と背景の飾りは線画にしない（運営者が用意した絵を使う）
    expect(ICON_NAMES.filter((name) => name.startsWith('symbol-') || name.startsWith('decoration-'))).toEqual([]);
  });
});
