import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBoard } from '../src/kimon/buildBoard.js';
import { scoreBoard } from '../src/kimon/scoreEngine.js';
import { buildScoreBreakdown, listKakkyoku, banLevelText } from '../src/kimon/palaceExplain.js';
import { ELEMENT_TEXTS } from '../src/kimon/elementTexts.generated.js';
import { buildElementTexts } from '../scripts/build_element_texts.mjs';

const bank = JSON.parse(readFileSync(new URL('../data/kaisetsu/kaisetsu_bank_v1.json', import.meta.url), 'utf8'));

describe('elementTexts.generated.js', () => {
  it('文言バンクと一致している（ずれていたら node scripts/build_element_texts.mjs で再生成）', () => {
    expect(ELEMENT_TEXTS).toEqual(buildElementTexts(bank));
  });
});

describe('buildScoreBreakdown', () => {
  it('内訳の行を足すと総合点と必ず一致する（拒否権の上限・120点上限・順利を含む・2か月分の日盤/時盤）', () => {
    let checked = 0;
    let withVeto = 0;
    for (let d = 0; d < 60; d += 1) {
      const date = new Date(Date.UTC(2026, 8, 1 + d)).toISOString().slice(0, 10);
      for (const [boardType, hour] of [['日', 0], ['時', 10], ['時', 16]]) {
        const board = buildBoard({ date, hour, boardType });
        const score = scoreBoard(board);
        for (const [palace, ps] of Object.entries(score.palaces)) {
          const rows = buildScoreBreakdown(ps, board.palaces[palace], score.ban_level);
          const sum = rows.reduce((a, r) => a + r.points, 0);
          expect(Math.round(sum * 1000) / 1000, `${date}${boardType}${hour} ${palace}`).toBe(ps.score);
          if (rows.some((r) => r.key === 'veto_cap')) withVeto += 1;
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(withVeto).toBeGreaterThan(0);
  });

  it('各行に説明文がある', () => {
    const board = buildBoard({ date: '2026-10-02', hour: 16, boardType: '時' });
    const score = scoreBoard(board);
    for (const [palace, ps] of Object.entries(score.palaces)) {
      for (const row of buildScoreBreakdown(ps, board.palaces[palace], score.ban_level)) {
        expect(row.desc, `${palace} ${row.key}`).toBeTruthy();
      }
    }
  });

  it('陰6局壬申の乾（空亡＋三奇入墓）は上限の行が出て、理由が書かれる', () => {
    const board = buildBoard({ date: '2026-10-02', hour: 16, boardType: '時' });
    const score = scoreBoard(board);
    const rows = buildScoreBreakdown(score.palaces.ken, board.palaces.ken, score.ban_level);
    const cap = rows.find((r) => r.key === 'veto_cap');
    expect(cap.label).toBe('上限（空亡・三奇入墓）');
    expect(cap.points).toBeLessThan(0);
    expect(cap.desc).toContain('三奇入墓');
  });
});

describe('listKakkyoku / banLevelText', () => {
  it('格局は1件目だけでなく全件返す', () => {
    const ps = { detected_kakkyoku: [{ name: '飛鳥跌穴', kichi_kyo: 'kichi', score: 10 }, { name: '天網四張', kichi_kyo: 'kyo', score: -10 }] };
    const list = listKakkyoku(ps);
    expect(list.map((k) => k.name)).toEqual(['飛鳥跌穴', '天網四張']);
    expect(list.map((k) => k.tone)).toEqual(['kichi', 'kyo']);
  });

  it('盤全体の判定は名前だけでなく意味も出す', () => {
    expect(banLevelText({ detected: ['星反吟'] })).toContain('物事が反転しやすい');
  });
});
