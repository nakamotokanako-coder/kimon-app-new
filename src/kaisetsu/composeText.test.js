// src/kaisetsu/composeText.test.js
// 解説生成エンジン Phase 2.5 の文言合成テスト。
//   TZ=Asia/Tokyo npx vitest run src/kaisetsu/

import { describe, it, expect } from 'vitest';
import { classifyPalace } from './classifyPalace.js';
import { composeText, composeDetail, AXES, FORBIDDEN_EXPRESSIONS } from './composeText.js';
import { loadChito, lookupChito } from '../kimon/loadChito.js';
import bank from '../../data/kaisetsu/kaisetsu_bank_v1.json';

const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
const len = (s) => [...s].length;

describe('composeText 決定性', () => {
  it('同一入力2回で完全一致（ランダム禁止）', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'kun');
    expect(composeText(j, 'goen', bank)).toBe(composeText(j, 'goen', bank));
    const a = composeDetail(j, 'goen', bank);
    const b = composeDetail(j, 'goen', bank);
    expect(a).toEqual(b);
  });
});

describe('composeText 全43,200件の不変条件（Phase 2.5）', () => {
  it('空文字なし / 160字以内 / full=short一致 / 禁止表現ゼロ / 空亡use無 / ▲×注意無', () => {
    const chito = loadChito();
    const bad = /。。|、。|undefined|null/;
    let count = 0;
    let worst = 0;
    const failures = [];
    const push = (why, ctx) => { if (failures.length < 8) failures.push({ why, ...ctx }); };

    for (const key of Object.keys(chito)) {
      const row = chito[key];
      for (const palace of PALACES) {
        const j = classifyPalace(row, palace);
        for (const axis of AXES) {
          const d = composeDetail(j, axis, bank);
          const { full, short, reasonSrc, thirdSrc } = d;
          count += 1;
          worst = Math.max(worst, len(full));

          if (!full || len(full) === 0) push('empty', { key, palace, axis });
          if (len(full) > 160) push('over160', { key, palace, axis, full });
          if (bad.test(full)) push('format', { key, palace, axis, full });

          // short は full の1文目と完全一致
          if (`${full.split('。')[0]}。` !== short) push('short_mismatch', { key, palace, axis, full, short });

          // 禁止表現ゼロ
          for (const w of FORBIDDEN_EXPRESSIONS) {
            if (full.includes(w) || short.includes(w)) push('forbidden', { key, palace, axis, w, full });
          }

          // 空亡セルには use 文（むしろ向いている）を出さない
          if (j.vetoes.includes('空亡')) {
            if (reasonSrc === 'use' || full.includes('むしろ向いている')) push('kuubou_use', { key, palace, axis, full });
          }

          // ▲/× ランクには注意文を生成しない（3文目は補足 or なし）
          if (j.rank === '▲' || j.rank === '×') {
            if (thirdSrc === 'veto' || thirdSrc === 'god') push('neg_caution', { key, palace, axis, full, thirdSrc });
          }
        }
      }
    }
    expect(count).toBe(43200);
    expect(worst).toBeLessThanOrEqual(160);
    expect(failures).toEqual([]);
  });
});

describe('composeText 3文目ルール（§2-2）', () => {
  it('◎/○ かつ veto 有りのセルでは veto の caution が使われる（合成判定）', () => {
    // 実データでは ◎/○ と veto は同居しない（hardVeto→×・伏吟/反吟→cap）。
    // 防御的ロジックの検証のため judgment を合成する。
    const judgment = {
      key: '_t_pos_veto', palace: 'kan',
      rank: '◎', gate: '開門', star: '天輔', starRank: 'jokichi',
      god: '六合', godClass: 'kichi', vetoes: ['空亡'], shoui: [],
    };
    const d = composeDetail(judgment, 'kinun', bank);
    expect(d.thirdSrc).toBe('veto');
    expect(d.full).toContain(bank.vetoes['空亡'].caution);
  });

  it('◎/○ かつ veto なし・凶神のセルでは god の caution が使われる（合成判定）', () => {
    const judgment = {
      key: '_t_pos_god', palace: 'kan',
      rank: '○', gate: '休門', star: '天禽', starRank: 'jokichi',
      god: '朱雀', godClass: 'kyo', vetoes: [], shoui: [],
    };
    const d = composeDetail(judgment, 'shigoto', bank);
    expect(d.thirdSrc).toBe('god');
    expect(d.full).toContain(bank.gods['朱雀'].caution);
  });
});

describe('composeText 凶の使い道（§4 / §2-3）', () => {
  it('×ランク＋傷門（空亡なし）: 「回収」を含む使い道文', () => {
    // 六儀撃刑格 で × に落とす（空亡ではない）。死門以外の凶門は使い道文が出る。
    const synthetic = {
      key: '_test_kishou',
      hachimon_kan: '傷門',
      kyusei_kan: '天蓬',
      hasshin_kan: '螣蛇',
      tenban_kan: '庚',
      chiban_kan: '戊',
      jukkan_kokuou_kan: '',
      kakkyoku_kan: '×六儀撃刑格',
      ban_level: '',
      kuubou: '',
    };
    const j = classifyPalace(synthetic, 'kan');
    expect(j.rank).toBe('×');
    expect(j.vetoes).toContain('六儀撃刑');
    expect(j.vetoes).not.toContain('空亡');
    const d = composeDetail(j, 'kinun', bank);
    expect(d.reasonSrc).toBe('use');
    expect(d.full).toContain('回収');
  });

  it('空亡セルでは使い道文（むしろ向いている）を出さない（§2-3）', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'ken'); // ken=空亡・×
    expect(j.vetoes).toContain('空亡');
    const d = composeDetail(j, 'kinun', bank);
    expect(d.reasonSrc).not.toBe('use');
    expect(d.full).not.toContain('むしろ向いている');
  });

  it('死門は弔事用途のため「むしろ向いている」使い道文を出さない', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'son'); // son=死門, ×
    expect(j.gate).toBe('死門');
    const d = composeDetail(j, 'kinun', bank);
    expect(d.reasonSrc).not.toBe('use');
    expect(d.full).not.toContain('むしろ向いている');
  });
});

describe('composeText 代表ケース', () => {
  it('陰1局丁卯×南西(kun)×ご縁: 「ご縁」を含む結論文＋吉象意の理由文', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'kun');
    const d = composeDetail(j, 'goen', bank);
    expect(d.full).toContain('ご縁');
    expect(d.reasonSrc).toBe('shoui');
    expect(len(d.full)).toBeLessThanOrEqual(160);
  });
});
