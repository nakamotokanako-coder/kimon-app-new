import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GATE_ICONS } from '../src/reverseDirection/CompassWheel.jsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf-8');

const appSrc = read('App.jsx');
const reverseSrc = read('reverseDirection/ReverseDirectionView.jsx');
const rankingSrc = read('reverseDirection/SaikyoRankingView.jsx');
const kakkyokuSrc = read('reverseDirection/KakkyokuSearchView.jsx');
const compassSrc = read('reverseDirection/CompassWheel.jsx');

describe('吉方位 UI 整理', () => {
  it('目的フィルタUIを表示しない', () => {
    expect(reverseSrc).not.toContain('目的フィルタ');
    expect(reverseSrc).not.toContain('目的別の加点');
    expect(reverseSrc).not.toContain('getPurposeNames');
  });

  it('日盤ランキングへ改名されている', () => {
    expect(reverseSrc).toContain('日盤ランキング');
    expect(rankingSrc).toContain('<h3>日盤ランキング</h3>');
  });

  it('円盤に吉門アイコンを描画する', () => {
    expect(GATE_ICONS).toEqual({
      生門: '🌱',
      開門: '🚪',
      休門: '❤️',
      景門: '☀️',
    });
    expect(compassSrc).toContain('reverse-gate-icon');
  });
});

describe('共通フル盤導線', () => {
  it('Appに共通openFullBoardと戻る処理がある', () => {
    expect(appSrc).toContain('const openFullBoard =');
    expect(appSrc).toContain("setActiveTab('board')");
    expect(appSrc).toContain('← 戻る');
    expect(appSrc).toContain('<ReverseDirectionView onOpenBoard={openFullBoard} />');
    expect(appSrc).toContain("hidden={activeTab !== 'direction'}");
  });

  it('1位カードと時間帯別ベストから時盤を開ける', () => {
    expect(reverseSrc).toContain("onOpenBoard({ date, hour: slotHour, boardType: '時' })");
    expect(reverseSrc).toContain("onOpenBoard({ date, hour: slot.hour, boardType: '時' })");
  });

  it('日盤ランキングの展開内から日盤を開ける', () => {
    expect(rankingSrc).toContain('<MiniBoardGrid rankings={rankings} />');
    expect(rankingSrc).toContain("onOpenBoard({ date: item.date, boardType: '日' })");
  });

  it('格局検索結果の展開内から時盤を開ける', () => {
    expect(kakkyokuSrc).toContain('<MiniBoardGrid rankings={rankings} />');
    expect(kakkyokuSrc).toContain("onOpenBoard({ date: item.date, hour: item.hour, boardType: '時' })");
  });

  it('奇門三盤ルート結果も共通遷移で時盤を開く', () => {
    expect(reverseSrc).toContain("onOpenBoard({ date: route.date, hour: route.slots[0].hour, boardType: '時' })");
  });
});
