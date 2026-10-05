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

describe('6タブ注釈撤廃', () => {
  it.each([
    '時盤 お散歩',
    '時盤ランキング',
    '日盤 遠出',
    '日盤ランキング',
    '格局を探す',
    '奇門三盤ルート',
  ])('「%s」タブが表示される', (label) => {
    expect(reverseDirectionViewSrc).toContain(label);
  });

  it('奇門三盤ルートタブに南京錠も PRO バッジも付かない（全機能が同じ料金に含まれるため）', () => {
    expect(reverseDirectionViewSrc).not.toContain('奇門三盤ルート 🔒');
    expect(reverseDirectionViewSrc).not.toContain('pro-badge');
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
    expect(sanbanRouteViewSrc).toMatch(/何点以上でつなぐか/);
    expect(sanbanRouteViewSrc).toMatch(/検索する/);
  });

  it('南京錠も PRO バッジも表示しない', () => {
    expect(sanbanRouteViewSrc).not.toMatch(/🔒/);
    expect(sanbanRouteViewSrc).not.toMatch(/pro-badge/);
  });

  it('ReverseDirectionView が SanbanRouteView を import し mode=range で描画', () => {
    expect(reverseDirectionViewSrc).toMatch(/import SanbanRouteView from '\.\/SanbanRouteView\.jsx'/);
    expect(reverseDirectionViewSrc).toMatch(/<SanbanRouteView/);
  });
});
