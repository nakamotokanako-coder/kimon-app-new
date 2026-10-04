/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TimeSlotList, { directionSummary, gateSummary } from './TimeSlotList.jsx';
import { buildTimeline } from './reverseDirection.js';

afterEach(cleanup);

const DATE = '2026-10-04';
const timeline = buildTimeline({ date: DATE, goodOnly: true });
const setup = (props = {}) => {
  const onGoMap = vi.fn();
  const onOpenBoard = vi.fn();
  render(<TimeSlotList timeline={timeline} nowHour={18} onGoMap={onGoMap} onOpenBoard={onOpenBoard} {...props} />);
  return { onGoMap, onOpenBoard };
};
const rowOf = (hour) => {
  const slot = timeline.find((s) => s.hour === hour);
  return screen.getAllByRole('button', { expanded: false }).find((b) => b.textContent.includes(slot.label));
};
const scoreText = (score) => `${score > 0 ? '+' : ''}${score}`;

describe('時間帯ごとの吉方位（一覧）', () => {
  it('計算結果をそのまま出す（時間・最良方位・点数・八門と八神）', () => {
    setup();
    for (const slot of timeline) {
      const row = screen.getAllByRole('button').find((b) => b.className.includes('tsl-row') && b.textContent.includes(slot.label));
      if (!slot.best) {
        expect(row.textContent).toContain('該当なし');
        continue;
      }
      expect(row.textContent).toContain(slot.best.label);
      expect(row.textContent).toContain(scoreText(slot.best.score));
      expect(row.textContent).toContain(slot.best.palaceData.hachimon);
    }
  });

  it('その日で一番点数の高い時間帯にだけ「今日の最高」を付ける', () => {
    setup();
    const top = Math.max(...timeline.filter((s) => s.best).map((s) => s.best.score));
    const rows = screen.getAllByRole('button').filter((b) => b.className.includes('tsl-row'));
    for (const [i, slot] of timeline.entries()) {
      expect(rows[i].textContent.includes('今日の最高')).toBe(Boolean(slot.best) && slot.best.score === top);
    }
  });

  it('今の時間帯に「いま」の印が付く', () => {
    setup();
    const rows = screen.getAllByRole('button').filter((b) => b.className.includes('tsl-row'));
    expect(rows.filter((r) => r.textContent.includes('いま'))).toHaveLength(1);
    expect(rows.find((r) => r.textContent.includes('いま')).className).toContain('is-now');
  });
});

describe('時間帯を開いたとき（8方位から選ぶ）', () => {
  const slot = timeline.find((s) => s.best && s.rankings.filter((r) => r.score > 0).length >= 2);
  const open = () => {
    const handlers = setup();
    fireEvent.click(rowOf(slot.hour));
    return handlers;
  };

  it('最初はその時間の最良方位が選ばれ、8方位すべてが点数と門つきで並ぶ', () => {
    open();
    const group = screen.getByRole('group', { name: '8方位から選ぶ' });
    const cells = within(group).getAllByRole('button');
    expect(cells).toHaveLength(8);
    for (const item of slot.rankings) {
      const cell = cells.find((c) => c.getAttribute('aria-label').startsWith(`${item.label} `));
      expect(cell.textContent).toContain(scoreText(item.score));
      expect(cell.textContent).toContain(item.palaceData.hachimon);
    }
    expect(screen.getByText('この時間の最良方位')).toBeTruthy();
    expect(cells.filter((c) => c.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('最良（王冠）と、選んでいる方位（金の枠）は別のもの。別の方位を選んでも王冠は動かない', () => {
    open();
    const group = screen.getByRole('group', { name: '8方位から選ぶ' });
    const best = slot.rankings[0];
    const other = slot.rankings[1];
    const cellOf = (item) => within(group).getAllByRole('button').find((c) => c.getAttribute('aria-label').startsWith(`${item.label} `));

    expect(cellOf(best).querySelector('.tsl-crown')).toBeTruthy();
    expect(cellOf(best).className).toContain('is-selected');

    fireEvent.click(cellOf(other));
    expect(cellOf(best).querySelector('.tsl-crown')).toBeTruthy();
    expect(cellOf(best).className).not.toContain('is-selected');
    expect(cellOf(other).className).toContain('is-selected');
    expect(cellOf(other).querySelector('.tsl-crown')).toBe(null);
    expect(group.querySelectorAll('.tsl-crown')).toHaveLength(1);
    expect(screen.getByText('選んでいる方位')).toBeTruthy();
  });

  it('地図のボタンは選んだ方位の名前になり、その時間と方位を渡す。盤の詳細は補助', () => {
    const { onGoMap, onOpenBoard } = open();
    const group = screen.getByRole('group', { name: '8方位から選ぶ' });
    const other = slot.rankings[1];
    fireEvent.click(within(group).getAllByRole('button').find((c) => c.getAttribute('aria-label').startsWith(`${other.label} `)));

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${other.label}の場所を地図で探す`) }));
    expect(onGoMap).toHaveBeenCalledWith({ hour: slot.hour, palace: other.palace });

    fireEvent.click(screen.getByRole('button', { name: /盤の詳細を見る/ }));
    expect(onOpenBoard).toHaveBeenCalledWith(slot.hour);
  });

  it('もう一度押すと閉じる。別の時間帯を開くと前のは閉じる', () => {
    open();
    expect(screen.getAllByRole('group', { name: '8方位から選ぶ' })).toHaveLength(1);
    const another = timeline.find((s) => s.hour !== slot.hour);
    fireEvent.click(screen.getAllByRole('button').find((b) => b.className.includes('tsl-row') && b.textContent.includes(another.label)));
    expect(screen.getAllByRole('group', { name: '8方位から選ぶ' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByRole('group', { name: '8方位から選ぶ' })).toBe(null);
  });
});

describe('選んだ方位の短い説明', () => {
  it('八門の説明（解説と同じ文言）を、名前と使い道に分ける', () => {
    expect(gateSummary('開門')).toEqual({ label: '物事の入口を開く門', use: '新しい開始や公の手続き' });
    expect(gateSummary('存在しない門')).toEqual({ label: '', use: '' });
  });

  it('吉は門の使い道とタグ、凶は「避けたい方位」。拒否権があれば注意を添える', () => {
    const good = directionSummary({ score: 70, palaceData: { hachimon: '休門' }, vetoes: [] });
    expect(good.lines).toEqual(['和やかさをもたらす門が入る方位です。', '休息・仲直り・縁談に向きます。']);
    expect(good.tags).toEqual(['休息', '仲直り', '縁談']);

    const bad = directionSummary({ score: -40, palaceData: { hachimon: '死門' }, vetoes: [] });
    expect(bad.lines).toEqual(['この時間は、避けたい方位です。']);
    expect(bad.tags).toEqual([]);

    const veto = directionSummary({ score: 30, palaceData: { hachimon: '生門' }, vetoes: ['空亡'] });
    expect(veto.lines.at(-1)).toContain('注意条件あり（空亡）');
  });

  it('効果を言い切らない', () => {
    const texts = ['開門', '休門', '生門', '景門', '杜門', '傷門', '驚門', '死門']
      .flatMap((gate) => directionSummary({ score: 50, palaceData: { hachimon: gate }, vetoes: [] }).lines);
    expect(texts.filter((t) => /必ず|絶対|運が上が|叶う/u.test(t))).toEqual([]);
  });
});
