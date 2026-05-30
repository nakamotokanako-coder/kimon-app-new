import { describe, it, expect } from 'vitest';
import { buildBoard } from '../src/kimon/buildBoard.js';
import { scoreBoard } from '../src/kimon/scoreEngine.js';
import { buildReverseBoard } from '../src/reverseDirection/reverseDirection.js';

describe('盤画面と吉方位画面の score 一致', () => {
  it('2026-05-30 14:00 時盤・南西（坤）で同じ score になる', () => {
    const date = '2026-05-30';
    const hour = 14;

    const board = buildBoard({ date, hour, boardType: '時' });
    const sb = scoreBoard(board);
    const banScore = sb.palaces.kun.score;

    const rev = buildReverseBoard({ date, hour, purposeName: '仕事' });
    const kunRank = rev.rankings.find((r) => r.palace === 'kun');

    expect(kunRank.score).toBe(banScore);
    expect(kunRank.purposeBonus).toBe(0);
  });

  it('全宮・全目的の組み合わせで吉方位画面の score == 盤画面 score', () => {
    const date = '2026-05-30';
    const hour = 14;
    const board = buildBoard({ date, hour, boardType: '時' });
    const sb = scoreBoard(board);

    const purposes = ['仕事', '金運', '恋愛', '出会い', '健康', '投資'];
    for (const p of purposes) {
      const rev = buildReverseBoard({ date, hour, purposeName: p });
      for (const r of rev.rankings) {
        expect(r.score, `${p} / ${r.palace}`).toBe(sb.palaces[r.palace].score);
        expect(r.purposeBonus, `${p} / ${r.palace}`).toBe(0);
      }
    }
  });
});
