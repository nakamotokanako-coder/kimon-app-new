import { describe, it, expect } from 'vitest';
import { shortPlaceName } from '../src/components/yoho/BasePointBar.jsx';

describe('基準点の短い地名', () => {
  it('都道府県と市区町村までにする（番地は出さない）', () => {
    expect(shortPlaceName('東京都板橋区仲宿13番15号')).toBe('東京・板橋区');
    expect(shortPlaceName('大阪府大阪市北区梅田1-1')).toBe('大阪・大阪市');
    expect(shortPlaceName('京都府京都市東山区祇園町')).toBe('京都・京都市');
    expect(shortPlaceName('神奈川県鎌倉市雪ノ下2-1-31')).toBe('神奈川・鎌倉市');
    expect(shortPlaceName('北海道札幌市中央区北1条')).toBe('北海道・札幌市');
    expect(shortPlaceName('和歌山県東牟婁郡那智勝浦町那智山')).toBe('和歌山・東牟婁郡那智勝浦町');
  });

  it('住所の形でなければ、そのまま', () => {
    expect(shortPlaceName('東京')).toBe('東京');
    expect(shortPlaceName('現在地')).toBe('現在地');
    expect(shortPlaceName('皇居外苑')).toBe('皇居外苑');
    expect(shortPlaceName('')).toBe('');
    expect(shortPlaceName(undefined)).toBe('');
  });
});
