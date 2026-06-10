// src/kaisetsu/composeText.test.js
// 解説生成エンジン Phase 2 の文言合成テスト。
//   TZ=Asia/Tokyo npx vitest run src/kaisetsu/

import { describe, it, expect } from 'vitest';
import { classifyPalace } from './classifyPalace.js';
import { composeText, composeDetail, AXES } from './composeText.js';
import { loadChito, lookupChito } from '../kimon/loadChito.js';
import bank from '../../data/kaisetsu/kaisetsu_bank_v1.json';

const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
const len = (s) => [...s].length;

describe('composeText 決定性', () => {
  it('同一入力2回で完全一致（ランダム禁止）', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'kun');
    expect(composeText(j, 'goen', bank)).toBe(composeText(j, 'goen', bank));
  });
});

describe('composeText 全43,200件の不変条件', () => {
  it('空文字なし / 120字以内 / 「。。」「、。」「undefined」「null」混入なし', () => {
    const chito = loadChito();
    const bad = /。。|、。|undefined|null/;
    let count = 0;
    let worst = 0;
    const failures = [];
    for (const key of Object.keys(chito)) {
      const row = chito[key];
      for (const palace of PALACES) {
        const j = classifyPalace(row, palace);
        for (const axis of AXES) {
          const text = composeText(j, axis, bank);
          count += 1;
          worst = Math.max(worst, len(text));
          if (!text || len(text) === 0 || len(text) > 120 || bad.test(text)) {
            if (failures.length < 5) failures.push({ key, palace, axis, text });
          }
        }
      }
    }
    expect(count).toBe(43200);
    expect(worst).toBeLessThanOrEqual(120);
    expect(failures).toEqual([]);
  });
});

describe('composeText 代表ケース', () => {
  it('陰1局丁卯×南西(kun)×ご縁: 「ご縁」を含む結論文＋吉象意の理由文', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'kun');
    const d = composeDetail(j, 'goen', bank);
    expect(d.text).toContain('ご縁');
    // 実データでは吉象意（華蓋孛師/日月併用 等）が理由文に優先される
    // （指示書の「開門系」想定は不発。完了報告に記載）。
    expect(d.reasonSrc).toBe('shoui');
    expect(len(d.text)).toBeLessThanOrEqual(120);
  });

  it('陰1局丁卯×北西(ken)×金運: 空亡の veto 文言を含む', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'ken');
    expect(j.vetoes).toContain('空亡');
    const text = composeText(j, 'kinun', bank);
    expect(text).toContain(bank.vetoes['空亡'].phrase);
  });

  it('×ランク＋傷門: 「回収」を含む使い道文（凶の使い道）', () => {
    // 傷門(基礎▲)＋空亡 で × に落ちるセルを合成。死門以外の凶門は使い道文が出る。
    const synthetic = {
      key: '_test_kishou',
      hachimon_kan: '傷門',
      kyusei_kan: '天蓬',
      hasshin_kan: '螣蛇',
      tenban_kan: '庚',
      chiban_kan: '戊',
      jukkan_kokuou_kan: '',
      kakkyoku_kan: '',
      ban_level: '',
      kuubou: '子', // 坎=子 → 空亡 veto
    };
    const j = classifyPalace(synthetic, 'kan');
    expect(j.rank).toBe('×');
    const d = composeDetail(j, 'kinun', bank);
    expect(d.reasonSrc).toBe('use');
    expect(d.text).toContain('回収');
  });

  it('死門は弔事用途のため「むしろ向いている」使い道文を出さない', () => {
    // 死門(use=弔事・供養のみ)は §4 の使い道文の対象外
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'son'); // son=死門, ×
    expect(j.gate).toBe('死門');
    const d = composeDetail(j, 'kinun', bank);
    expect(d.reasonSrc).not.toBe('use');
    expect(d.text).not.toContain('むしろ向いている');
  });
});
