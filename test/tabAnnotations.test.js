import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const reverseDirectionViewSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'reverseDirection', 'ReverseDirectionView.jsx'),
  'utf-8',
);

const sanbanRouteViewSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'reverseDirection', 'SanbanRouteView.jsx'),
  'utf-8',
);

describe('5タブ注釈リネーム（指示書 §2）', () => {
  it('「時盤 お散歩」の注釈が「今すぐ・近場」になっている', () => {
    expect(reverseDirectionViewSrc).toMatch(/時盤 お散歩<small>今すぐ・近場<\/small>/);
  });

  it('「日盤 遠出」の注釈が「日を決めて遠出」になっている', () => {
    expect(reverseDirectionViewSrc).toMatch(/日盤 遠出<small>日を決めて遠出<\/small>/);
  });

  it('「最強ランキング」の注釈が「期間内で最強の日」になっている', () => {
    expect(reverseDirectionViewSrc).toMatch(/最強ランキング<small>期間内で最強の日<\/small>/);
  });

  it('「格局を探す」の注釈が「強い時間帯を探す」になっている', () => {
    expect(reverseDirectionViewSrc).toMatch(/格局を探す<small>強い時間帯を探す<\/small>/);
  });

  it('「奇門三盤ルート 🔒」タブが存在し注釈は「1日3方位ルート」', () => {
    expect(reverseDirectionViewSrc).toMatch(/奇門三盤ルート 🔒<small>1日3方位ルート<\/small>/);
  });

  it('旧開発用語の注釈が残っていない', () => {
    expect(reverseDirectionViewSrc).not.toMatch(/<small>今と本日<\/small>/);
    expect(reverseDirectionViewSrc).not.toMatch(/<small>本実装<\/small>/);
    expect(reverseDirectionViewSrc).not.toMatch(/<small>将来<\/small>/);
  });
});

describe('奇門三盤ルート 準備中画面（指示書 §3）', () => {
  it('SanbanRouteView コンポーネントが存在し export されている', () => {
    expect(sanbanRouteViewSrc).toMatch(/export default function SanbanRouteView/);
  });

  it('タイトル「奇門三盤ルート」が表示される', () => {
    expect(sanbanRouteViewSrc).toMatch(/奇門三盤ルート</);
  });

  it('「準備中」の文言がある', () => {
    expect(sanbanRouteViewSrc).toMatch(/準備中/);
  });

  it('機能説明（3項目）が含まれている', () => {
    expect(sanbanRouteViewSrc).toMatch(/吉方位が3つ揃う日を検索/);
    expect(sanbanRouteViewSrc).toMatch(/3スポット巡回ルートを地図に表示/);
    expect(sanbanRouteViewSrc).toMatch(/時盤ベース/);
  });

  it('鍵マーク 🔒 がアイコンとして含まれる', () => {
    expect(sanbanRouteViewSrc).toMatch(/🔒/);
  });

  it('ReverseDirectionView が SanbanRouteView を import し mode=range で描画', () => {
    expect(reverseDirectionViewSrc).toMatch(/import SanbanRouteView from '\.\/SanbanRouteView\.jsx'/);
    expect(reverseDirectionViewSrc).toMatch(/<SanbanRouteView \/>/);
  });
});
