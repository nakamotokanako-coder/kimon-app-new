/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ReverseDirectionView from './ReverseDirectionView.jsx';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('ReverseDirectionView 日盤遠出（PR-D1: 骨格掃除）', () => {
  it('日盤遠出タブでは「はじめての方へ」帯・「② 行き先を探す」ラベルを表示しない', () => {
    render(
      <ReverseDirectionView
        isActive
        onOpenBoard={() => {}}
        onOpenNotifications={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '日盤 遠出' }));

    expect(screen.queryByText(/はじめての方へ/)).toBe(null);
    expect(screen.queryByText('② 行き先を探す')).toBe(null);
    expect(screen.queryByText('まず①で出発点を決めてください')).toBe(null);
    expect(document.querySelector('.reverse-go-guide')).toBe(null);
    expect(document.querySelector('.reverse-step-title')).toBe(null);
  });
});

describe('ReverseDirectionView 日盤遠出のGOゾーン統合（PR-D2）', () => {
  it('日盤遠出には「地図で探す/お気に入り」タブスイッチャーが存在しない（地図常時表示）', () => {
    render(
      <ReverseDirectionView
        isActive
        onOpenBoard={() => {}}
        onOpenNotifications={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '日盤 遠出' }));

    expect(screen.queryByText('地図で探す')).toBe(null);
    expect(screen.queryByRole('button', { name: 'お気に入り' })).toBe(null);
    expect(document.querySelector('.reverse-go-tabs')).toBe(null);
    expect(screen.queryByText(/気になる場所のピンをタップすると/)).toBe(null);
    expect(document.querySelector('.direction-map')).toBeTruthy();
  });

  it('日盤遠出でFavoritesStrip（お気に入りストリップ）が表示される', () => {
    render(
      <ReverseDirectionView
        isActive
        onOpenBoard={() => {}}
        onOpenNotifications={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '日盤 遠出' }));

    expect(document.querySelector('.fav-strip')).toBeTruthy();
    expect(screen.getByText(/お気に入り（/)).toBeTruthy();
  });

  it('日盤遠出で50kmキャプション・距離レジェンドが残っている（退行防止）', () => {
    render(
      <ReverseDirectionView
        isActive
        onOpenBoard={() => {}}
        onOpenNotifications={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '日盤 遠出' }));

    expect(document.querySelector('.direction-map-caption')).toBeTruthy();
    expect(document.body.textContent).toContain('50km以上＋3時間滞在で効果');
    expect(document.querySelector('.direction-scale-card')).toBeTruthy();
    expect(document.body.textContent).toContain('日盤の距離：内が薄い → 外が濃い');
  });
});
