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

describe('5タブ注釈撤廃', () => {
  it.each([
    '時盤 お散歩',
    '日盤 遠出',
    '最強ランキング',
    '格局を探す',
    '奇門三盤ルート 🔒',
  ])('「%s」タブが表示される', (label) => {
    expect(reverseDirectionViewSrc).toContain(label);
  });

  it.each([
    '今すぐ・近場',
    '日を決めて遠出',
    '期間内で最強の日',
    '強い時間帯を探す',
    '1日3方位ルート',
  ])('注釈「%s」が表示されない', (annotation) => {
    expect(reverseDirectionViewSrc).not.toContain(annotation);
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
