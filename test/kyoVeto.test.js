import { describe, expect, it } from 'vitest';
import { buildBoard } from '../src/kimon/buildBoard.js';
import { lookupChito } from '../src/kimon/loadChito.js';
import { scoreBoard } from '../src/kimon/scoreEngine.js';
import { classifyPalace } from '../src/kaisetsu/classifyPalace.js';
import {
  SANDAI_KYOKAKU,
  detectSandaiKyokaku,
  detectSandaiKyokakuFromRaw,
} from '../src/kaisetsu/kyoVeto.js';
import { getBadge } from '../src/components/BottomSheet.jsx';
import { getScoreTone } from '../src/reverseDirection/reverseDirection.js';

describe('三大凶格の拒否権', () => {
  it('三大凶格は3件だけ', () => {
    expect(SANDAI_KYOKAKU).toEqual(['伏宮格', '飛宮格', '戦格']);
    expect(SANDAI_KYOKAKU).toHaveLength(3);
  });

  it('detected_kakkyoku から飛宮格・伏宮格を検出する', () => {
    expect(detectSandaiKyokaku({
      detected_kakkyoku: [
        { name: '青龍逃走', kichi_kyo: 'kyo', score: -10 },
        { name: '飛宮格', kichi_kyo: 'kyo', score: -10 },
      ],
    })).toBe('飛宮格');
    expect(detectSandaiKyokaku([
      { name: '伏宮格', kichi_kyo: 'kyo', score: -10 },
    ])).toBe('伏宮格');
  });

  it('null / undefined / 空配列で例外を投げず null を返す', () => {
    expect(detectSandaiKyokaku(null)).toBeNull();
    expect(detectSandaiKyokaku(undefined)).toBeNull();
    expect(detectSandaiKyokaku({ detected_kakkyoku: [] })).toBeNull();
    expect(detectSandaiKyokakuFromRaw(null)).toBeNull();
    expect(detectSandaiKyokakuFromRaw(undefined)).toBeNull();
    expect(detectSandaiKyokakuFromRaw([])).toBeNull();
  });

  it('三大凶格以外の凶格では null を返す', () => {
    expect(detectSandaiKyokaku({
      detected_kakkyoku: [{ name: '六儀撃刑格', kichi_kyo: 'kyo', score: -10 }],
    })).toBeNull();
    expect(detectSandaiKyokakuFromRaw('×六儀撃刑格')).toBeNull();
  });

  it('CSV由来の raw 文字列・配列から三大凶格を検出する', () => {
    expect(detectSandaiKyokakuFromRaw('×飛宮格;×六儀撃刑格')).toBe('飛宮格');
    expect(detectSandaiKyokakuFromRaw(['×地網', '×戦格'])).toBe('戦格');
  });

  it('2026-07-30 日盤 坤宮はスコアを維持したまま最低トーンへ落とす', () => {
    const board = buildBoard({ date: '2026-07-30', boardType: '日' });
    const score = scoreBoard(board);
    const kunScore = score.palaces.kun;
    const row = lookupChito(`${board.meta.kyokusu}${board.meta.eto}`);
    const judgment = classifyPalace(row, 'kun');

    expect(kunScore.score).toBe(65);
    expect(detectSandaiKyokaku(kunScore)).toBe('飛宮格');
    expect(getScoreTone(kunScore.score, kunScore)).toBe('bad-strong');
    expect(getBadge(kunScore.score, kunScore)).toEqual({ label: '凶', className: 'kyo' });
    expect(getBadge(kunScore.score, kunScore).label).not.toBe('大吉');
    expect(judgment.rank).toBe('×');
    expect(judgment.axisRanks).toEqual({
      goen: '×',
      shigoto: '×',
      kinun: '×',
      kenko: '×',
      benkyo: '×',
    });
  });

  it('三大凶格が出ていない高得点宮は従来どおり大吉判定', () => {
    const board = buildBoard({ date: '2026-07-30', boardType: '日' });
    const score = scoreBoard(board);
    const daScore = score.palaces.da;

    expect(daScore.score).toBe(75);
    expect(detectSandaiKyokaku(daScore)).toBeNull();
    expect(getScoreTone(daScore.score, daScore)).toBe('great');
    expect(getBadge(daScore.score, daScore)).toEqual({ label: '大吉', className: 'kichi' });
  });
});
