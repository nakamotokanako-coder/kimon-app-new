/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DirectionMap, { describeDirection, googleMapsSearchUrl } from './DirectionMap.jsx';
import { getFanColor } from './mapFan.js';
import { MAP_GUIDE_SEEN_KEY, guideText } from './MapGuide.jsx';

const LOCATION = { name: '東京駅', latitude: 35.681, longitude: 139.767 };
const RANKINGS = [
  { palace: 'kan', label: '北', short: 'N', angle: 0, score: 30, tone: 'good', reasons: [] },
];

afterEach(() => {
  cleanup();
});

// 全画面は「地図の設定」の中にある（開いていなければ開いてから押す）
function openFullscreen() {
  if (!screen.queryByRole('button', { name: '⛶ 全画面' })) {
    fireEvent.click(screen.getByRole('button', { name: /地図の設定/ }));
  }
  fireEvent.click(screen.getByRole('button', { name: '⛶ 全画面' }));
}

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

    openFullscreen();

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

    openFullscreen();

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

    openFullscreen();
    fireEvent.click(screen.getByRole('button', { name: '🔍 検索' }));
    expect(document.querySelector('.direction-map-search-row')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    openFullscreen();

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

  it('nichiban（日盤遠出）では、キャプションを出す。作る側のメモのような注記は出さない', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="nichiban"
      />,
    );
    expect(document.querySelector('.direction-map-note')).toBe(null);
    expect(document.querySelector('.direction-map-caption')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/有効ライン|反転フェード|行軍|確定ライン/u);
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

  it('「吉方位のみ表示」は場所の種類とは別の行のスイッチ（単体では自前で切り替わる）', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="jiban"
      />,
    );
    const chips = document.querySelector('.direction-map-chips');
    expect([...chips.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['コンビニ', '駅', 'カフェ', 'スーパー', '公園', '神社']);
    const toggle = screen.getByRole('button', { name: '吉方位のみ表示' });
    expect(toggle.closest('.direction-map-filter')).toBeTruthy();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('「吉方位のみ表示」は、設定の「凶方位の表示」と同じ値を使う（渡されたとき）', () => {
    const onGoodOnlyChange = vi.fn();
    render(
      <DirectionMap
        location={LOCATION}
        rankings={RANKINGS}
        bestPalace="kan"
        profileKey="nichiban"
        goodOnly
        onGoodOnlyChange={onGoodOnlyChange}
      />,
    );
    const toggle = screen.getByRole('button', { name: '吉方位のみ表示' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(onGoodOnlyChange).toHaveBeenCalledWith(false);
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

const EIGHT = [
  { palace: 'gon', label: '北東', short: 'NE', angle: 45, score: 70, tone: 'great', reasons: ['開門', '九天', '青龍返首'], palaceData: { hachimon: '開門' } },
  { palace: 'son', label: '南東', short: 'SE', angle: 135, score: 10, tone: 'weak', reasons: ['生門'], palaceData: { hachimon: '生門' } },
  { palace: 'kan', label: '北', short: 'N', angle: 0, score: -60, tone: 'bad-strong', reasons: ['死門', '白虎'], palaceData: { hachimon: '死門' } },
];

describe('DirectionMap 地図の中央は基準点だけ（選んだ方位の情報は下のパネルに出す）', () => {
  it('地図の中央に基準点の名前を出し、照準リング（方位名・吉凶・点数）は出さない', () => {
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" />);
    expect(document.querySelector('.direction-base-label').textContent).toBe('◎ 東京駅');
    expect(document.querySelector('.direction-map-reticle')).toBe(null);
  });
});

describe('DirectionMap 方位を選ぶ（BEST と 選択中 は別）', () => {
  it('方位のラベルを押すと、その方位を選ぶ。BEST の印は一番評価の高い方位に付いたまま', () => {
    const onSelectPalace = vi.fn();
    render(
      <DirectionMap
        location={LOCATION}
        rankings={EIGHT}
        bestPalace="gon"
        profileKey="jiban"
        onSelectPalace={onSelectPalace}
      />,
    );
    const labels = [...document.querySelectorAll('.direction-map-label')];
    expect(labels).toHaveLength(3);
    expect(labels.filter((el) => el.querySelector('.direction-map-label-best')).map((el) => el.textContent)).toEqual(['BEST北東+70']);
    expect(document.querySelector('.direction-map-label.is-selected')).toBe(null);
    expect(screen.getByText('地図の方位を押すと、その方位にある場所を探せます。')).toBeTruthy();
    expect(document.querySelector('.direction-select-panel')).toBe(null);

    fireEvent.click(labels.find((el) => el.textContent.includes('南東')));
    expect(onSelectPalace).toHaveBeenCalledWith('son');
  });

  it('扇そのものも押せる（方位ごとに当たり判定がある）', () => {
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" onSelectPalace={() => {}} />);
    expect(document.querySelectorAll('.direction-fan-hit')).toHaveLength(3);
  });

  it('選んだ方位だけ選択状態になり、ほかは少し薄くなる（BEST は別のまま）', () => {
    render(
      <DirectionMap
        location={LOCATION}
        rankings={EIGHT}
        bestPalace="gon"
        selectedPalace="son"
        onSelectPalace={() => {}}
        profileKey="jiban"
      />,
    );
    expect(document.querySelector('.direction-map-label.is-selected').textContent).toBe('南東+10');
    expect(document.querySelectorAll('.direction-map-label.is-dim')).toHaveLength(2);
    expect(document.querySelector('.direction-map-label-best').parentElement.textContent).toContain('北東');
  });
});

describe('DirectionMap 選んだ方位のパネル（次に何をするかを主にする）', () => {
  const setup = (props = {}) => {
    const onSelectPalace = vi.fn();
    const onOpenDetail = vi.fn();
    render(
      <DirectionMap
        location={LOCATION}
        rankings={EIGHT}
        bestPalace="gon"
        selectedPalace="son"
        onSelectPalace={onSelectPalace}
        onOpenDetail={onOpenDetail}
        conditionLabel="17:00-19:00 の時盤"
        profileKey="jiban"
        {...props}
      />,
    );
    return { onSelectPalace, onOpenDetail, panel: document.querySelector('.direction-select-panel') };
  };

  it('方位・点数・吉凶・八門・短い説明と、条件を出す', () => {
    const { panel } = setup();
    expect(panel.querySelector('.direction-select-head').textContent).toBe('南東+10吉');
    expect(panel.querySelector('.direction-select-gate').textContent).toBe('生門');
    expect(panel.querySelector('.direction-select-cond').textContent).toBe('17:00-19:00 の時盤');
    expect(panel.querySelector('.direction-select-text').textContent).toBe('使いやすい方位です。');
    expect(screen.queryByText('地図の方位を押すと、その方位にある場所を探せます。')).toBe(null);
  });

  it('一番評価の高い方位を選んだときだけ、パネルにも BEST を出す', () => {
    expect(setup().panel.querySelector('.direction-select-best')).toBe(null);
    cleanup();
    expect(setup({ selectedPalace: 'gon' }).panel.querySelector('.direction-select-best').textContent).toBe('BEST');
  });

  it('ボタンの文言は選んだ方位で変わる。場所の種類を選べる', () => {
    const { panel } = setup();
    expect(within(panel).getByRole('button', { name: '南東でスポットを探す →' })).toBeTruthy();
    const cats = within(within(panel).getByRole('group', { name: '探す場所の種類' }));
    expect(cats.getByRole('button', { name: 'カフェ' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(cats.getByRole('button', { name: '神社' }));
    expect(cats.getByRole('button', { name: '神社' }).getAttribute('aria-pressed')).toBe('true');
    expect(cats.getByRole('button', { name: 'カフェ' }).getAttribute('aria-pressed')).toBe('false');
    cleanup();
    expect(within(setup({ selectedPalace: 'gon' }).panel).getByRole('button', { name: '北東でスポットを探す →' })).toBeTruthy();
  });

  it('× で選択をやめ、「詳しく見る」で方位詳細へ', () => {
    const { panel, onSelectPalace, onOpenDetail } = setup();
    fireEvent.click(within(panel).getByRole('button', { name: 'この方位を詳しく見る ›' }));
    expect(onOpenDetail).toHaveBeenCalledWith(expect.objectContaining({ palace: 'son' }));
    fireEvent.click(within(panel).getByRole('button', { name: '方位の選択をやめる' }));
    expect(onSelectPalace).toHaveBeenCalledWith(null);
  });

  it('短い説明は、吉凶と、その方位に入っているものだけで作る（八門は見出しに出すので重ねない）', () => {
    expect(describeDirection(EIGHT[0])).toBe('とくに使いやすい方位です。九天・青龍返首が入っています。');
    expect(describeDirection(EIGHT[2])).toBe('できれば避けたい方位です。白虎が入っています。');
    expect(describeDirection(null)).toBe('');
  });
});

describe('DirectionMap 方位設定・距離の切り替え', () => {
  it('上の行は「現在地」と「地図の設定」だけ。方位の引き方と全画面は「地図の設定」の中', () => {
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" />);
    expect(document.querySelector('.direction-map-controls')).toBe(null);
    const header = document.querySelector('.direction-map-header');
    expect([...header.querySelectorAll('button')].map((b) => b.textContent.replace(/[›▾]/, '').trim())).toEqual(['現在地', '地図の設定']);
    expect(screen.queryByRole('button', { name: '⛶ 全画面' })).toBe(null);
    fireEvent.click(screen.getByRole('button', { name: /地図の設定/ }));
    expect(screen.getByRole('button', { name: '⛶ 全画面' })).toBeTruthy();
    expect(document.querySelector('.direction-map-controls.is-compact')).toBeTruthy();
    expect(document.querySelector('.direction-bearing-now').textContent).toBe('方位の引き方：平面・補正なし');
  });

  it('距離は盤に合わせて出す（時盤は近場、日盤は遠出）', () => {
    const names = () => [...document.querySelectorAll('.direction-distance button')].map((b) => b.textContent);
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" />);
    expect(names()).toEqual(['500m', '2km', '5km', '10km']);
    cleanup();
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="nichiban" />);
    expect(names()).toEqual(['50km', '100km', '200km']);
  });
});

describe('DirectionMap 種類の検索（カフェなど）が混んでいて失敗したとき', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('もう一つの検索で同じ範囲を探して、結果を出す', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(String(url));
      if (String(url).startsWith('/api/overpass')) return { ok: false, status: 502 };
      return {
        ok: true,
        json: async () => [{ lat: '35.69', lon: '139.767', name: 'カフェ パウリスタ', osm_type: 'node', osm_id: 1 }],
      };
    }));
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" />);
    fireEvent.click(within(document.querySelector('.direction-map-chips')).getByRole('button', { name: 'カフェ' }));
    expect(await screen.findByText('カフェ パウリスタ')).toBeTruthy();
    expect(calls[0]).toBe('/api/overpass');
    expect(decodeURIComponent(calls[1])).toContain('/api/nominatim?q=カフェ');
    expect(document.querySelector('.direction-map-error')).toBe(null);
  });

  it('速い検索の結果を先に出し、くわしい検索が届いたら足す（待たせない）', async () => {
    let releaseDetailed;
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url).startsWith('/api/overpass')) {
        return new Promise((resolve) => {
          releaseDetailed = () => resolve({
            ok: true,
            json: async () => ({ elements: [
              { type: 'node', id: 1, lat: 35.69, lon: 139.767, tags: { name: 'カフェ パウリスタ' } },
              { type: 'node', id: 2, lat: 35.695, lon: 139.77, tags: { name: '喫茶 さくら' } },
            ] }),
          });
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [{ lat: '35.69', lon: '139.767', name: 'カフェ パウリスタ', osm_type: 'node', osm_id: 1 }],
      });
    }));
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" />);
    fireEvent.click(within(document.querySelector('.direction-map-chips')).getByRole('button', { name: 'カフェ' }));

    // くわしい検索がまだ返っていなくても、速い検索の結果が出る
    expect(await screen.findByText('カフェ パウリスタ')).toBeTruthy();
    expect(screen.queryByText('喫茶 さくら')).toBe(null);
    expect(screen.getByText('ほかにもないか、さらに探しています…')).toBeTruthy();

    // くわしい検索が届いたら足される（同じ場所は重ねない）
    releaseDetailed();
    expect(await screen.findByText('喫茶 さくら')).toBeTruthy();
    expect(screen.getAllByText('カフェ パウリスタ')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText('ほかにもないか、さらに探しています…')).toBe(null));
  });

  it('両方だめなら、混み合っていることを伝える', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 })));
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" />);
    fireEvent.click(within(document.querySelector('.direction-map-chips')).getByRole('button', { name: 'カフェ' }));
    expect((await screen.findByRole('alert')).textContent).toContain('場所の検索が混み合っていて');
    // 何も出せないままにしない: Googleマップで同じ言葉を探すリンクを出す
    const link = screen.getByRole('link', { name: /Googleマップでこの辺りのカフェを探す/ });
    expect(decodeURIComponent(link.getAttribute('href'))).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/カフェ\/@35\.\d+,139\.\d+,\d+z$/);
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('方位を選んでいるときは、その方位の先を中心にしたリンクになる', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 })));
    render(
      <DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" selectedPalace="gon" onSelectPalace={() => {}} profileKey="jiban" />,
    );
    fireEvent.click(within(document.querySelector('.direction-map-chips')).getByRole('button', { name: 'カフェ' }));
    const link = await screen.findByRole('link', { name: /Googleマップで北東のカフェを探す/ });
    const [, lat, lng] = decodeURIComponent(link.getAttribute('href')).match(/@([\d.]+),([\d.]+),/);
    // 北東 = 基準点より北で、東
    expect(Number(lat)).toBeGreaterThan(LOCATION.latitude);
    expect(Number(lng)).toBeGreaterThan(LOCATION.longitude);
  });

  it('結果が出ているときはリンクを出さない。リンクは場所と言葉だけで作る', async () => {
    expect(googleMapsSearchUrl('カフェ', [35.681, 139.767], 13.4)).toBe(`https://www.google.com/maps/search/${encodeURIComponent('カフェ')}/@35.68100,139.76700,13z`);
    expect(googleMapsSearchUrl('', [35.681, 139.767])).toBe('');
    expect(googleMapsSearchUrl('カフェ', null)).toBe('');
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" />);
    expect(screen.queryByRole('link', { name: /Googleマップ/ })).toBe(null);
  });
});

describe('DirectionMap 初めての人向けの案内（使い方・☆でお気に入り）', () => {
  afterEach(() => { vi.unstubAllGlobals(); window.localStorage.clear(); });

  it('検索の欄のすぐ下の「？ 使い方ガイド」で、色とピンの意味・お気に入りの登録のしかたを開ける', () => {
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" />);
    expect(screen.queryByRole('dialog', { name: '使い方ガイド' })).toBe(null);
    const link = screen.getByRole('button', { name: '？ 使い方ガイド' });
    // 検索の欄 → 説明書・吉方位のみ表示 → 場所の種類、の順
    const order = [...document.querySelector('.direction-map-search').children].map((el) => el.className.split(' ')[0]);
    expect(order.slice(0, 3)).toEqual(['direction-map-search-row', 'direction-map-filter', 'direction-map-chips']);
    fireEvent.click(link);
    const guide = screen.getByRole('dialog', { name: '使い方ガイド' });
    // 初めての人がつまずいた順: どっちの盤を見るか → 今どっちへ → 行きたい場所を調べる → …
    expect(within(guide).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'まず、時盤と日盤のどっちを見る？',
      '今、どっちへ行けばいい？',
      '行きたい場所が吉方位か調べる',
      '名前で見つからないとき',
      '地図にお店の名前が出ないのはなぜ？',
      '吉方位の中から行き先を探す',
      'ピンの色と数字',
      'お気に入りに登録する',
      'そのほかのボタン',
    ]);
    expect(guide.textContent).toContain('赤いピン　凶方位にある場所');
    expect(guide.textContent).toContain('青いピン　吉方位にある場所');
    expect(guide.textContent).toContain('近所へ出かけるなら、時盤を見てください');
    expect(guide.textContent).toContain('お店の名前では見つからないことがあります');
    // 名前で見つからないとき: Googleマップのリンクを貼る手順を、図つきで3つ
    const figures = guide.querySelectorAll('.map-guide-figures li');
    expect(figures).toHaveLength(3);
    expect([...guide.querySelectorAll('.map-guide-figures svg')].map((svg) => svg.getAttribute('aria-label'))).toEqual([
      '場所の名前の右にある、共有のボタンを押す',
      '共有の画面で、コピーを押す',
      '奇門遁甲Zの検索の欄に貼り付けて、検索を押す',
    ]);
    // 見本のピンは、実際の地図と同じ見た目
    expect(guide.querySelectorAll('.direction-poi-pin')).toHaveLength(4);
    fireEvent.click(within(guide).getAllByRole('button', { name: '閉じる' })[0]);
    expect(screen.queryByRole('dialog', { name: '使い方ガイド' })).toBe(null);
  });

  it('初めて地図を開いたときだけ、説明書が自動で出る。閉じたら、次からは出ない', () => {
    const first = render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" autoGuide />);
    const guide = screen.getByRole('dialog', { name: '使い方ガイド' });
    expect(guide.textContent).toContain('「使い方ガイド」から、いつでも開けます');
    fireEvent.click(within(guide).getAllByRole('button', { name: '閉じる' })[0]);
    expect(screen.queryByRole('dialog', { name: '使い方ガイド' })).toBe(null);
    expect(window.localStorage.getItem(MAP_GUIDE_SEEN_KEY)).toBe('1');
    first.unmount();

    // 2回目からは自動では出ない（自分で開くことはできる）
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" autoGuide />);
    expect(screen.queryByRole('dialog', { name: '使い方ガイド' })).toBe(null);
    fireEvent.click(screen.getByRole('button', { name: '？ 使い方ガイド' }));
    expect(screen.getByRole('dialog', { name: '使い方ガイド' })).toBeTruthy();
  });

  it('自動で出すのは、指定されたとき（地図タブを開いているとき）だけ', () => {
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" />);
    expect(screen.queryByRole('dialog', { name: '使い方ガイド' })).toBe(null);
  });

  it('検索結果の一覧の ☆ で、お気に入りに登録・解除できる', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).startsWith('/api/overpass')) return { ok: false, status: 502 };
      return { ok: true, json: async () => [{ lat: '35.69', lon: '139.767', name: 'カフェ パウリスタ', osm_type: 'node', osm_id: 1 }] };
    }));
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" />);
    fireEvent.click(within(document.querySelector('.direction-map-chips')).getByRole('button', { name: 'カフェ' }));
    const star = await screen.findByRole('button', { name: 'カフェ パウリスタをお気に入りに登録' });
    expect(screen.getByText('☆ を押すと、お気に入りに登録できます。')).toBeTruthy();
    expect(star.textContent).toBe('☆');

    fireEvent.click(star);
    const saved = JSON.parse(window.localStorage.getItem('kimon_map_favorites_v1'));
    expect(saved.map((f) => f.name)).toEqual(['カフェ パウリスタ']);
    const on = screen.getByRole('button', { name: 'カフェ パウリスタをお気に入りから外す' });
    expect(on.textContent).toBe('★');

    fireEvent.click(on);
    expect(JSON.parse(window.localStorage.getItem('kimon_map_favorites_v1'))).toEqual([]);
  });
});

describe('使い方ガイドの文章', () => {
  it('タイトル（見出し）は句点で終わらない。効果を約束する書き方をしない。飾りの記号を使わない', () => {
    const text = guideText();
    for (const heading of text.split('\n').slice(0, 1)) expect(heading.endsWith('。')).toBe(false);
    expect(text).not.toMatch(/運が上が|開運|必ず|効果があ/u);
    expect(text).not.toMatch(/[★☆✎→]/u);
  });

  it('距離と時間の目安は、時盤は「500m以上、または5分以上かけて移動」して5分以上／日盤は 50km・3時間', () => {
    const text = guideText();
    expect(text).toContain('500メートル以上はなれた場所へ行くか、5分以上かけて移動します。着いた先で5分以上過ごす');
    expect(text).toContain('50キロ以上はなれた場所へ行き、3時間以上');
  });
});

describe('DirectionMap 名前・住所・リンクで探す（日本全国）', () => {
  afterEach(() => vi.unstubAllGlobals());
  const station = { name: '京都', category: 'railway', type: 'station', importance: 0.56, lat: '34.9862', lon: '135.7601', osm_type: 'node', osm_id: 9, address: { state: '京都府', city: '京都市', city_district: '下京区' } };
  const search = (text) => {
    fireEvent.change(document.querySelector('.direction-map-search-row input'), { target: { value: text } });
    fireEvent.submit(document.querySelector('.direction-map-search-row'));
  };
  const stubSearch = ({ inView = [], nationwide = [], gsi = [] }) => vi.stubGlobal('fetch', vi.fn(async (url) => {
    const text = String(url);
    if (text.startsWith('https://msearch.gsi.go.jp')) return { ok: true, json: async () => gsi };
    if (text.includes('scope=jp')) return { ok: true, json: async () => nationwide };
    return { ok: true, json: async () => inView };
  }));

  it('地図の範囲に無くても全国から探す。候補が1つなら、そのまま地図に出す', async () => {
    stubSearch({ nationwide: [station] });
    const onSetBasePoint = vi.fn();
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" onSetBasePoint={onSetBasePoint} />);
    search('京都駅');
    expect(await screen.findByText(/京都駅を表示しました/)).toBeTruthy();
    expect(document.querySelector('.direction-candidates')).toBe(null);
    // 行き先として出す。基準点にしたいときは、ボタンで切り替える
    fireEvent.click(screen.getByRole('button', { name: /ここを基準点にする/ }));
    expect(onSetBasePoint).toHaveBeenCalledWith([135.7601, 34.9862], '京都駅');
  });

  it('候補が複数あるときは、1つに決め打ちせず、名前と住所を並べて選んでもらう', async () => {
    stubSearch({
      nationwide: [
        { name: '明治神宮', category: 'amenity', type: 'place_of_worship', importance: 0.49, lat: '35.6748', lon: '139.6996', osm_type: 'way', osm_id: 1, address: { state: '東京都', city: '渋谷区', suburb: '代々木神園町' } },
        { name: '明治神宮', category: 'amenity', type: 'place_of_worship', importance: 0, lat: '35.9525', lon: '139.9922', osm_type: 'node', osm_id: 2, address: { state: '茨城県', city: '守谷市' } },
      ],
    });
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" />);
    search('明治神宮');
    const list = await screen.findByRole('list', { name: '検索の候補' });
    const items = within(list).getAllByRole('button');
    expect(items.map((b) => b.textContent)).toEqual(['明治神宮神社・寺・東京都渋谷区代々木神園町', '明治神宮神社・寺・茨城県守谷市']);
    fireEvent.click(items[0]);
    expect(await screen.findByText(/明治神宮を表示しました/)).toBeTruthy();
    expect(screen.queryByRole('list', { name: '検索の候補' })).toBe(null);
  });

  it('どこにも載っていないお店は、見つからないと伝えて、住所かリンクを案内する', async () => {
    stubSearch({});
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" />);
    search('カナガーデン');
    expect(await screen.findByText('カナガーデンは見つかりませんでした。')).toBeTruthy();
    expect(screen.getByText(/「共有」のリンクをコピーし、この検索の欄に貼り付けてください/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Googleマップでこの辺りのカナガーデンを探す/ })).toBeTruthy();
  });

  it('Googleマップのリンクを貼ると、その場所をそのまま出す（外へ探しに行かない）', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<DirectionMap location={LOCATION} rankings={EIGHT} bestPalace="gon" profileKey="jiban" />);
    search('https://www.google.com/maps/place/%E3%82%AB%E3%83%8A%E3%82%AC%E3%83%BC%E3%83%87%E3%83%B3/@35.70,139.77,17z/data=!3d35.7012!4d139.7745');
    expect(await screen.findByText(/カナガーデンを表示しました/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
