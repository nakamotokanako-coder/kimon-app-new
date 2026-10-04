/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomeView, { computeNowBest } from './HomeView.jsx';
import SearchHub, { SEARCH_ENTRIES } from './SearchHub.jsx';
import { buildReverseBoard, getTimeSlotHour } from '../reverseDirection/reverseDirection.js';
import { getBoardDate } from '../utils/boardDate.js';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

function renderHome(props = {}) {
  const handlers = {
    onGoMap: vi.fn(),
    onGoSearch: vi.fn(),
    onOpenBoard: vi.fn(),
    onOpenGuide: vi.fn(),
    onLogin: vi.fn(),
    onOpenNotifications: vi.fn(),
  };
  render(<HomeView isActive limited={false} {...handlers} {...props} />);
  return handlers;
}

describe('ホーム画面', () => {
  it('「今から使える吉方位」は、今の時盤で一番点数の高い方位（吉方位タブと同じ計算）', () => {
    const now = new Date();
    const { slotHour, best } = computeNowBest(now, 139.7671);
    const { rankings } = buildReverseBoard({ date: getBoardDate(), hour: slotHour });
    expect(best).toEqual(rankings[0]);
    expect(rankings.every((r) => r.score <= best.score)).toBe(true);
    // 東京（東経139.77度）は自然時補正が+19分
    expect(slotHour).toBe(getTimeSlotHour(new Date(now.getTime() + 19 * 60 * 1000)));
  });

  it('4つの入口は、使い方の言葉で書かれ、それぞれの画面へ進む', () => {
    const h = renderHome();
    fireEvent.click(screen.getByRole('button', { name: /今から吉方位へ/ }));
    fireEvent.click(screen.getByRole('button', { name: /次の休み、どこへ行く？/ }));
    fireEvent.click(screen.getByRole('button', { name: /行きたい方位のベストな日/ }));
    fireEvent.click(screen.getByRole('button', { name: /条件から探す/ }));
    expect(h.onGoMap.mock.calls).toEqual([['time'], ['day']]);
    expect(h.onGoSearch.mock.calls).toEqual([['ranking'], [null]]);
  });

  it('専門の名前も小さく残す（プロが何の盤か分かるように）', () => {
    renderHome();
    expect(screen.getByText('時盤 × 地図')).toBeTruthy();
    expect(screen.getByText('日盤 × 地図')).toBeTruthy();
    expect(screen.getByText('格局・三盤ルート')).toBeTruthy();
  });

  it('未ログインの人は、地図・検索の入口からログインへ進む（盤は見られる）', () => {
    const h = renderHome({ limited: true });
    fireEvent.click(screen.getByRole('button', { name: /ログインして地図で探す/ }));
    fireEvent.click(screen.getByRole('button', { name: /今から吉方位へ/ }));
    expect(h.onLogin).toHaveBeenCalledTimes(2);
    expect(h.onGoMap).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '盤で見る' }));
    expect(h.onOpenBoard).toHaveBeenCalledTimes(1);
    expect(h.onOpenBoard.mock.calls[0][0]).toMatchObject({ boardType: '時' });
  });

  it('保存した基準点の名前を出す。無ければ東京', () => {
    renderHome();
    expect(screen.getByText('東京')).toBeTruthy();
    cleanup();
    window.localStorage.setItem('kimon_go_base_point_v1', JSON.stringify({ mode: 'search', location: { name: '大阪駅', latitude: 34.7, longitude: 135.5 } }));
    renderHome();
    expect(screen.getByText('大阪駅')).toBeTruthy();
  });

  it('効果をうたう表現を書かない', () => {
    const { container } = render(<HomeView isActive limited={false} onGoMap={() => {}} onGoSearch={() => {}} onOpenBoard={() => {}} onOpenGuide={() => {}} onLogin={() => {}} />);
    expect(container.textContent).not.toMatch(/運が上が|開運|必ず|絶対|叶う/u);
  });
});

describe('探すの入口', () => {
  it('利用者の質問から選べる4つの入口と、専門の名前', () => {
    expect(SEARCH_ENTRIES.map((e) => [e.title, e.question, e.tech])).toEqual([
      ['日付から探す', 'この日、どちらへ行く？', '日盤・遠出'],
      ['吉日・吉方位を探す', 'いつ、どの方位へ行くのがいい？', '日盤ランキング'],
      ['条件から探す', 'この条件が出るのはいつ？', '格局検索'],
      ['吉を3回つなぐ', '1日で、吉方位を連続で取る', '奇門三盤ルート'],
    ]);
  });

  it('選ぶと、行き先（地図か検索か）と画面の種類が渡る', () => {
    const onSelect = vi.fn();
    render(<SearchHub onSelect={onSelect} onOpenGuide={() => {}} onOpenNotifications={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /日付から探す/ }));
    fireEvent.click(screen.getByRole('button', { name: /吉を3回つなぐ/ }));
    fireEvent.click(screen.getByRole('button', { name: /今日の時間帯から探す/ }));
    expect(onSelect.mock.calls.map(([e]) => [e.target, e.key])).toEqual([
      ['map', 'day'],
      ['search', 'range'],
      ['search', 'timeRanking'],
    ]);
  });
});
