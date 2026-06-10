// src/kaisetsu/classifyPalace.test.js
// 解説生成エンジン Phase 1 の宮別判定テスト。
// 固定ケースは陰1局丁卯/甲子のサンプル解説と整合させる（指示書 §3）。
//   TZ=Asia/Tokyo npx vitest run src/kaisetsu/

import { describe, it, expect } from 'vitest';
import { classifyPalace, PRIORITY_ORDER, RANK_LADDER } from './classifyPalace.js';
import { lookupChito } from '../kimon/loadChito.js';
import shouiPriority from '../../data/shoui_priority.json';

const rankIdx = (r) => RANK_LADDER.indexOf(r);

describe('classifyPalace 固定ケース（陰1局丁卯）', () => {
  const row = lookupChito('陰1局丁卯');

  it('kun(南西): 開門×九地×丙奇得使 → ◎', () => {
    const j = classifyPalace(row, 'kun');
    expect(j.rank).toBe('◎');
    expect(j.gate).toBe('開門');
    expect(j.god).toBe('九地');
    expect(j.shoui).toContain('丙奇得使');
  });

  it('ken(北西): 生門でも空亡が勝つ → ×', () => {
    const j = classifyPalace(row, 'ken');
    expect(j.vetoes).toContain('空亡');
    expect(j.rank).toBe('×');
  });

  it('son(南東): 死門は直符・青龍耀明があっても × ', () => {
    const j = classifyPalace(row, 'son');
    expect(j.gate).toBe('死門');
    expect(j.rank).toBe('×');
  });

  it('gon(北東): 杜門が艮 → 凶門被迫 kyomon_hisako', () => {
    const j = classifyPalace(row, 'gon');
    expect(j.gateForce).toBe('kyomon_hisako');
  });
});

describe('classifyPalace 盤レベル拒否権', () => {
  it('陰1局甲子(伏吟局): 全宮 rank が ▲ 以下', () => {
    const row = lookupChito('陰1局甲子');
    const palaces = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
    for (const p of palaces) {
      const j = classifyPalace(row, p);
      expect(rankIdx(j.rank)).toBeLessThanOrEqual(rankIdx('▲'));
      expect(j.vetoes).toContain('伏吟');
    }
  });

  it('天網四張(陰1局甲子×kun): veto 発動で ×', () => {
    const row = lookupChito('陰1局甲子');
    const j = classifyPalace(row, 'kun');
    expect(j.vetoes).toContain('天網四張');
    expect(j.rank).toBe('×');
  });

  it('五不遇時: 象意に含まれれば吉門でも veto 発動で ×（合成ロウで検証）', () => {
    // 五不遇時は時盤専用（日干×時干）で chito CSV には事前計算されないため合成入力で確認する。
    const synthetic = {
      hachimon_kan: '生門',
      kyusei_kan: '天蓬',
      hasshin_kan: '直符',
      tenban_kan: '丙',
      chiban_kan: '戊',
      jukkan_kokuou_kan: '×五不遇時',
      kakkyoku_kan: '',
      ban_level: '',
      kuubou: '',
    };
    const j = classifyPalace(synthetic, 'kan');
    expect(j.vetoes).toContain('五不遇時');
    expect(j.rank).toBe('×');
  });
});

describe('反吟の奇門緩和', () => {
  it('三奇＋三吉門 同居の宮は △ まで緩和し vetoRelief を立てる', () => {
    const synthetic = {
      hachimon_kan: '生門',     // 三吉門
      kyusei_kan: '天禽',
      hasshin_kan: '六合',
      tenban_kan: '乙',         // 三奇
      chiban_kan: '戊',
      jukkan_kokuou_kan: '',
      kakkyoku_kan: '',
      ban_level: '反吟',
      kuubou: '',
    };
    const j = classifyPalace(synthetic, 'kan');
    expect(j.vetoes).toContain('反吟');
    expect(j.vetoRelief).toBe('反吟だが奇門が蓋う');
    expect(j.rank).toBe('△');
  });
});

describe('shoui_priority.json との同期（ドリフト検出）', () => {
  it('PRIORITY_ORDER は data/shoui_priority.json の priority_order と一致', () => {
    expect(PRIORITY_ORDER).toEqual(shouiPriority.priority_order);
  });
});

describe('judgment オブジェクトの形', () => {
  it('指示書のキーを全て備える', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'kun');
    for (const k of [
      'rank', 'vetoes', 'vetoRelief', 'gate', 'gateClass', 'gateForce',
      'star', 'starRank', 'god', 'godClass', 'shoui', 'axes', 'patternId',
    ]) {
      expect(j).toHaveProperty(k);
    }
    for (const a of ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo']) {
      expect(j.axes).toHaveProperty(a);
      expect(j.axes[a]).toBeGreaterThanOrEqual(-2);
      expect(j.axes[a]).toBeLessThanOrEqual(2);
    }
  });
});
