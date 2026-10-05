/* @vitest-environment jsdom */
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CompassWheel, { THEME_MARKS, themeOf } from './CompassWheel.jsx';
import { DIRECTION_ICONS } from './directionIcons.generated.js';

afterEach(cleanup);

const item = (palace, label, score, tone, hachimon) => ({ palace, label, score, tone, palaceData: { hachimon }, reasons: [] });
// 北東が一番良い。南東は凶だが生門（金運）が入っている。東は中立
const RANKINGS = [
  item('gon', '北東', 80, 'great', '休門'),
  item('ken', '北西', 30, 'good', '開門'),
  item('shin', '東', 0, 'neutral', '景門'),
  item('son', '南東', -20, 'bad', '生門'),
  item('ri', '南', -90, 'bad-strong', '死門'),
  item('kon', '南西', -30, 'bad', '杜門'),
  item('da', '西', 10, 'weak', '景門'),
  item('kan', '北', -70, 'bad-strong', '驚門'),
];

describe('円盤: しるし', () => {
  it('テーマのしるしは、吉の方位にだけ出す（凶の方位の金運・健康は出さない）', () => {
    expect(themeOf(RANKINGS[0])).toBe('bond');    // 北東 +80 休門
    expect(themeOf(RANKINGS[3])).toBe(null);      // 南東 -20 生門 → 出さない
    expect(themeOf(RANKINGS[2])).toBe(null);      // 東 0 → 出さない
    const { container } = render(<CompassWheel rankings={RANKINGS} bestPalace="gon" />);
    expect(container.querySelectorAll('.wheel-theme')).toHaveLength(3); // 北東・北西・西
  });

  it('出ているしるしの意味を、下に書く（出ていないしるしは書かない）', () => {
    render(<CompassWheel rankings={RANKINGS} bestPalace="gon" />);
    const legend = screen.getByLabelText('しるしの意味');
    expect(legend.textContent).toContain('ご縁');
    expect(legend.textContent).toContain('仕事');
    expect(legend.textContent).toContain('勉強');
    expect(legend.textContent).not.toContain('金運');
    expect(legend.textContent).toContain('その方位に入っている門のテーマです');
  });

  it('中央は方位星。一番良い方位に印を付け、凡例にも出す', () => {
    const { container } = render(<CompassWheel rankings={RANKINGS} bestPalace="gon" />);
    expect(container.querySelector('.wheel-rose')).toBeTruthy();
    expect(container.textContent).not.toContain('基準点');
    expect(container.querySelectorAll('.wheel-best')).toHaveLength(1);
    expect(container.querySelector('.wheel-legend').textContent).toContain('一番良い方位');
    expect(container.querySelector('.wheel-legend').textContent).not.toContain('最大吉');
  });

  it('吉の方位が1つもない日は、一番良い方位の印もしるしの説明も出さない', () => {
    const allBad = RANKINGS.map((r) => ({ ...r, score: -10, tone: 'bad' }));
    const { container } = render(<CompassWheel rankings={allBad} bestPalace={null} />);
    expect(container.querySelector('.wheel-best')).toBe(null);
    expect(container.querySelector('.wheel-themes')).toBe(null);
    expect(container.querySelector('.wheel-legend').textContent).not.toContain('一番良い方位');
  });

  it('しるしは、置いてある線画と同じもの（全部そろっている）', () => {
    for (const mark of [...Object.values(THEME_MARKS).map((m) => m.icon), 'compass-rose', 'best-direction']) {
      expect(DIRECTION_ICONS[mark], mark).toBeTruthy();
      expect(existsSync(`public/direction-ui/${mark}.svg`), mark).toBe(true);
      const svg = readFileSync(`public/direction-ui/${mark}.svg`, 'utf8');
      expect(svg.replace(/>\s+</g, '><')).toContain(DIRECTION_ICONS[mark]);
    }
  });
});

describe('円盤: 方位を選ぶ（一番良い方位と、選んでいる方位は別）', () => {
  it('方位を押すと、その方位を選ぶ。キーボードでも選べる', () => {
    const onSelectPalace = vi.fn();
    render(<CompassWheel rankings={RANKINGS} bestPalace="gon" onSelectPalace={onSelectPalace} />);
    fireEvent.click(screen.getByRole('button', { name: /^西 \+10/ }));
    expect(onSelectPalace).toHaveBeenCalledWith('da');
    fireEvent.keyDown(screen.getByRole('button', { name: /^北西 \+30/ }), { key: 'Enter' });
    expect(onSelectPalace).toHaveBeenCalledWith('ken');
    expect(screen.getByRole('button', { name: '北東 +80 大吉（一番良い方位）' })).toBeTruthy();
    expect(screen.getByText('方位を押すと、その方位を選べます。')).toBeTruthy();
  });

  it('選んでいる方位に金の輪郭、ほかは少し薄く。一番良い方位の印はそのまま', () => {
    const { container } = render(<CompassWheel rankings={RANKINGS} bestPalace="gon" selectedPalace="da" onSelectPalace={() => {}} />);
    expect(container.querySelectorAll('.wheel-sector.is-selected')).toHaveLength(1);
    expect(container.querySelectorAll('.wheel-sector.is-dim')).toHaveLength(7);
    expect(container.querySelector('.wheel-selected-outline')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^西 \+10/ }).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.wheel-best').closest('.wheel-sector').getAttribute('aria-label')).toContain('北東');
  });

  it('選べないとき（押す先が無いとき）は、ボタンにしない', () => {
    const { container } = render(<CompassWheel rankings={RANKINGS} bestPalace="gon" />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelector('.wheel-hint')).toBe(null);
  });
});
