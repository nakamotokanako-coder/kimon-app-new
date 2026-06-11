import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf-8');

const reverseSrc = read('reverseDirection/ReverseDirectionView.jsx');
const mapSrc = read('reverseDirection/DirectionMap.jsx');

describe('出発点ピッカー（吉方位GO）', () => {
  it('現在地常時・🏠拠点開・⭐お気に入り閉(内部スクロール)・住所検索 の構成を持つ', () => {
    expect(reverseSrc).toContain('basePointPicker');
    expect(reverseSrc).toContain('kiten-pick-now');
    expect(reverseSrc).toContain('現在地を使う');
    expect(reverseSrc).toContain('自宅・拠点');
    expect(reverseSrc).toContain('お気に入りから');
    expect(reverseSrc).toContain('kiten-pick-body-scroll');
    // 拠点=デフォルト開 / お気に入り=デフォルト閉
    expect(reverseSrc).toContain('useState(true)'); // homeGroupOpen
    expect(reverseSrc).toContain('const [spotGroupOpen, setSpotGroupOpen] = useState(false)');
  });

  it('home/spot で出発点リストを分け、選択は favorite モードで保存経路に乗る', () => {
    expect(reverseSrc).toContain("favoriteKind(item) === 'home'");
    expect(reverseSrc).toContain("favoriteKind(item) !== 'home'");
    expect(reverseSrc).toContain('selectFavoriteBasePoint');
    expect(reverseSrc).toContain("setCurrentMode('favorite')");
    expect(reverseSrc).toContain('writeStoredBasePoint');
  });

  it('GOゾーンのピッカーは renderGoZone 経由（時盤・日盤両モード）で使われる', () => {
    expect(reverseSrc).toContain('{basePointPicker}');
  });
});

describe('拠点トグル（ピン詳細ポップアップ・編集モーダル）', () => {
  it('ポップアップに 🏠拠点トグル（data-toggle-home）があり toggleFavoriteKind に配線', () => {
    expect(mapSrc).toContain('data-toggle-home');
    expect(mapSrc).toContain('toggleFavoriteKind');
    expect(mapSrc).toContain('direction-popup-home');
  });

  it('編集モーダルに拠点トグルがある', () => {
    expect(mapSrc).toContain('direction-favorite-home-toggle');
    expect(mapSrc).toContain("favoriteKind(editingFavorite) === 'home'");
  });

  it('未保存→home追加 / 保存済→home⇄spot切替', () => {
    expect(mapSrc).toContain("addFavorite(place, 'home')");
    expect(mapSrc).toContain("favoriteKind(existing) === 'home' ? 'spot' : 'home'");
  });
});
