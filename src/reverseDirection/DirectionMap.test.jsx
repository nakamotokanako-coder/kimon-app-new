/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DirectionMap from './DirectionMap.jsx';

const LOCATION = { name: '東京駅', latitude: 35.681, longitude: 139.767 };
const RANKINGS = [
  { palace: 'kan', label: '北', short: 'N', angle: 0, score: 30, tone: 'good', reasons: [] },
];

afterEach(() => {
  cleanup();
});

describe('DirectionMap フルスクリーン検索UI折りたたみ（PR-2.5, jibanのみ）', () => {
  it('通常表示（非フルスクリーン）ではトグルボタンを出さず、検索カードをそのまま表示する', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );
    expect(screen.queryByRole('button', { name: '🔍 検索' })).toBe(null);
    expect(document.querySelector('.direction-map-search-row')).toBeTruthy();
  });

  it('jiban×フルスクリーンでは既定で検索UIが畳まれ、同じトグルボタンで開閉できる', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '⛶ 全画面' }));

    // 既定：畳まれている（検索フォームは描画されない・トグルボタンだけ）。
    expect(screen.getByRole('button', { name: '🔍 検索' })).toBeTruthy();
    expect(document.querySelector('.direction-map-search-row')).toBe(null);

    // トグルで展開（グリッド内に通常表示。absoluteオーバーレイは使わない）。
    fireEvent.click(screen.getByRole('button', { name: '🔍 検索' }));
    expect(document.querySelector('.direction-map-search-row')).toBeTruthy();

    // 同じボタン（ラベルが「検索を閉じる」に変わる）で再び畳める。
    fireEvent.click(screen.getByRole('button', { name: '🔍 検索を閉じる' }));
    expect(document.querySelector('.direction-map-search-row')).toBe(null);
  });

  it('nichiban（日盤遠出）のフルスクリーンでは従来どおり検索UIが常時展開のまま', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="nichiban"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '⛶ 全画面' }));

    expect(screen.queryByRole('button', { name: '🔍 検索' })).toBe(null);
    expect(document.querySelector('.direction-map-search-row')).toBeTruthy();
  });

  it('フルスクリーンを閉じてもう一度開くと、検索UIは再び畳まれた状態に戻る', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '⛶ 全画面' }));
    fireEvent.click(screen.getByRole('button', { name: '🔍 検索' }));
    expect(document.querySelector('.direction-map-search-row')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    fireEvent.click(screen.getByRole('button', { name: '⛶ 全画面' }));

    expect(document.querySelector('.direction-map-search-row')).toBe(null);
    expect(screen.getByRole('button', { name: '🔍 検索' })).toBeTruthy();
  });
});

describe('DirectionMap 検索ヒント文・キャプション（PR-2.5）', () => {
  it('検索したい時は地図を拡大…のヒント文は表示しない', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );
    expect(document.body.textContent).not.toContain('検索したい時は地図を拡大してください');
  });

  it('jiban（時盤お散歩）では「500m確定ライン」ヘッダー注記もキャプションも表示しない', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );
    expect(document.querySelector('.direction-map-note')).toBe(null);
    expect(document.querySelector('.direction-map-caption')).toBe(null);
    expect(document.body.textContent).not.toContain('500m 確定ライン');
    expect(document.body.textContent).not.toContain('外側は10kmまでフェード表示');
  });

  it('nichiban（日盤遠出）ではヘッダー注記・キャプションとも維持する', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="nichiban"
      />,
    );
    expect(document.querySelector('.direction-map-note')).toBeTruthy();
    expect(document.querySelector('.direction-map-caption')).toBeTruthy();
  });

  it('凡例（大吉/小吉/中立/凶）はjibanでも表示され続ける', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );
    expect(document.querySelector('.direction-map-legend')).toBeTruthy();
  });
});

describe('DirectionMap GOゾーン再構成（PR-2.6, jibanのみ）', () => {
  it('タブなしで地図と検索UIが同時にレンダリングされる（jiban・非フルスクリーン）', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );
    expect(document.querySelector('.direction-map')).toBeTruthy();
    expect(document.querySelector('.direction-map-search-row')).toBeTruthy();
    // タブ切替の痕跡（地図で探す/お気に入り）が無いこと。
    expect(screen.queryByText('地図で探す')).toBe(null);
    expect(screen.queryByText('お気に入り')).toBe(null);
  });

  it('jibanでは地図が .direction-map-stage でラップされ、全画面/現在地ボタン・凡例が地図上オーバーレイになる', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );
    const stage = document.querySelector('.direction-map-stage');
    expect(stage).toBeTruthy();
    expect(stage.querySelector('.direction-map')).toBeTruthy();
    expect(stage.querySelector('.direction-map-overlay-actions')).toBeTruthy();
    expect(stage.querySelector('.direction-map-legend--overlay')).toBeTruthy();
    // 通常のヘッダー行（旧位置の全画面/現在地ボタン）は出さない。
    expect(document.querySelector('.direction-map-header')).toBe(null);
  });

  it('nichibanは従来どおり通常のヘッダー行・凡例のまま（地図オーバーレイ化しない）', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="nichiban"
      />,
    );
    expect(document.querySelector('.direction-map-header')).toBeTruthy();
    expect(document.querySelector('.direction-map-stage')).toBe(null);
    expect(document.querySelector('.direction-map-overlay-actions')).toBe(null);
    expect(document.querySelector('.direction-map-legend--overlay')).toBe(null);
  });

  it('「吉方位だけ」がチップ列内の点線トグルとして機能する（フィルタ挙動は既存ロジックのまま）', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );
    const toggle = screen.getByRole('button', { name: '✓ 吉方位だけ' });
    expect(toggle.className).toContain('direction-map-chip-toggle');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.className).toContain('on');

    // 従来のチェックボックス版は出ない（置き場所だけ移した）。
    expect(document.querySelector('.direction-kichi-filter')).toBe(null);
  });

  it('nichibanは従来どおりチェックボックス版の「吉方位だけ」のまま', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="nichiban"
      />,
    );
    expect(document.querySelector('.direction-kichi-filter')).toBeTruthy();
    expect(document.querySelector('.direction-map-chip-toggle')).toBe(null);
  });

  it('showFavoritesSection=false ではお気に入りの従来リスト節を出さない（jibanの既定）', () => {
    const key = 'kimon_map_favorites_v1';
    window.localStorage.setItem(key, JSON.stringify([
      { name: 'テスト神社', latitude: 35.7, longitude: 139.7, kind: 'spot' },
    ]));
    try {
      render(
        <DirectionMap
          location={LOCATION}
          rankings={RANKINGS}
          bestPalace="kan"
          profileKey="jiban"
          showFavoritesSection={false}
        />,
      );
      expect(document.querySelector('.direction-place-panel')).toBe(null);
    } finally {
      window.localStorage.removeItem(key);
    }
  });

  it('showFavoritesSection=true では「すべて見る」相当で従来のお気に入りリスト節が見える', () => {
    const key = 'kimon_map_favorites_v1';
    window.localStorage.setItem(key, JSON.stringify([
      { name: 'テスト神社', latitude: 35.7, longitude: 139.7, kind: 'spot' },
    ]));
    try {
      render(
        <DirectionMap
          location={LOCATION}
          rankings={RANKINGS}
          bestPalace="kan"
          profileKey="jiban"
          showFavoritesSection
        />,
      );
      expect(document.querySelector('.direction-place-panel')).toBeTruthy();
      expect(screen.getByText('テスト神社')).toBeTruthy();
    } finally {
      window.localStorage.removeItem(key);
    }
  });
});
