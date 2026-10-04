/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SaikyoRankingView, { PERIODS } from './SaikyoRankingView.jsx';
import { scanStrongestRanking } from './strongestRanking.js';
import { isLongRangeLocked, LONG_RANGE_REQUIRES_ANNUAL, LONG_RANGE_SHOW_ANNUAL_MARK } from '../../lib/accessPolicy.js';

afterEach(cleanup);

const START = '2026-10-04';
const scoreText = (score) => `${score > 0 ? '+' : ''}${score}`;
const setup = (props = {}) => {
  const handlers = { onGoMap: vi.fn(), onOpenBoard: vi.fn(), onGoodOnlyChange: vi.fn(), onUpgrade: vi.fn() };
  const view = render(<SaikyoRankingView startDate={START} goodOnly {...handlers} {...props} />);
  return { ...handlers, ...view };
};

describe('吉日・吉方位を探す（並び・点数は今までのまま）', () => {
  it('1位は「期間のベスト」の大きなカード、2位以下は小さな行。順番と点数は検索の結果どおり', () => {
    const { container } = setup();
    const expected = scanStrongestRanking({ startDate: START, days: 31, goodOnly: true, directionPalace: null }).rows;
    const best = container.querySelector('.saikyo-best');
    expect(best.textContent).toContain('期間のベスト');
    expect(best.textContent).toContain(expected[0].label);
    expect(best.textContent).toContain(scoreText(expected[0].score));
    const rows = [...container.querySelectorAll('.saikyo-card')];
    expect(rows).toHaveLength(Math.min(expected.length, 10) - 1);
    rows.forEach((row, i) => {
      expect(row.textContent).toContain(`${i + 2}位`);
      expect(row.textContent).toContain(expected[i + 1].label);
      expect(row.textContent).toContain(scoreText(expected[i + 1].score));
    });
  });

  it('検索条件のまとめ: 全方位は 日数×8、方位を選ぶと 日数×1', () => {
    const { container } = setup();
    const summary = () => container.querySelector('.saikyo-summary').textContent;
    expect(summary()).toContain('全方位 × 1ヶ月');
    expect(summary()).toContain('2026/10/04 〜 2026/11/03（31日間）');
    expect(summary()).toContain('248件から検索');

    fireEvent.click(within(screen.getByRole('group', { name: '方位を選ぶ' })).getByRole('button', { name: '南東' }));
    expect(summary()).toContain('南東 × 1ヶ月');
    expect(summary()).toContain('31件から検索');
    const expected = scanStrongestRanking({ startDate: START, days: 31, goodOnly: true, directionPalace: 'son' }).rows;
    expect(container.querySelector('.saikyo-best').textContent).toContain(scoreText(expected[0].score));
  });

  it('方位は3×3（中央が全方位）で、選んでいるものだけが押された状態', () => {
    setup();
    const buttons = within(screen.getByRole('group', { name: '方位を選ぶ' })).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['北西', '北', '北東', '西', '全方位', '東', '南西', '南', '南東']);
    expect(buttons.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)).toEqual(['全方位']);
  });

  it('凶要素ありの1位には、点数だけで決めないよう注意を出す', () => {
    const { container } = setup();
    const top = scanStrongestRanking({ startDate: START, days: 31, goodOnly: true, directionPalace: null }).rows[0];
    expect(Boolean(container.querySelector('.saikyo-warn'))).toBe(top.hasBad);
    if (top.hasBad) expect(container.querySelector('.saikyo-warn').textContent).toContain('判断に影響する条件があります');
  });

  it('主のボタンは「この日・◯◯の場所を探す」。その日と方位を渡す。詳しい内容は補助', () => {
    const { container, onGoMap, onOpenBoard } = setup();
    const top = scanStrongestRanking({ startDate: START, days: 31, goodOnly: true, directionPalace: null }).rows[0];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`この日・${top.label}の場所を探す`) }));
    expect(onGoMap).toHaveBeenCalledWith({ date: top.date, palace: top.palace });

    fireEvent.click(screen.getByRole('button', { name: '詳しい内容を見る' }));
    expect(container.querySelector('.saikyo-best .mini-board-grid')).toBeTruthy();
    fireEvent.click(within(container.querySelector('.saikyo-best')).getByRole('button', { name: 'フル盤を見る' }));
    expect(onOpenBoard).toHaveBeenCalledWith({ date: top.date, boardType: '日' });
  });
});

describe('年額の印は出すが、開けておく（知り合いに見せるベータ期間）', () => {
  it('方針: 印は出す・鍵はかけない', () => {
    expect(LONG_RANGE_SHOW_ANNUAL_MARK).toBe(true);
    expect(LONG_RANGE_REQUIRES_ANNUAL).toBe(false);
  });

  it('3ヶ月以上に「年額」の印と開いた鍵が付くが、押せばそのまま検索できる（案内は出ない）', () => {
    const { container } = setup({ annualMark: true });
    const segment = within(screen.getByRole('group', { name: '期間を選ぶ' }));
    expect(container.querySelectorAll('.saikyo-segment .is-annual-open')).toHaveLength(3);
    expect(container.querySelectorAll('.saikyo-segment .is-locked')).toHaveLength(0);
    expect(segment.getByRole('button', { name: /3ヶ月/ }).textContent).toContain('年額');
    expect(segment.getByRole('button', { name: /3ヶ月/ }).textContent).toContain('🔓');
    expect(segment.getByRole('button', { name: '1ヶ月' }).textContent).not.toContain('年額');

    fireEvent.click(segment.getByRole('button', { name: /1年/ }));
    expect(container.querySelector('.saikyo-summary').textContent).toContain('全方位 × 1年');
    expect(screen.queryByRole('dialog', { name: '年額プランの案内' })).toBe(null);
    expect(container.textContent).toContain('いまはベータ期間のため、どなたでもお試しいただけます');
  });

  it('鍵をかけたときは、開いた鍵ではなく閉じた鍵になる', () => {
    const { container } = setup({ annualMark: true, longRangeLocked: true });
    expect(container.querySelectorAll('.saikyo-segment .is-locked')).toHaveLength(3);
    expect(container.querySelectorAll('.saikyo-segment .is-annual-open')).toHaveLength(0);
    expect(container.querySelector('.saikyo-segment .is-locked').textContent).toContain('🔒');
  });
});

describe('期間と年額プラン', () => {
  it('年額プランを売り始めるまでは、鍵を出さず全員が1年先まで選べる', () => {
    expect(LONG_RANGE_REQUIRES_ANNUAL).toBe(false);
    expect(isLongRangeLocked({ plan: undefined })).toBe(false);
    const { container } = setup();
    expect(container.querySelectorAll('.saikyo-segment .is-locked')).toHaveLength(0);
    fireEvent.click(within(screen.getByRole('group', { name: '期間を選ぶ' })).getByRole('button', { name: '1年' }));
    expect(container.querySelector('.saikyo-summary').textContent).toContain('全方位 × 1年');
  });

  it('限定にしたとき: 年額プラン以外は鍵つき、年額プランの人は使える', () => {
    expect(isLongRangeLocked({ plan: undefined }, true)).toBe(true);
    expect(isLongRangeLocked({ plan: 'monthly' }, true)).toBe(true);
    expect(isLongRangeLocked({ plan: 'annual' }, true)).toBe(false);
  });

  it('鍵つきの期間も見せる。押すと案内を出し、検索結果は変えない', () => {
    const { container, onUpgrade } = setup({ longRangeLocked: true });
    const segment = within(screen.getByRole('group', { name: '期間を選ぶ' }));
    expect(segment.getAllByRole('button')).toHaveLength(PERIODS.length);
    expect(container.querySelectorAll('.saikyo-segment .is-locked')).toHaveLength(3);

    fireEvent.click(segment.getByRole('button', { name: /半年/ }));
    expect(container.querySelector('.saikyo-summary').textContent).toContain('全方位 × 1ヶ月');
    const sheet = screen.getByRole('dialog', { name: '年額プランの案内' });
    expect(sheet.textContent).toContain('最大1年先まで吉日・吉方位を検索できます');

    fireEvent.click(within(sheet).getByRole('button', { name: '今は1ヶ月で探す' }));
    expect(screen.queryByRole('dialog', { name: '年額プランの案内' })).toBe(null);

    fireEvent.click(segment.getByRole('button', { name: /1年/ }));
    fireEvent.click(within(screen.getByRole('dialog', { name: '年額プランの案内' })).getByRole('button', { name: /年額プランで1年検索を使う/ }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);

    // 鍵のない期間は今までどおり切り替わる
    fireEvent.click(segment.getByRole('button', { name: '1週間' }));
    expect(container.querySelector('.saikyo-summary').textContent).toContain('全方位 × 1週間');
  });
});
