/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FavoritesStrip from './FavoritesStrip.jsx';
import { getFanColor } from './mapFan.js';

afterEach(() => {
  cleanup();
});

// jsdomはインラインstyleのhex色を rgb(...) 表記へ正規化して読み返すため、
// getFanColor()のhex値と比較するときは同じ正規化を通す。
function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function makeChip(overrides = {}) {
  return {
    name: 'テスト神社',
    latitude: 35.7,
    longitude: 139.7,
    distanceM: 1200,
    direction: { palace: 'kan', label: '北', score: 30, tone: 'good' },
    ...overrides,
  };
}

describe('FavoritesStrip（PR-2.6）', () => {
  it('件数見出し・カードを描画し、方位ピル/点数の色は getFanColor(tone) をそのまま使う', () => {
    const chips = [makeChip()];
    render(<FavoritesStrip chips={chips} focusedKey="" onFocusKey={() => {}} onShowAll={() => {}} />);

    expect(screen.getByText('お気に入り（1）')).toBeTruthy();
    expect(screen.getByText('テスト神社')).toBeTruthy();
    expect(screen.getByText('+30')).toBeTruthy();

    const pill = document.querySelector('.fav-dir-pill');
    expect(pill.style.background).toBe(hexToRgb(getFanColor('good')));
  });

  it('空のときは案内文を出す', () => {
    render(<FavoritesStrip chips={[]} focusedKey="" onFocusKey={() => {}} onShowAll={() => {}} />);
    expect(screen.getByText('地図で見つけた場所をお気に入りに追加すると、ここに表示されます。')).toBeTruthy();
  });

  it('カードをタップすると選択状態（is-selected）が変わり、onFocusKeyが呼ばれる', () => {
    const chips = [makeChip({ name: 'A' }), makeChip({ name: 'B', latitude: 35.8, longitude: 139.8 })];
    const onFocusKey = vi.fn();
    const { rerender } = render(
      <FavoritesStrip chips={chips} focusedKey="" onFocusKey={onFocusKey} onShowAll={() => {}} />,
    );

    const cardA = screen.getByText('A').closest('.fav-card');
    expect(cardA.className).not.toContain('is-selected');

    fireEvent.click(cardA);
    expect(onFocusKey).toHaveBeenCalledTimes(1);
    const calledKey = onFocusKey.mock.calls[0][0];

    // 呼ばれたkeyを親から折り返す想定を模して再レンダリングし、選択状態を確認する。
    rerender(
      <FavoritesStrip chips={chips} focusedKey={calledKey} onFocusKey={onFocusKey} onShowAll={() => {}} />,
    );
    expect(screen.getByText('A').closest('.fav-card').className).toContain('is-selected');
    expect(screen.getByText('B').closest('.fav-card').className).not.toContain('is-selected');
  });

  it('「すべて見る」タップで onShowAll が呼ばれる', () => {
    const onShowAll = vi.fn();
    render(<FavoritesStrip chips={[makeChip()]} focusedKey="" onFocusKey={() => {}} onShowAll={onShowAll} />);
    fireEvent.click(screen.getByText('すべて見る ›'));
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });
});
