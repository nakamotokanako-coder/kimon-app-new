/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Icon, ICON_NAMES, ICONS, Decoration, DECORATION_NAMES } from './index.js';
import { KAKKYOKU_GUIDE, KAKKYOKU_USES } from '../../reverseDirection/kakkyokuSearch.js';

afterEach(cleanup);

// 決まりどおりに描いてあるか（色を固定しない・線の太さと端がそろっている）。
const REQUIRED = [
  'purpose-shrine', 'purpose-love', 'purpose-work', 'purpose-money', 'purpose-study', 'purpose-home', 'purpose-travel', 'purpose-purification',
  'search', 'arrow-left', 'arrow-right', 'chevron-down', 'chevron-up', 'bookmark', 'share', 'edit', 'close', 'reset', 'filter',
  'crown', 'star', 'calendar', 'compass', 'map', 'location', 'check-circle', 'info', 'clock', 'direction',
  'nav-home', 'nav-board', 'nav-map', 'nav-search', 'nav-more',
  'qimen-yin-yang', 'qimen-nine-grid', 'qimen-direction', 'qimen-sun', 'qimen-moon', 'qimen-cloud',
  'symbol-qinglong', 'symbol-feiniao', 'symbol-tiandun', 'symbol-didun', 'symbol-rendun', 'symbol-yundun',
  'symbol-fengdun', 'symbol-longdun', 'symbol-hudun', 'symbol-shendun', 'symbol-guidun', 'symbol-yunv',
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
      const box = ICONS[name].box || 24;
      expect(svg.getAttribute('viewBox')).toBe(`0 0 ${box} ${box}`);
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.getAttribute('fill')).toBe('none');
      // 線の太さは 1.6。描き込んだ格局の印だけ、印ごとに決める
      expect(svg.getAttribute('stroke-width')).toBe(String(ICONS[name].strokeWidth ?? 1.6));
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

  it('格局の印は 48 の枠で描く（描き込んだ印は 96）', () => {
    const { container } = render(<Icon name="symbol-shendun" />);
    expect(container.querySelector('svg').getAttribute('viewBox')).toBe('0 0 48 48');
    expect(container.querySelector('svg').getAttribute('width')).toBe('48');
    cleanup();
    const detailed = render(<Icon name="symbol-qinglong" size={56} />).container.querySelector('svg');
    expect(detailed.getAttribute('viewBox')).toBe('0 0 96 96');
    expect(detailed.getAttribute('width')).toBe('56');
  });

  it('格局検索で使うアイコンは、すべてある', () => {
    for (const use of KAKKYOKU_USES) expect(ICON_NAMES, use.key).toContain(use.icon);
    for (const [name, guide] of Object.entries(KAKKYOKU_GUIDE)) expect(ICON_NAMES, name).toContain(guide.symbol);
    expect(new Set(Object.values(KAKKYOKU_GUIDE).map((guide) => guide.symbol)).size).toBe(12);
  });
});

describe('背景の飾り', () => {
  it('4つある。色を固定しない。読み上げには出さない', () => {
    expect(DECORATION_NAMES.sort()).toEqual(['branch', 'celestial', 'cloud', 'mountains']);
    const boxes = { cloud: '0 0 160 60', mountains: '0 0 320 120', branch: '0 0 200 100', celestial: '0 0 180 100' };
    for (const name of DECORATION_NAMES) {
      const file = readFileSync(`src/assets/decorations/decoration-${name}.svg`, 'utf8');
      expect(file).toContain(`viewBox="${boxes[name]}"`);
      expect(file).toContain('stroke="currentColor"');
      expect(file).toContain('fill="none"');
      expect(file).not.toMatch(/#[0-9a-fA-F]{3,8}|<text/);
      const { container } = render(<Decoration name={name} />);
      expect(container.querySelector('.decoration').getAttribute('aria-hidden')).toBe('true');
      expect(container.querySelector('svg')).toBeTruthy();
      cleanup();
    }
  });
});
