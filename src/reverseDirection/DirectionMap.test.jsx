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

    fireEvent.click(screen.getByRole('button', { name: '拡大' }));

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

    fireEvent.click(screen.getByRole('button', { name: '拡大' }));

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

    fireEvent.click(screen.getByRole('button', { name: '拡大' }));
    fireEvent.click(screen.getByRole('button', { name: '🔍 検索' }));
    expect(document.querySelector('.direction-map-search-row')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    fireEvent.click(screen.getByRole('button', { name: '拡大' }));

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
