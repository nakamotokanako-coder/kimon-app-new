/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DirectionMap, { buildCenterReticleHtml } from './DirectionMap.jsx';
import { getFanColor } from './mapFan.js';

const LOCATION = { name: '東京駅', latitude: 35.681, longitude: 139.767 };
const RANKINGS = [
  { palace: 'kan', label: '北', short: 'N', angle: 0, score: 30, tone: 'good', reasons: [] },
];

afterEach(() => {
  cleanup();
});

describe('DirectionMap フルスクリーン検索UI折りたたみ（PR-2.5 jiban → PR-D2 nichiban展開）', () => {
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

  it('nichiban（日盤遠出）×フルスクリーンでもjibanと同じく既定で検索UIが畳まれ、同じトグルボタンで開閉できる（PR-D2）', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="nichiban"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '⛶ 全画面' }));

    // 既定：畳まれている（検索フォームは描画されない・トグルボタンだけ）。
    expect(screen.getByRole('button', { name: '🔍 検索' })).toBeTruthy();
    expect(document.querySelector('.direction-map-search-row')).toBe(null);

    // トグルで展開。
    fireEvent.click(screen.getByRole('button', { name: '🔍 検索' }));
    expect(document.querySelector('.direction-map-search-row')).toBeTruthy();

    // 同じボタン（ラベルが「検索を閉じる」に変わる）で再び畳める。
    fireEvent.click(screen.getByRole('button', { name: '🔍 検索を閉じる' }));
    expect(document.querySelector('.direction-map-search-row')).toBe(null);
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

describe('DirectionMap GOゾーン再構成（PR-2.6 jiban → PR-D2 nichiban展開）', () => {
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

  it('jibanでも全画面/現在地ボタン・凡例は地図上オーバーレイにせず、in-flowヘッダー行・凡例で描画する（PR-2.7）', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );
    // オーバーレイ土台・オーバーレイ要素は使わない。
    expect(document.querySelector('.direction-map-stage')).toBe(null);
    expect(document.querySelector('.direction-map-overlay-actions')).toBe(null);
    expect(document.querySelector('.direction-map-legend--overlay')).toBe(null);
    // 通常のヘッダー行（全画面/現在地ボタン）と凡例がin-flowで描画される。
    const header = document.querySelector('.direction-map-header');
    expect(header).toBeTruthy();
    expect(header.querySelector('.direction-map-action')).toBeTruthy();
    expect(document.querySelector('.direction-map-legend')).toBeTruthy();
    expect(document.querySelector('.direction-map')).toBeTruthy();
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

  it('nichibanもjibanと同じくチップ列内の点線トグル版の「吉方位だけ」になる（PR-D2）', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="nichiban"
      />,
    );
    const toggle = screen.getByRole('button', { name: '✓ 吉方位だけ' });
    expect(toggle.className).toContain('direction-map-chip-toggle');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    // 従来のチェックボックス版は出ない（置き場所だけ移した）。
    expect(document.querySelector('.direction-kichi-filter')).toBe(null);
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

describe('DirectionMap 地図中心インジケータ（jiban/nichiban共通）', () => {
  it('マウント直後は地図中心=基準点のため「基準点」表示になる（jiban）', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );
    const indicator = document.querySelector('.direction-map-center-indicator');
    expect(indicator).toBeTruthy();
    expect(indicator.querySelector('.direction-map-center-base')).toBeTruthy();
    expect(indicator.textContent).toContain('基準点');
  });

  it('マウント直後は地図中心=基準点のため「基準点」表示になる（nichiban）', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="nichiban"
      />,
    );
    const indicator = document.querySelector('.direction-map-center-indicator');
    expect(indicator).toBeTruthy();
    expect(indicator.textContent).toContain('基準点');
  });

  it('インジケータは.direction-map-header内の先頭子要素として配置される（新規の独立行を作らない）', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="nichiban"
      />,
    );
    const header = document.querySelector('.direction-map-header');
    expect(header.firstElementChild.className).toContain('direction-map-center-indicator');
  });
});

describe('buildCenterReticleHtml（レティクルのHTML生成・純関数）', () => {
  it('isNearBaseのときは「◎ 基準点」を出す', () => {
    const html = buildCenterReticleHtml({ isNearBase: true, distanceM: 10, direction: null });
    expect(html).toContain('direction-map-reticle-label">◎</span>');
    expect(html).toContain('◎ 基準点');
  });

  it('離れた地点の方位・吉凶・色を反映する（great）', () => {
    const html = buildCenterReticleHtml({
      isNearBase: false,
      distanceM: 24700,
      direction: { palace: 'ken', label: '北西', short: 'NW', score: 70, tone: 'great' },
    });
    expect(html).toContain('北西');
    expect(html).toContain('大吉 +70');
    expect(html).toContain(`--reticle-color: ${getFanColor('great')};`);
  });

  it('凶方位ではラベル・色がgreatと異なる', () => {
    const html = buildCenterReticleHtml({
      isNearBase: false,
      distanceM: 5000,
      direction: { palace: 'shin', label: '東', short: 'E', score: -30, tone: 'bad-strong' },
    });
    expect(html).toContain('東');
    expect(html).toContain('凶 -30');
    expect(html).toContain(`--reticle-color: ${getFanColor('bad-strong')};`);
    expect(getFanColor('bad-strong')).not.toBe(getFanColor('great'));
  });

  it('centerOffsetがnullなら空文字を返す', () => {
    expect(buildCenterReticleHtml(null)).toBe('');
  });
});

describe('DirectionMap 地図中心レティクル（照準リング・jiban/nichiban共通）', () => {
  it('マウント直後は地図中心=基準点のためレティクルに「基準点」が表示される（jiban）', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );
    const reticle = document.querySelector('.direction-map-reticle');
    expect(reticle).toBeTruthy();
    expect(reticle.textContent).toContain('基準点');
  });

  it('マウント直後は地図中心=基準点のためレティクルに「基準点」が表示される（nichiban）', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="nichiban"
      />,
    );
    const reticle = document.querySelector('.direction-map-reticle');
    expect(reticle).toBeTruthy();
    expect(reticle.textContent).toContain('基準点');
  });

  it('主描画（扇・ラベル）が再構築されてもレティクルは独立レイヤーのため消えない', () => {
    const { rerender } = render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );
    expect(document.querySelector('.direction-map-reticle')).toBeTruthy();

    // rankings/bestPalaceの変更は主描画エフェクト（layerGroupRef.clearLayers()）を再実行させる。
    rerender(
      <DirectionMap
        location={LOCATION}
        rankings={[{ palace: 'shin', label: '東', short: 'E', angle: 90, score: -10, tone: 'bad', reasons: [] }]}
        bestPalace="shin"
        profileKey="jiban"
      />,
    );
    expect(document.querySelector('.direction-map-reticle')).toBeTruthy();
  });

  it('フルスクリーンでもレティクルが表示され続ける', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '⛶ 全画面' }));
    expect(document.querySelector('.direction-map-reticle')).toBeTruthy();
  });
});
