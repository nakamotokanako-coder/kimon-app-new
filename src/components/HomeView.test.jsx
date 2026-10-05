/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import HomeView, { ENTRIES, computeNowBest, gateLine } from './HomeView.jsx';
import SearchHub, { HUB_GROUPS, HUB_IMAGES, NOW_ENTRY, SEARCH_ENTRIES } from './SearchHub.jsx';
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

  it('入口は3つだけ（今から／次の休み／この方位はいつ）。それぞれの画面へ進む', () => {
    const h = renderHome();
    expect(ENTRIES.map((e) => e.title)).toEqual(['今から、どこ行く？', '次の休み、どこ行く？', 'この方位、いつ行く？']);
    fireEvent.click(screen.getByRole('button', { name: /今から、どこ行く？/ }));
    fireEvent.click(screen.getByRole('button', { name: /次の休み、どこ行く？/ }));
    fireEvent.click(screen.getByRole('button', { name: /この方位、いつ行く？/ }));
    fireEvent.click(screen.getByRole('button', { name: /詳しく探す/ }));
    expect(h.onGoMap.mock.calls).toEqual([['time'], ['day']]);
    expect(h.onGoSearch.mock.calls).toEqual([['ranking'], [null]]);
    fireEvent.click(screen.getByRole('button', { name: /使い方ガイド/ }));
    expect(h.onOpenGuide).toHaveBeenCalledTimes(1);
  });

  it('条件から探す・盤を指定して見る は、ホームに置かない（探すタブ・盤タブの役割）', () => {
    const { container } = render(<HomeView isActive limited={false} onGoMap={() => {}} onGoSearch={() => {}} onOpenBoard={() => {}} onOpenGuide={() => {}} onLogin={() => {}} />);
    expect(container.querySelectorAll('.home-pick')).toHaveLength(3);
    expect(container.textContent).not.toContain('条件から探す');
    expect(container.textContent).not.toContain('盤を指定して見る');
    expect(container.textContent).not.toContain('格局');
  });

  it('今日のお守りは細い帯。閉じているあいだは題だけ', () => {
    const { container } = render(<HomeView isActive limited={false} onGoMap={() => {}} onGoSearch={() => {}} onOpenBoard={() => {}} onOpenGuide={() => {}} onLogin={() => {}} />);
    expect(container.querySelector('.charm.is-compact .charm-bar-text').textContent).toBe('今日のお守り');
  });

  it('門のテーマは、名前だけ添える（効果は書かない）', () => {
    expect(gateLine({ palaceData: { hachimon: '開門' } })).toBe('開門｜仕事のテーマ');
    expect(gateLine({ palaceData: { hachimon: '死門' } })).toBe('死門');
    expect(gateLine({ palaceData: {} })).toBe('');
  });

  it('絵の画像は、置いてあるものだけを使う', () => {
    for (const src of [...ENTRIES.map((e) => e.image), '/hub/now.webp', ...Object.values(HUB_IMAGES), ...HUB_GROUPS.map((g) => g.divider), '/hub/guide.webp', '/hub/footer-mountains.webp', '/hub/footer-lotus.webp']) {
      expect(existsSync(`public${src}`), src).toBe(true);
    }
  });

  it('未ログインの人は、地図・検索の入口からログインへ進む（盤は見られる）', () => {
    const h = renderHome({ limited: true });
    fireEvent.click(screen.getByRole('button', { name: /ログインして地図で探す/ }));
    fireEvent.click(screen.getByRole('button', { name: /今から、どこ行く？/ }));
    fireEvent.click(screen.getByRole('button', { name: /詳しく探す/ }));
    expect(h.onLogin).toHaveBeenCalledTimes(3);
    expect(h.onGoMap).not.toHaveBeenCalled();
    expect(h.onGoSearch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '盤を見る' }));
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
  it('4つの検索を、優先順位で分ける（予定から探す／こだわって探す）。番号は付けない', () => {
    expect(SEARCH_ENTRIES.map((e) => [e.group, e.title, e.question, e.tech])).toEqual([
      ['plan', '行く日が決まっている', 'この日、どっちへ行く？', '日盤・遠出'],
      ['plan', '行く方位が決まっている', 'この方位、いつ行く？', '日盤ランキング'],
      ['detail', '条件から探す', 'この条件が出るのはいつ？', '格局検索'],
      ['detail', '吉を3回つなぐ', '1日で、吉方位を3回', '奇門三盤ルート'],
    ]);
    const { container } = render(<SearchHub onSelect={() => {}} onOpenGuide={() => {}} onOpenNotifications={() => {}} />);
    expect([...container.querySelectorAll('.hub-group-title')].map((h) => h.textContent)).toEqual(['予定から探す', 'こだわって探す']);
    expect(container.querySelectorAll('.hub-group.is-plan .hub-tile')).toHaveLength(2);
    expect(container.querySelectorAll('.hub-group.is-detail .hub-tile')).toHaveLength(2);
    expect(container.querySelector('.hub-no')).toBe(null);
    expect(container.querySelector('.hub-lead').textContent).toBe('どんな探し方をしますか？');
  });

  it('いちばん上は「今から吉方位へ」。その下に、予定から探す・こだわって探す・使い方ガイドの順', () => {
    const { container } = render(<SearchHub onSelect={() => {}} onOpenGuide={() => {}} onOpenNotifications={() => {}} />);
    const order = [...container.querySelectorAll('.search-hub > section, .search-hub > .hub-row')]
      .map((el) => el.getAttribute('aria-label') || el.querySelector('strong').textContent);
    expect(order).toEqual(['今から吉方位へ', '予定から探す', 'こだわって探す', '使い方ガイド']);
    expect(NOW_ENTRY).toMatchObject({ key: 'time', target: 'map', cta: '今から探す' });
  });

  it('選ぶと、行き先（地図か検索か）と画面の種類が渡る', () => {
    const onSelect = vi.fn();
    const onOpenGuide = vi.fn();
    render(<SearchHub onSelect={onSelect} onOpenGuide={onOpenGuide} onOpenNotifications={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /今から探す/ }));
    fireEvent.click(screen.getByRole('button', { name: /行く日が決まっている/ }));
    fireEvent.click(screen.getByRole('button', { name: /行く方位が決まっている/ }));
    fireEvent.click(screen.getByRole('button', { name: /条件から探す/ }));
    fireEvent.click(screen.getByRole('button', { name: /吉を3回つなぐ/ }));
    fireEvent.click(screen.getByRole('button', { name: /今日の時間帯を一覧で見る/ }));
    expect(onSelect.mock.calls.map(([e]) => [e.target, e.key])).toEqual([
      ['map', 'time'],
      ['map', 'day'],
      ['search', 'ranking'],
      ['search', 'kakkyoku'],
      ['search', 'range'],
      ['search', 'timeRanking'],
    ]);
    fireEvent.click(screen.getByRole('button', { name: /使い方ガイド/ }));
    expect(onOpenGuide).toHaveBeenCalledTimes(1);
  });

  it('効果を約束する言葉は使わない', () => {
    const { container } = render(<SearchHub onSelect={() => {}} onOpenGuide={() => {}} onOpenNotifications={() => {}} />);
    expect(container.textContent).not.toMatch(/運が上が|運をつな|開運|必ず|効果/u);
  });
});
