/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BottomSheet, { getBadge, summarizeAxes } from './BottomSheet.jsx';
import { computeAxisRanks } from '../reverseDirection/FusionCard.jsx';

const KNOWN_KEY = '陰1局丁卯';

function mockFetch({ me }) {
  const calls = [];
  global.fetch = vi.fn(async (url) => {
    const href = String(url);
    calls.push(href);
    if (href === '/api/auth/me') return { ok: true, status: 200, json: async () => me };
    if (href.startsWith('/api/kaisetsu-full?')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ palaces: { kan: { goen: { mid: 'ご縁のmid解説です。' }, shigoto: { mid: '仕事のmid解説です。' } } } }),
      };
    }
    if (href.startsWith('/api/kaisetsu?')) {
      return { ok: true, status: 200, json: async () => ({ palaces: { kan: { goen: { short: 'ご縁のshort解説。' } } } }) };
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  return calls;
}

function makePalace(overrides = {}) {
  return {
    key: 'kan',
    label: '坎',
    direction: '北',
    data: {
      hachimon: '休門',
      hasshin: '六合',
      kyusei: '天蓬',
      tenban: '乙',
      chiban: '丙',
    },
    score: {
      score: 70,
      breakdown: {
        tenban_kan: 10,
        hachimon: 40,
        hasshin: 20,
        jukkan_kokuou: -10,
        kakkyoku: 10,
      },
      detected_jukkan: [
        { name: '月奇孛師', kikkyo: '凶', tenban: '乙', chiban: '丙' },
      ],
      detected_kakkyoku: [
        { name: '天遁', kichi_kyo: 'kichi', score: 10, meaning: '吉格' },
      ],
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete global.fetch;
});

describe('BottomSheet', () => {
  it('宮データを渡すとレンダリングされる', () => {
    const { container } = render(<BottomSheet palace={makePalace()} onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: '坎の詳細' })).toBeTruthy();
    expect(container.firstChild).toBe(null);
    expect(document.body.querySelector('.sheet-overlay.open')).toBeTruthy();
    expect(document.body.querySelector('.sheet.open')).toBeTruthy();
    expect(document.body.querySelector('.sheet-content')).toBeTruthy();
    expect(screen.getByText('坎（北）')).toBeTruthy();
    expect(screen.getAllByText('+70').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('大吉')).toBeTruthy();
    expect(screen.getByText('休門・六合・天蓬')).toBeTruthy();
    expect(screen.getByText('天盤乙 / 地盤丙')).toBeTruthy();
  });

  it('宮データが null の時はレンダリングされない', () => {
    const { container } = render(<BottomSheet palace={null} onClose={() => {}} />);

    expect(container.firstChild).toBe(null);
  });

  it('オーバーレイクリックで onClose を呼ぶ', () => {
    const onClose = vi.fn();
    render(<BottomSheet palace={makePalace()} onClose={onClose} />);

    fireEvent.click(document.body.querySelector('.sheet-overlay'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ハンドルクリックで onClose を呼ぶ', () => {
    const onClose = vi.fn();
    render(<BottomSheet palace={makePalace()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('×ボタンは常に1つだけ出る', () => {
    render(<BottomSheet palace={makePalace()} onClose={() => {}} />);

    expect(screen.getAllByRole('button', { name: '閉じる' })).toHaveLength(1);
  });

  it('前の方位・次の方位のボタンで隣の方位へ移る', () => {
    const onNavigate = vi.fn();
    render(
      <BottomSheet
        palace={makePalace()}
        onClose={() => {}}
        prev={{ key: 'ken', direction: '北西' }}
        next={{ key: 'gon', direction: '北東' }}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '次の方位（北東）' }));
    fireEvent.click(screen.getByRole('button', { name: '前の方位（北西）' }));

    expect(onNavigate.mock.calls).toEqual([['gon'], ['ken']]);
  });

  it('格局がある宮では格局カードが表示される', () => {
    render(<BottomSheet palace={makePalace()} onClose={() => {}} />);

    expect(document.body.querySelector('.kakkyoku-card')).toBeTruthy();
    expect(document.body.querySelector('.kakkyoku-card .study-name').textContent).toBe('天遁');
    expect(screen.getAllByText(/天盤の丙/).length).toBeGreaterThanOrEqual(1);
  });

  it('2つの層に分ける: 「この方位をどう使う？」が先、「この盤から学ぶ」が後', () => {
    render(<BottomSheet palace={makePalace()} onClose={() => {}} />);
    const sections = [...document.body.querySelectorAll('.ds-section')].map((el) => el.getAttribute('aria-label'));
    expect(sections).toEqual(['この方位をどう使う？', 'この盤から学ぶ']);
    // 結論（点数・吉凶・ひとこと）は上の層、格局と配置は下の層
    const use = document.body.querySelector('.ds-use');
    const learn = document.body.querySelector('.ds-learn');
    expect(use.textContent).toContain('+70');
    expect(use.textContent).toContain('積極的に使いたい方位');
    expect(use.querySelector('.kakkyoku-card')).toBe(null);
    expect(learn.querySelectorAll('.kakkyoku-card')).toHaveLength(1);
    expect(learn.textContent).toContain('この方位には、格局が1つ出ています。');
    expect(learn.textContent).toContain('休門・六合・天蓬');
  });

  it('学習カードは「一般的な意味」と「今回の盤では」を分けて出す', () => {
    render(<BottomSheet palace={makePalace()} onClose={() => {}} />);
    const card = document.body.querySelector('.kakkyoku-card');
    // 閉じているあいだは、ひとことだけ
    expect(card.textContent).toContain('ひとことで');
    expect(card.querySelector('.study-block.is-here')).toBe(null);
    fireEvent.click(screen.getByRole('button', { name: '天遁をさらに詳しく' }));
    const labels = [...card.querySelectorAll('.study-label')].map((el) => el.textContent);
    expect(labels).toEqual(['ひとことで', '格局の意味', '成立する条件', '使い方の目安', '今回の盤では']);
    // 一般的な話（どの盤でも同じ）
    expect(card.textContent).toContain('天盤に丙、地盤に丁、八門が生門');
    expect(card.textContent).toContain('営業、人脈拡大、自己投資、視野を広げる学びに向く。');
    // 今回の盤だけの話は、別の枠に入れる
    const here = card.querySelector('.study-block.is-here').textContent;
    expect(here).toContain('この方位の配置は、天盤乙・地盤丙・休門・六合・天蓬です。');
    expect(here).not.toMatch(/点/u); // 要素ごとの点数は書かない
    expect(here).not.toContain('営業');
  });

  it('八門・九星・八神・天盤干も、同じ学習カードで出す', () => {
    render(<BottomSheet palace={makePalace()} onClose={() => {}} />);
    const kinds = [...document.body.querySelectorAll('.ds-learn .study-card:not(.kakkyoku-card)')].map((el) => el.dataset.kind);
    expect(kinds).toEqual(['八門', '九星', '八神', '天盤干']);
  });

  it('上のナビは、中央がいま見ている方位', () => {
    render(
      <BottomSheet
        palace={makePalace()}
        onClose={() => {}}
        prev={{ key: 'ken', direction: '北西' }}
        next={{ key: 'gon', direction: '北東' }}
        onNavigate={() => {}}
      />,
    );
    const nav = document.body.querySelector('.sheet-nav');
    expect([...nav.children].map((el) => el.textContent.replace(/[←→\s]/g, ''))).toEqual(['北西', '北坎', '北東']);
  });

  it('5テーマの結果を、ひとことにまとめる', () => {
    expect(summarizeAxes({ goen: '◎', shigoto: '×', kinun: '○', kenko: '×', benkyo: '△' })).toBe('向いているのは、ご縁・金運です。');
    expect(summarizeAxes({ goen: '×', shigoto: '×', kinun: '×', kenko: '△', benkyo: '△' })).toContain('健康運・勉強運の用事にとどめます');
    expect(summarizeAxes({ goen: '×', shigoto: '×', kinun: '×', kenko: '×', benkyo: '×' })).toContain('どのテーマにも向きません');
    expect(summarizeAxes(null)).toBe('');
  });

  it('格局がない宮では格局カードが表示されない', () => {
    const palace = makePalace({
      score: {
        score: 10,
        breakdown: { hachimon: 20 },
        detected_kakkyoku: [],
      },
    });
    render(<BottomSheet palace={palace} onClose={() => {}} />);

    expect(document.body.querySelector('.kakkyoku-card')).toBe(null);
  });

  it('テーマのタブをクリックすると選択が切り替わる', () => {
    render(<BottomSheet palace={makePalace()} onClose={() => {}} />);

    const goen = screen.getByRole('tab', { name: /ご縁/ });
    const shigoto = screen.getByRole('tab', { name: /仕事/ });

    expect(goen.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(shigoto);
    expect(shigoto.getAttribute('aria-selected')).toBe('true');
    expect(goen.getAttribute('aria-selected')).toBe('false');
  });

  it('5テーマの◎○×は吉方位タブと同じ classifyPalace の軸ランク（タブと一体で二重表示しない）', () => {
    mockFetch({ me: { loggedIn: false } });
    render(<BottomSheet palace={makePalace()} kaisetsuKey={KNOWN_KEY} onClose={() => {}} />);

    const expected = computeAxisRanks(KNOWN_KEY, 'kan');
    const symbols = [...document.body.querySelectorAll('.axis-btn .axis-symbol')].map((node) => node.textContent);
    expect(symbols).toEqual(['goen', 'shigoto', 'kinun', 'kenko', 'benkyo'].map((k) => expected[k]));
    expect(document.body.querySelector('.axis-compare-card')).toBe(null);
  });

  it('全機能を使える人には kaisetsu-full の軸別 mid 本文を表示する', async () => {
    mockFetch({ me: { loggedIn: true, email: 'a@example.com', status: 'free', full: true } });

    render(<BottomSheet palace={makePalace()} kaisetsuKey={KNOWN_KEY} onClose={() => {}} />);

    expect(await screen.findByText('ご縁のmid解説です。')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /仕事/ }));
    expect(screen.getByText('仕事のmid解説です。')).toBeTruthy();
  });

  it('未ログインではエラーにせず、短い解説＋ログインの案内を出す（kaisetsu-full は呼ばない）', async () => {
    const calls = mockFetch({ me: { loggedIn: false } });
    const onOpenAccountSettings = vi.fn();

    render(
      <BottomSheet palace={makePalace()} kaisetsuKey={KNOWN_KEY} onClose={() => {}} onOpenAccountSettings={onOpenAccountSettings} />,
    );

    expect(await screen.findByText('ご縁のshort解説。')).toBeTruthy();
    expect(screen.getByText('ログインすると、ベータ期間中は全機能を無料で使えます。')).toBeTruthy();
    expect(screen.queryByText(/表示できませんでした/)).toBe(null);
    expect(calls.some((url) => url.startsWith('/api/kaisetsu-full'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'ログインする' }));
    expect(onOpenAccountSettings).toHaveBeenCalledTimes(1);
  });

  it('点数は総合点だけ。要素ごとの点数の内訳は出さない', () => {
    render(<BottomSheet palace={makePalace()} onClose={() => {}} />);
    expect(screen.getAllByText('+70').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: '評価の解説' })).toBe(null);
    expect(document.body.querySelector('.why-detail')).toBe(null);
    expect(screen.queryByText('+40')).toBe(null);
    expect(screen.queryByText('総合評価')).toBe(null);
    // 学習カードを全部開いても、要素ごとの点数は出ない
    for (const toggle of document.body.querySelectorAll('.study-toggle')) fireEvent.click(toggle);
    expect(document.body.querySelector('.ds-learn').textContent).not.toMatch(/[+−-]\d+点|点数/u);
  });

  it('格局は全件カードで出し、仮置きの「墨絵」は出さない', () => {
    const palace = makePalace();
    palace.score.detected_kakkyoku = [
      { name: '天遁', kichi_kyo: 'kichi', score: 10 },
      { name: '天網四張', kichi_kyo: 'kyo', score: -10 },
    ];
    render(<BottomSheet palace={palace} onClose={() => {}} />);
    expect(document.body.querySelectorAll('.kakkyoku-card')).toHaveLength(2);
    expect(screen.queryByText('墨絵')).toBe(null);
  });

  it('吉凶バッジは吉方位タブと同じ基準（+10 は「吉」）', () => {
    expect(getBadge(10).label).toBe('吉');
    expect(getBadge(40).label).toBe('大吉');
    expect(getBadge(0).label).toBe('中立');
    expect(getBadge(-5).label).toBe('凶');
  });
});
