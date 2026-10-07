/* @vitest-environment jsdom */
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FusionCard, { computeAxisRanks, dateCapNote, splitMid } from './FusionCard.jsx';

// selAxis は親からの controlled props（PR-5・L3ボトムシート）。
// 軸切替を試すテストはこの薄いラッパーでstateを持たせる。
function ControlledFusionCard({ initialAxis = 'goen', ...props }) {
  const [axis, setAxis] = useState(initialAxis);
  return <FusionCard {...props} selAxis={axis} onAxisChange={setAxis} />;
}

// 実在する局key（KaisetsuPanel.test.jsx / kaisetsuApi.test.js と同じ既知キー）。
const KNOWN_KEY = '陰1局丁卯';
// classifyPalace(KNOWN_KEY, 'kan').axisRanks は全部 ▲（傷門で総合点がマイナスのため。docs/axis_score_alignment_v2.md）
// classifyPalace(KNOWN_KEY, 'kun').axisRanks === { goen:'△', shigoto:'◎', kinun:'◎', kenko:'○', benkyo:'△' }（総合 +90）
const BEST = {
  palace: 'kan',
  label: '北',
  short: 'N',
  score: 30,
  reasons: ['開門', '直符'],
  palaceData: { hachimon: '開門', hasshin: '直符', kyusei: '天輔', tenban: '乙', chiban: '丁' },
  palaceScore: {
    score: 30,
    breakdown: { hachimon: 30, kyusei: 10, ban_level_minus: -10 },
    detected_kakkyoku: [],
    detected_jukkan: [],
  },
};

const SHORT_TEXT = 'short api text';
const MID_TEXT_GOEN = 'ご縁の短文リード。ご縁の本文がここに続く。';
const MID_TEXT_KENKO = '健康の短文リード。健康の本文がここに続く。';

function palacesFor(entries) {
  return { kan: entries };
}

function mockFetchAuth(authBody, { fullStatus = 200, fullThrows = false } = {}) {
  const calls = [];
  global.fetch = vi.fn(async (url) => {
    const href = String(url);
    calls.push(href);
    if (href === '/api/auth/me') {
      return { ok: true, json: async () => authBody };
    }
    if (href.startsWith('/api/kaisetsu?')) {
      return {
        ok: true,
        json: async () => ({
          key: KNOWN_KEY,
          version: 'test',
          palaces: palacesFor({ goen: { short: SHORT_TEXT } }),
        }),
      };
    }
    if (href.startsWith('/api/kaisetsu-full?')) {
      if (fullThrows) throw new Error('network_error');
      if (fullStatus === 403) {
        return { ok: false, status: 403, json: async () => ({ error: 'forbidden' }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          key: KNOWN_KEY,
          version: 'test',
          palaces: palacesFor({
            goen: { short: SHORT_TEXT, mid: MID_TEXT_GOEN, full: 'full goen' },
            kenko: { short: SHORT_TEXT, mid: MID_TEXT_KENKO, full: 'full kenko' },
          }),
        }),
      };
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  return calls;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete global.fetch;
});

describe('computeAxisRanks', () => {
  it('既知キー・宮で classifyPalace の axisRanks をそのまま返す', () => {
    expect(computeAxisRanks(KNOWN_KEY, 'kan')).toEqual({
      goen: '▲', shigoto: '▲', kinun: '▲', kenko: '▲', benkyo: '▲',
    });
    expect(computeAxisRanks(KNOWN_KEY, 'kun')).toEqual({
      goen: '△', shigoto: '◎', kinun: '◎', kenko: '○', benkyo: '△',
    });
  });
  it('その日時の総合点を渡すと、日付で決まる凶の分まで上限を掛ける', () => {
    // 総合点が +90 のままなら変わらない
    expect(computeAxisRanks(KNOWN_KEY, 'kun', { score: 90, detected_kakkyoku: [] }).shigoto).toBe('◎');
    expect(dateCapNote(KNOWN_KEY, 'kun', { score: 90, detected_kakkyoku: [] })).toBe('');
    // 日格などで +30 に下がった日は ○ まで
    expect(computeAxisRanks(KNOWN_KEY, 'kun', { score: 30, detected_kakkyoku: [] })).toEqual({
      goen: '△', shigoto: '○', kinun: '○', kenko: '○', benkyo: '△',
    });
    // マイナスまで下がった日は ▲ まで。解説の文より低く出していることを一言添える
    expect(computeAxisRanks(KNOWN_KEY, 'kun', { score: -10, detected_kakkyoku: [] })).toEqual({
      goen: '▲', shigoto: '▲', kinun: '▲', kenko: '▲', benkyo: '▲',
    });
    expect(dateCapNote(KNOWN_KEY, 'kun', { score: -10, detected_kakkyoku: [] })).toContain('この日時だけの凶');
    // 三大凶格が付いた日は点数にかかわらず ▲ まで
    expect(computeAxisRanks(KNOWN_KEY, 'kun', { score: 90, detected_kakkyoku: [{ name: '飛宮格' }] }).shigoto).toBe('▲');
    // 点数が上がる分（順利の+20）では、解説より上げない
    expect(computeAxisRanks(KNOWN_KEY, 'kan', { score: 60, detected_kakkyoku: [] }).goen).toBe('▲');
    expect(dateCapNote(KNOWN_KEY, 'kan', { score: 60, detected_kakkyoku: [] })).toBe('');
  });
  it('不正キーでも例外を投げず null', () => {
    expect(computeAxisRanks('存在しない局', 'kan')).toBe(null);
    expect(computeAxisRanks('', 'kan')).toBe(null);
    expect(computeAxisRanks(KNOWN_KEY, null)).toBe(null);
  });
});

describe('splitMid', () => {
  it('1文目をリード・2文目以降を本文に分割する', () => {
    expect(splitMid('ご縁の短文リード。ご縁の本文がここに続く。')).toEqual({
      lead: 'ご縁の短文リード。',
      body: 'ご縁の本文がここに続く。',
    });
  });
  it('文が無ければリードのみ・本文は空文字', () => {
    expect(splitMid('句点なしの一文')).toEqual({ lead: '句点なしの一文', body: '' });
  });
  it('空/undefinedでも例外を投げない', () => {
    expect(splitMid('')).toEqual({ lead: '', body: '' });
    expect(splitMid(undefined)).toEqual({ lead: '', body: '' });
  });
});

describe('FusionCard 軸切替（paid）', () => {
  it('デフォルトはご縁。軸チップのランク記号は classifyPalace 由来で表示される', async () => {
    mockFetchAuth({ loggedIn: true, email: 'paid@example.com', status: 'paid' });
    render(<FusionCard best={BEST} boardKey={KNOWN_KEY} selAxis="goen" />);

    await screen.findByText(MID_TEXT_GOEN.split('。')[0] + '。');
    const chips = screen.getAllByRole('tab');
    const goenChip = chips.find((el) => el.textContent.includes('ご縁'));
    const kenkoChip = chips.find((el) => el.textContent.includes('健康'));
    expect(goenChip.textContent).toContain('▲');
    expect(kenkoChip.textContent).toContain('▲');
    expect(goenChip.getAttribute('aria-selected')).toBe('true');
  });

  it('軸チップをクリックするとランク記号・リード・本文が連動して切り替わる', async () => {
    mockFetchAuth({ loggedIn: true, email: 'paid@example.com', status: 'paid' });
    render(<ControlledFusionCard best={BEST} boardKey={KNOWN_KEY} />);

    await screen.findByText('ご縁の短文リード。');
    const kenkoChip = screen.getAllByRole('tab').find((el) => el.textContent.includes('健康'));
    fireEvent.click(kenkoChip);

    await screen.findByText('健康の短文リード。');
    expect(screen.getByText('健康の本文がここに続く。')).toBeTruthy();
    expect(kenkoChip.getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText('ご縁の短文リード。')).toBe(null);
  });
});

describe('FusionCard フォールバック', () => {
  it('未ログインでは kaisetsu-full をfetchせず、short をリードに・本文位置は軽いCTAにする', async () => {
    const calls = mockFetchAuth({ loggedIn: false });
    render(<FusionCard best={BEST} boardKey={KNOWN_KEY} selAxis="goen" />);

    await screen.findByText(SHORT_TEXT);

    expect(calls.some((url) => url.startsWith('/api/kaisetsu-full?'))).toBe(false);
    expect(document.body.textContent).not.toContain(MID_TEXT_GOEN);
    expect(document.body.textContent).toContain('ログインすると、ベータ期間中は全機能を無料で使えます。');
  });

  it('paid中のfull取得失敗ではクラッシュせず「読み込みに失敗しました」を表示する', async () => {
    mockFetchAuth({ loggedIn: true, email: 'paid@example.com', status: 'paid' }, { fullThrows: true });
    render(<FusionCard best={BEST} boardKey={KNOWN_KEY} selAxis="goen" />);

    await screen.findByText('読み込みに失敗しました');
  });

  it('paid中に403を受けてもクラッシュしない', async () => {
    mockFetchAuth({ loggedIn: true, email: 'paid@example.com', status: 'paid' }, { fullStatus: 403 });
    render(<FusionCard best={BEST} boardKey={KNOWN_KEY} selAxis="goen" />);

    await screen.findByText(SHORT_TEXT);
  });

  it('best が無くてもクラッシュせず、何も出さない', () => {
    mockFetchAuth({ loggedIn: false });
    const { container } = render(<FusionCard best={null} boardKey={KNOWN_KEY} selAxis="goen" />);
    expect(container.textContent).toBe('');
  });
});

describe('FusionCard → L3ボトムシート（PR-5）', () => {
  it('「方位の詳しい解説」でL3シートが開き、スクリムタップで閉じる', async () => {
    mockFetchAuth({ loggedIn: false });
    render(<FusionCard best={BEST} boardKey={KNOWN_KEY} selAxis="goen" />);

    await screen.findByText(SHORT_TEXT);
    expect(screen.queryByRole('dialog')).toBe(null);

    fireEvent.click(screen.getByRole('button', { name: '方位の詳しい解説 ›' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();

    fireEvent.click(document.querySelector('.l3-overlay'));
    expect(screen.queryByRole('dialog')).toBe(null);
  });

  it('L3内で軸チップを押すとL2側の選択軸も連動する', async () => {
    mockFetchAuth({ loggedIn: true, email: 'paid@example.com', status: 'paid' });
    render(<ControlledFusionCard best={BEST} boardKey={KNOWN_KEY} />);

    await screen.findByText('ご縁の短文リード。');
    fireEvent.click(screen.getByRole('button', { name: '方位の詳しい解説 ›' }));
    const dialog = await screen.findByRole('dialog');

    const kenkoChipInSheet = within(dialog).getAllByRole('tab').find((el) => el.textContent.includes('健康'));
    fireEvent.click(kenkoChipInSheet);

    await screen.findByText('健康の短文リード。');
    const kenkoChipInCard = screen.getAllByRole('tab').find((el) => el.closest('.l3-sheet') === null && el.textContent.includes('健康'));
    expect(kenkoChipInCard.getAttribute('aria-selected')).toBe('true');
  });

  it('anon時はL3にも short と「ログインすると続きが読めます。」が出る', async () => {
    mockFetchAuth({ loggedIn: false });
    render(<FusionCard best={BEST} boardKey={KNOWN_KEY} selAxis="goen" />);

    await screen.findByText(SHORT_TEXT);
    fireEvent.click(screen.getByRole('button', { name: '方位の詳しい解説 ›' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getAllByText(SHORT_TEXT).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('ログインすると、ベータ期間中は全機能を無料で使えます。')).toBeTruthy();
  });

  it('詳しい画面に、点数の内訳は出さない（総合点だけ）', async () => {
    mockFetchAuth({ loggedIn: false });
    render(<FusionCard best={BEST} boardKey={KNOWN_KEY} selAxis="goen" />);

    await screen.findByText(SHORT_TEXT);
    fireEvent.click(screen.getByRole('button', { name: '方位の詳しい解説 ›' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('評価の解説')).toBe(null);
    expect(dialog.querySelector('.l3-why-detail')).toBe(null);
    expect(within(dialog).queryByText('総合評価')).toBe(null);
  });
});
