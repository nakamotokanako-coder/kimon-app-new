// src/kaisetsu/classifyPalace.test.js
// 解説生成エンジン Phase 1 の宮別判定テスト。
// 固定ケースは陰1局丁卯/甲子のサンプル解説と整合させる（指示書 §3）。
//   TZ=Asia/Tokyo npx vitest run src/kaisetsu/

import { describe, it, expect } from 'vitest';
import {
  HOMONYM_JUKKAN, resolveShouiVariants, classifyPalace, PRIORITY_ORDER, RANK_LADDER, axisCapForTotal, capAxisRanks,
} from './classifyPalace.js';
import { loadChito, lookupChito } from '../kimon/loadChito.js';
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

  it('ken(北西): 空亡でも生門が同宮なら×にしない（docs/palace_veto_policy_v1.md）。総合点が0点なので△まで', () => {
    const j = classifyPalace(row, 'ken');
    expect(j.vetoes).toEqual(['空亡']);
    expect(j.gate).toBe('生門');
    expect(j.kuubouRelief).toBe(true);
    expect(j.totalScore).toBe(0);
    expect(j.rank).toBe('△');
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
  it('陰1局甲子(伏吟局): 全宮 rank が ○ 以下。吉になるのは総合点がプラスの方位（休門＋直符の坎）だけ', () => {
    const row = lookupChito('陰1局甲子');
    const palaces = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
    for (const p of palaces) {
      const j = classifyPalace(row, p);
      expect(rankIdx(j.rank)).toBeLessThanOrEqual(rankIdx('○'));
      expect(j.vetoes).toContain('伏吟');
      const hasGood = Object.values(j.axisRanks).some((r) => r === '○' || r === '◎');
      expect(hasGood).toBe(p === 'kan');
      expect(Object.values(j.axisRanks)).not.toContain('◎');
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
  it('三奇＋三吉門 同居の宮は vetoRelief を立て、反吟でも抑えない（docs/hangin_policy_v1.md）', () => {
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
    const plain = classifyPalace({ ...synthetic, ban_level: '' }, 'kan');
    expect(j.rank).toBe(plain.rank);
    expect(j.axisRanks).toEqual(plain.axisRanks);
  });
});

describe('axisRanks', () => {
  const axisKeys = ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo'];

  it('標準的な吉方位は axes 由来の軸別 rank を返す', () => {
    const synthetic = {
      hachimon_kan: '開門',
      kyusei_kan: '天禽',
      hasshin_kan: '直符',
      tenban_kan: '戊',
      chiban_kan: '庚',
      jukkan_kokuou_kan: '',
      kakkyoku_kan: '',
      ban_level: '',
      kuubou: '',
    };
    const j = classifyPalace(synthetic, 'kan');
    expect(j.axisRanks).toEqual({
      goen: '△',
      shigoto: '◎',
      kinun: '△',
      kenko: '△',
      benkyo: '○',
    });
  });

  it('標準的な凶方位は全軸が ×〜▲ に収まる', () => {
    const synthetic = {
      hachimon_kan: '死門',
      kyusei_kan: '天蓬',
      hasshin_kan: '玄武',
      tenban_kan: '壬',
      chiban_kan: '戊',
      jukkan_kokuou_kan: '',
      kakkyoku_kan: '',
      ban_level: '',
      kuubou: '',
    };
    const j = classifyPalace(synthetic, 'kan');
    expect(Object.values(j.axisRanks).every((rank) => rankIdx(rank) <= rankIdx('▲'))).toBe(true);
  });

  it('伏吟は門・星の性質を残し、◎だけ ○ に抑える（docs/axis_score_alignment_v2.md）', () => {
    const synthetic = {
      hachimon_kan: '休門',
      kyusei_kan: '天禽',
      hasshin_kan: '六合',
      tenban_kan: '戊',
      chiban_kan: '庚',
      jukkan_kokuou_kan: '',
      kakkyoku_kan: '',
      ban_level: '伏吟',
      kuubou: '',
    };
    const j = classifyPalace(synthetic, 'kan');
    expect(j.vetoes).toContain('伏吟');
    expect(j.axes.goen).toBe(2); // 伏吟でなければ ◎
    expect(j.axisRanks).toEqual({
      goen: '○',
      shigoto: '○',
      kinun: '△',
      kenko: '○',
      benkyo: '△',
    });
  });

  it('反吟（緩和なし）は門の性質を残し、◎だけ○に抑える（全軸×にしない）', () => {
    const base = {
      hachimon_kan: '生門',
      kyusei_kan: '天心',
      hasshin_kan: '九地',
      tenban_kan: '戊',
      chiban_kan: '庚',
      jukkan_kokuou_kan: '',
      kakkyoku_kan: '',
      kuubou: '',
    };
    const plain = classifyPalace({ ...base, ban_level: '' }, 'kan');
    const hangin = classifyPalace({ ...base, ban_level: '反吟' }, 'kan');
    expect(Object.values(plain.axisRanks)).toContain('◎');
    expect(hangin.vetoes).toContain('反吟');
    expect(hangin.vetoRelief).toBe(null);
    expect(Object.values(hangin.axisRanks)).not.toContain('◎');
    for (const k of axisKeys) {
      expect(hangin.axisRanks[k]).toBe(plain.axisRanks[k] === '◎' ? '○' : plain.axisRanks[k]);
    }
    expect(['◎']).not.toContain(hangin.rank);
  });

  it('反吟でも凶の門は凶のまま（生在生兮死在死）', () => {
    const j = classifyPalace({
      hachimon_kan: '死門', kyusei_kan: '天禽', hasshin_kan: '六合', tenban_kan: '戊', chiban_kan: '庚',
      jukkan_kokuou_kan: '', kakkyoku_kan: '', ban_level: '反吟', kuubou: '',
    }, 'kan');
    for (const r of Object.values(j.axisRanks)) expect(['▲', '×']).toContain(r);
  });

  it('空亡の宮（開休生門なし）は全軸 × に固定する', () => {
    const j = classifyPalace(lookupChito('陰1局丁丑'), 'kun');
    expect(j.vetoes).toEqual(['空亡']);
    expect(j.kuubouRelief).toBe(false);
    expect(new Set(Object.values(j.axisRanks))).toEqual(new Set(['×']));
  });

  it('空亡＋開休生門の宮は軸別も上限○（◎・×固定にしない）', () => {
    const j = classifyPalace(lookupChito('陰1局庚辰'), 'da');
    expect(j.kuubouRelief).toBe(true);
    expect(Object.values(j.axisRanks)).not.toContain('◎');
    expect(Object.values(j.axisRanks)).toContain('○');
  });

  it('空亡に三奇入墓が重なれば吉門でも × 固定（陰6局壬申・乾）', () => {
    const j = classifyPalace(lookupChito('陰6局壬申'), 'ken');
    expect(j.gate).toBe('休門');
    expect(j.vetoes).toEqual(['空亡', '三奇入墓']);
    expect(j.kuubouRelief).toBe(false);
    expect(j.rank).toBe('×');
    expect(new Set(Object.values(j.axisRanks))).toEqual(new Set(['×']));
  });

  it('総合 rank が × のとき軸別 rank に ◎ を出さない', () => {
    const row = lookupChito('陰1局丁卯');
    for (const palace of ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken']) {
      const j = classifyPalace(row, palace);
      if (j.rank === '×') {
        expect(Object.values(j.axisRanks)).not.toContain('◎');
      }
    }
  });

  it('全軸キーを備える', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'kun');
    expect(Object.keys(j.axisRanks)).toEqual(axisKeys);
  });
});

describe('shoui_priority.json との同期（ドリフト検出）', () => {
  it('PRIORITY_ORDER は data/shoui_priority.json の priority_order と一致', () => {
    expect(PRIORITY_ORDER).toEqual(shouiPriority.priority_order);
  });
});

describe('テーマ別の◎○×は総合点を超えない（docs/axis_score_alignment_v2.md）', () => {
  const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];

  it('上限の区切り: 凶→▲ / 0点→△ / 1〜39点→○ / 40点以上→◎。三大凶格は点数にかかわらず▲', () => {
    expect(axisCapForTotal(-10)).toBe('▲');
    expect(axisCapForTotal(0)).toBe('△');
    expect(axisCapForTotal(10)).toBe('○');
    expect(axisCapForTotal(39)).toBe('○');
    expect(axisCapForTotal(40)).toBe('◎');
    expect(axisCapForTotal(90, true)).toBe('▲');
    expect(capAxisRanks({ goen: '◎', kinun: '×' }, '○')).toEqual({ goen: '○', kinun: '×' });
    expect(capAxisRanks({ goen: '◎' }, null)).toEqual({ goen: '◎' });
  });

  it('総合が凶の方位は、吉の象意があってもテーマ別を▲までにする（陰1局丁卯・坎＝傷門＋天乙会合）', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'kan');
    expect(j.totalScore).toBeLessThan(0);
    expect(j.totalCap).toBe('▲');
    expect(new Set(Object.values(j.axisRanks))).toEqual(new Set(['▲']));
  });

  it('全1080局×8宮×時盤・日盤: テーマ別も総ランクも、総合点から決まる上限を超えない', () => {
    for (const row of Object.values(loadChito())) {
      for (const p of PALACES) {
        for (const boardType of ['時', '日']) {
          const j = classifyPalace(row, p, { boardType });
          expect(rankIdx(j.rank)).toBeLessThanOrEqual(rankIdx(j.totalCap));
          for (const r of Object.values(j.axisRanks)) expect(rankIdx(r)).toBeLessThanOrEqual(rankIdx(j.totalCap));
          if (j.totalScore < 0) expect(j.totalCap).toBe('▲');
        }
      }
    }
  });
});

describe('judgment オブジェクトの形', () => {
  it('指示書のキーを全て備える', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'kun');
    for (const k of [
      'rank', 'vetoes', 'vetoRelief', 'gate', 'gateClass', 'gateForce',
      'star', 'starRank', 'god', 'godClass', 'shoui', 'shouiTop', 'axes', 'axisRanks', 'totalScore', 'totalCap', 'patternId',
    ]) {
      expect(j).toHaveProperty(k);
    }
    // patternId は5キー構成（shouiTop を含まない）
    expect(j.patternId.split('_')).toHaveLength(5);
    expect(j.patternId).toBe('◎_kichi3_shokichi_kichi_none');
    // shouiTop は別フィールドとして残り、言及順トップの象意（shoui[0]）と一致
    expect(j.shouiTop).toBe(j.shoui[0]);
    for (const a of ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo']) {
      expect(j.axes).toHaveProperty(a);
      expect(j.axisRanks).toHaveProperty(a);
      expect(j.axes[a]).toBeGreaterThanOrEqual(-2);
      expect(j.axes[a]).toBeLessThanOrEqual(2);
      expect(RANK_LADDER).toContain(j.axisRanks[a]);
    }
  });
});

describe('同じ名前で意味が違う十干剋応（shouiVariant）', () => {
  it('HOMONYM_JUKKAN は shoui_dict.json の同名エントリと一致する', async () => {
    const { readFileSync } = await import('node:fs');
    const dict = JSON.parse(readFileSync(new URL('../../data/shoui_dict.json', import.meta.url), 'utf8'));
    const expected = {};
    for (const [name, nos] of Object.entries(dict.jukan_index_by_name)) {
      if (nos.length > 1) for (const no of nos) expected[no] = name;
    }
    expect(HOMONYM_JUKKAN).toEqual(expected);
  });

  it('華蓋孛師: 癸＋丙は 74（吉）、丙＋癸は 18（凶）', () => {
    expect(resolveShouiVariants('癸', '丙', ['華蓋孛師'])).toEqual({ 華蓋孛師: 74 });
    expect(resolveShouiVariants('丙', '癸', ['華蓋孛師'])).toEqual({ 華蓋孛師: 18 });
    expect(resolveShouiVariants('乙癸', '丙', ['華蓋孛師'])).toEqual({ 華蓋孛師: 74 }); // 寄宮で2文字
    expect(resolveShouiVariants('癸', '丙', ['別の象意'])).toEqual({});
  });
});
