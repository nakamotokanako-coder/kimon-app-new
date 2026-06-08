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
    '日盤ランキング',
    '格局を探す',
    '奇門三盤ルート',
  ])('「%s」タブが表示される', (label) => {
    expect(reverseDirectionViewSrc).toContain(label);
  });

  // redesign/dark-mincho フェーズ2: 三盤ルートタブの南京錠 🔒 → PRO バッジに変更。
  it('奇門三盤ルートタブが南京錠ではなく PRO バッジで表示される', () => {
    expect(reverseDirectionViewSrc).not.toContain('奇門三盤ルート 🔒');
    expect(reverseDirectionViewSrc).toMatch(/奇門三盤ルート\s*<span className="pro-badge"/);
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

describe('奇門三盤ルート 本実装画面', () => {
  it('SanbanRouteView コンポーネントが存在し export されている', () => {
    expect(sanbanRouteViewSrc).toMatch(/export default function SanbanRouteView/);
  });

  it('タイトル「奇門三盤ルート」が表示される', () => {
    expect(sanbanRouteViewSrc).toMatch(/奇門三盤ルート</);
  });

  it('準備中表示が撤廃されている', () => {
    expect(sanbanRouteViewSrc).not.toMatch(/準備中/);
  });

  it('期間・足切り点数・検索ボタンが含まれている', () => {
    expect(sanbanRouteViewSrc).toMatch(/1ヶ月/);
    expect(sanbanRouteViewSrc).toMatch(/足切り点数/);
    expect(sanbanRouteViewSrc).toMatch(/検索する/);
  });

  // redesign/dark-mincho フェーズ2: ヒーローの南京錠 🔒 → PRO バッジに変更。
  it('PRO バッジが飾りとして含まれる（南京錠は撤廃）', () => {
    expect(sanbanRouteViewSrc).not.toMatch(/🔒/);
    expect(sanbanRouteViewSrc).toMatch(/className="pro-badge"/);
  });

  it('ReverseDirectionView が SanbanRouteView を import し mode=range で描画', () => {
    expect(reverseDirectionViewSrc).toMatch(/import SanbanRouteView from '\.\/SanbanRouteView\.jsx'/);
    expect(reverseDirectionViewSrc).toMatch(/<SanbanRouteView/);
  });
});
