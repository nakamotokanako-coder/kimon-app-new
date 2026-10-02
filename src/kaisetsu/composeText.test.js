// src/kaisetsu/composeText.test.js
// 解説生成エンジン full v2 の文言合成テスト。
//   TZ=Asia/Tokyo npx vitest run src/kaisetsu/
//
// 出力は short(結論1文) / mid(現行3文・文面不変) / full(v2・5〜6文の鑑定文) の3パターン。
//   - mid/short は Phase 2.5 から文面不変（差分ゼロ）。ハッシュで全件ロックする。
//   - full は §2-2 の構成（結論→主役→補強→なのに→行動提案→締め）＋追加スロット(hint/exception/general)。

import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { classifyPalace } from './classifyPalace.js';
import { composeText, composeDetail, AXES, FORBIDDEN_EXPRESSIONS } from './composeText.js';
import { loadChito, lookupChito } from '../kimon/loadChito.js';
import bank from '../../data/kaisetsu/kaisetsu_bank_v1.json';

const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
const len = (s) => [...s].length;

// 全件ハッシュ（sorted走査）の回帰防止ロック。
// short は API 経由で本番表示中のため恒久ロック（v2.1 でも不変＝据え置き）。
// mid は v2.1（低頻度象意74種の phrase 改訂）で変化するため、再生成後の値へ更新。
// fix-chito-inyo7-hachimon: chito_v2 の「陰7局丁亥」行hachimon対冲入れ替わり
// 修正に伴い、同キー8宮ぶんの解説文が変化したため再度更新。
// PR-V1 三大凶格拒否権追加による意図的な更新。影響250宮
// palace-veto-policy: 空亡＋開休生門の宮を×固定から「上限○・遅れて届きやすい」注記へ
// 変更したため、該当宮の short/mid が変化（docs/palace_veto_policy_v1.md・意図した変更）。
// kaisetsu-axis-rank: 文章の吉凶を総合ランクから軸ランク（テーマ別◎○×）基準へ変更し、
// 逆向きフレーズ・吉神/吉星の褒め文・重複文・「です、」連結を除去（全件監査で矛盾0件・意図した変更）。
const MID_SORTED_SHA256 = '17c2c45e7ed335d448774d083a85bc923ceeb1bc55581d863435b7ea39201f4f';
// fix-chito-inyo7-hachimon: 同上の理由で short も更新（本番表示中のため
// このPRのマージ＝本番の解説文字列も変わることを意味する。意図した変更）。
// PR-V1 三大凶格拒否権追加による意図的な更新。影響250宮
// palace-veto-policy: 同上（空亡＋開休生門の543宮）。
// kaisetsu-axis-rank: 同上（結論文は軸ランクの骨子から選ぶ。「この盤で最も」は比較できないため廃止。
// 「健康の用事」「金運を動かす」等の不自然な言い回しは {topic}（bank.axisTopics）で置き換え）。
const SHORT_SORTED_SHA256 = '6f05ec07178c1932792ae97e4b7dc18220a7bbca9a2b9573dc9a43cf7f27e4b0';

describe('composeText 決定性', () => {
  it('同一入力2回で完全一致（ランダム禁止・full含む）', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'kun');
    expect(composeText(j, 'goen', bank)).toBe(composeText(j, 'goen', bank));
    expect(composeDetail(j, 'goen', bank)).toEqual(composeDetail(j, 'goen', bank));
  });
});

describe('full v2 全43,200件の不変条件', () => {
  it('full: 空なし / 320字以内 / 整形崩れなし / 禁止表現ゼロ / short=full・midの1文目', () => {
    const chito = loadChito();
    const bad = /。。|、。|undefined|null/;
    let count = 0;
    let worstFull = 0;
    let worstMid = 0;
    const failures = [];
    const push = (why, ctx) => { if (failures.length < 8) failures.push({ why, ...ctx }); };

    for (const key of Object.keys(chito)) {
      const row = chito[key];
      for (const palace of PALACES) {
        const j = classifyPalace(row, palace);
        for (const axis of AXES) {
          const { full, mid, short } = composeDetail(j, axis, bank);
          count += 1;
          worstFull = Math.max(worstFull, len(full));
          worstMid = Math.max(worstMid, len(mid));

          if (!full || len(full) === 0) push('empty_full', { key, palace, axis });
          if (len(full) > 320) push('over320', { key, palace, axis, full });
          if (len(mid) > 160) push('mid_over160', { key, palace, axis, mid });
          if (bad.test(full)) push('format', { key, palace, axis, full });

          // short は full・mid の1文目と完全一致
          if (short !== `${full.split('。')[0]}。`) push('short_vs_full', { key, palace, axis, full, short });
          if (short !== `${mid.split('。')[0]}。`) push('short_vs_mid', { key, palace, axis, mid, short });

          for (const w of FORBIDDEN_EXPRESSIONS) {
            if (full.includes(w) || mid.includes(w) || short.includes(w)) push('forbidden', { key, palace, axis, w, full });
          }
        }
      }
    }
    expect(count).toBe(43200);
    expect(worstFull).toBeLessThanOrEqual(320);
    expect(worstMid).toBeLessThanOrEqual(160);
    expect(failures).toEqual([]);
  }, 30000); // 全43,200件を合成するため並列実行時は5秒を超えうる

  it('short・mid は改修前と全件一致（差分ゼロ・ハッシュロック）', () => {
    const chito = loadChito();
    const mids = [];
    const shorts = [];
    for (const key of Object.keys(chito).sort()) {
      const row = chito[key];
      for (const palace of [...PALACES].sort()) {
        const j = classifyPalace(row, palace);
        for (const axis of [...AXES].sort()) {
          const d = composeDetail(j, axis, bank);
          mids.push(d.mid);
          shorts.push(d.short);
        }
      }
    }
    const midHash = createHash('sha256').update(mids.join('')).digest('hex');
    const shortHash = createHash('sha256').update(shorts.join('')).digest('hex');
    expect(midHash).toBe(MID_SORTED_SHA256);
    expect(shortHash).toBe(SHORT_SORTED_SHA256);
  }, 30000); // 全43,200件を合成するため並列実行時は5秒を超えうる
});

describe('full v2 代表ケース（§2-4）', () => {
  it('陰1局丁卯×南西(kun)×仕事(軸◎): 主役=象意「丙」＋補強=神「九地」', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'kun');
    expect(j.axisRanks.shigoto).toBe('◎');
    const d = composeDetail(j, 'shigoto', bank);
    expect(d.full).toContain('丙');
    expect(d.full).toContain('九地');
  });

  it('文章の吉凶は軸ランクに従う: 総合◎でも軸△のご縁は絶賛文・結論を出さない', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'kun');
    expect(j.rank).toBe('◎');
    expect(j.axisRanks.goen).toBe('△');
    const d = composeDetail(j, 'goen', bank);
    expect(bank.skeletons['△'].map((t) => t.replace('{axis}', 'ご縁').replace('{topic}', bank.axisTopics.goen).replace('{start}', bank.axisStarts.goen))).toContain(d.short);
    expect(d.full).not.toContain('最大限に働く');
  });

  it('凶の軸に吉門の「追い風」フレーズ・吉神の同居文を付けない', () => {
    const j = classifyPalace(lookupChito('陰1局甲子'), 'ken'); // 開門・螣蛇、ご縁×
    expect(j.axisRanks.goen).toBe('×');
    const d = composeDetail(j, 'goen', bank);
    expect(d.mid).not.toContain('追い風');
    const k = classifyPalace(lookupChito('陰1局甲子'), 'shin'); // 九地、ご縁×
    expect(k.axisRanks.goen).toBe('×');
    expect(composeDetail(k, 'goen', bank).full).not.toContain('長く続く土台');
  });

  it('健康以外の軸に天心の「通院や検査」を出さない', () => {
    const j = classifyPalace(lookupChito('陰1局癸未'), 'kan');
    expect(j.star).toBe('天心');
    expect(composeDetail(j, 'goen', bank).full).not.toContain('通院');
  });

  it('陰1局丁丑×南西(kun)×金運: 主役=veto「空亡」＋なのに文(好材料負け型)', () => {
    const j = classifyPalace(lookupChito('陰1局丁丑'), 'kun');
    const d = composeDetail(j, 'kinun', bank);
    expect(d.full).toContain('空亡');
    expect(d.full).toContain('入ってはいるものの');
  });

  it('陰1局丁卯×北西(ken)×金運: 空亡＋生門は凶にせず「遅れて届きやすい」で締める', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'ken');
    const d = composeDetail(j, 'kinun', bank);
    expect(d.full).not.toContain('入ってはいるものの');
    expect(d.full.startsWith('空亡')).toBe(false);
    expect(d.mid).toContain('遅れて届きやすい');
    expect(d.full).toContain('遅れて届きやすい');
  });

  it('陰1局丁卯×南東(son)×仕事: 門主役(死門)＋行動提案(終わらせる)', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'son');
    expect(j.gate).toBe('死門');
    const d = composeDetail(j, 'shigoto', bank);
    expect(d.full.includes('死門') || d.full.includes('動きを止める')).toBe(true);
    expect(d.full).toContain('終わらせる');
  });

  it('◎○ランクで凶神同居: なのに文(悪材料負け型)「も同居していますが」', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'da'); // ご縁◎・朱雀（凶神）・主役は象意
    expect(['◎', '○']).toContain(j.axisRanks.goen);
    expect(j.godClass === 'kyo' || j.godClass === 'kyo_muko').toBe(true);
    const d = composeDetail(j, 'goen', bank);
    expect(d.nanoniType).toBe('warukinai');
    expect(d.full).toContain('も同居していますが');
  });

  it('修正(b) 門主役×悪材料負け: 支配要素が主役の門と同一なら なのに文を省略し、門ラベルは1回のみ', () => {
    const j = classifyPalace(lookupChito('陰1局丙寅'), 'gon'); // ◎・休門(門主役)・螣蛇(凶神)
    expect(['◎', '○']).toContain(j.rank);
    expect(j.godClass === 'kyo' || j.godClass === 'kyo_muko').toBe(true);
    const d = composeDetail(j, 'goen', bank);
    expect(d.nanoniType).not.toBe('warukinai'); // 主役の門と支配要素が同一 → 省略
    const label = bank.gates[j.gate].label;
    expect(d.full.split(label).length - 1).toBe(1); // 門ラベルは1回だけ
  });

  it('修正(c) ×ランク×kichi3門の full 全件: 行動提案を出さず「向いています」を含まない', () => {
    const chito = loadChito();
    const offenders = [];
    for (const key of Object.keys(chito)) {
      const row = chito[key];
      for (const palace of PALACES) {
        const j = classifyPalace(row, palace);
        if (j.rank !== '×' || j.gateClass !== 'kichi3') continue;
        for (const axis of AXES) {
          const d = composeDetail(j, axis, bank);
          if ((d.actionUsed || d.full.includes('向いています')) && offenders.length < 5) {
            offenders.push({ key, palace, axis, full: d.full });
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('死門×goen以外の軸の full 全件: 「むしろ向いています」を含まない', () => {
    const chito = loadChito();
    const offenders = [];
    for (const key of Object.keys(chito)) {
      const row = chito[key];
      for (const palace of PALACES) {
        const j = classifyPalace(row, palace);
        if (j.gate !== '死門') continue;
        for (const axis of AXES) {
          if (axis === 'goen') continue;
          const full = composeText(j, axis, bank);
          if (full.includes('むしろ向いています') && offenders.length < 5) offenders.push({ key, palace, axis, full });
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ====================================================================
// mid（現行3文構成・Phase 2.5）の不変ルール。full v2 でも挙動を維持する。
// ====================================================================
describe('mid 3文目ルール（§2-2 Phase 2.5）', () => {
  it('◎/○ かつ veto 有りのセルでは veto の caution が mid に使われる（合成判定）', () => {
    const judgment = {
      key: '_t_pos_veto', palace: 'kan',
      rank: '◎', gate: '開門', gateClass: 'kichi3', star: '天輔', starRank: 'jokichi',
      god: '六合', godClass: 'kichi', vetoes: ['空亡'], shoui: [],
    };
    const d = composeDetail(judgment, 'kinun', bank);
    expect(d.thirdSrc).toBe('veto');
    expect(d.mid).toContain(bank.vetoes['空亡'].caution);
  });

  it('◎/○ かつ veto なし・凶神のセルでは god の caution が mid に使われる（合成判定）', () => {
    const judgment = {
      key: '_t_pos_god', palace: 'kan',
      rank: '○', gate: '休門', gateClass: 'kichi3', star: '天禽', starRank: 'jokichi',
      god: '朱雀', godClass: 'kyo', vetoes: [], shoui: [],
    };
    const d = composeDetail(judgment, 'shigoto', bank);
    expect(d.thirdSrc).toBe('god');
    expect(d.mid).toContain(bank.gods['朱雀'].caution);
  });
});

describe('mid 凶の使い道（§4 / §2-3）', () => {
  it('×ランク＋傷門（空亡なし）: mid に「回収」を含む使い道文', () => {
    const synthetic = {
      key: '_test_kishou',
      hachimon_kan: '傷門', kyusei_kan: '天蓬', hasshin_kan: '螣蛇',
      tenban_kan: '庚', chiban_kan: '戊', jukkan_kokuou_kan: '',
      kakkyoku_kan: '×六儀撃刑格', ban_level: '', kuubou: '',
    };
    const j = classifyPalace(synthetic, 'kan');
    expect(j.rank).toBe('×');
    expect(j.vetoes).toContain('六儀撃刑');
    expect(j.vetoes).not.toContain('空亡');
    const d = composeDetail(j, 'kinun', bank);
    expect(d.reasonSrc).toBe('use');
    expect(d.mid).toContain('回収');
  });

  it('空亡セルでは mid に使い道文（むしろ向いている）を出さない（§2-3）', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'ken'); // ken=空亡・×
    expect(j.vetoes).toContain('空亡');
    const d = composeDetail(j, 'kinun', bank);
    expect(d.reasonSrc).not.toBe('use');
    expect(d.mid).not.toContain('むしろ向いている');
  });

  it('死門は弔事用途のため mid に「むしろ向いている」使い道文を出さない', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'son'); // son=死門, ×
    expect(j.gate).toBe('死門');
    const d = composeDetail(j, 'kinun', bank);
    expect(d.reasonSrc).not.toBe('use');
    expect(d.mid).not.toContain('むしろ向いている');
  });
});

describe('mid 代表ケース', () => {
  it('陰1局丁卯×南西(kun)×仕事: mid は「仕事」を含む結論文＋吉象意の理由文・160字以内', () => {
    const j = classifyPalace(lookupChito('陰1局丁卯'), 'kun');
    const d = composeDetail(j, 'shigoto', bank);
    expect(d.mid).toContain('仕事');
    expect(d.reasonSrc).toBe('shoui');
    expect(len(d.mid)).toBeLessThanOrEqual(160);
  });
});
