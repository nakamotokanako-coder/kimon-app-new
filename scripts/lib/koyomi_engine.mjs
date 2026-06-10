// koyomi v4 埋め戻しエンジン（純関数群）。データソース非依存。
import { solarTermsForYear, solstice } from './astro.mjs';

export const STEMS = '甲乙丙丁戊己庚辛壬癸';
export const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
export function kanshiIndex(eto) {
  const s = STEMS.indexOf(eto[0]); const b = BRANCHES.indexOf(eto[1]);
  if (s < 0 || b < 0) return -1;
  for (let i = 0; i < 60; i++) if (i % 10 === s && i % 12 === b) return i;
  return -1;
}
export const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const dayDiff = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000);

// 三元局数表（節気,三元 -> 局数）。v3 実データ(2003-2019)から抽出・0衝突で確定済み。
// 順序は陰陽遁の進行順（冬至起点）。
export const SEKKI_ORDER = [
  '冬至', '小寒', '大寒', '立春', '雨水', '啓蟄', '春分', '清明', '穀雨', '立夏', '小満', '芒種',
  '夏至', '小暑', '大暑', '立秋', '処暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪',
];
const GENS = ['上元', '中元', '下元'];
// [上,中,下] の局数（数字）。陽=冬至..芒種, 陰=夏至..大雪。
const KYOKU_NUM = {
  冬至: [1, 7, 4], 小寒: [2, 8, 5], 大寒: [3, 9, 6], 立春: [8, 5, 2], 雨水: [9, 6, 3], 啓蟄: [1, 7, 4],
  春分: [3, 9, 6], 清明: [4, 1, 7], 穀雨: [5, 2, 8], 立夏: [4, 1, 7], 小満: [5, 2, 8], 芒種: [6, 3, 9],
  夏至: [9, 3, 6], 小暑: [8, 2, 5], 大暑: [7, 1, 4], 立秋: [2, 5, 8], 処暑: [1, 4, 7], 白露: [9, 3, 6],
  秋分: [7, 1, 4], 寒露: [6, 9, 3], 霜降: [5, 8, 2], 立冬: [6, 9, 3], 小雪: [5, 8, 2], 大雪: [4, 7, 1],
};
export function isYang(sekki) { return SEKKI_ORDER.indexOf(sekki) < 12; }
/** (節気, 三元) -> 局数文字列 例 "陽1局" */
export function kyokusuOf(sekki, sangen) {
  const gi = GENS.indexOf(sangen);
  const n = KYOKU_NUM[sekki]?.[gi];
  if (!n) return null;
  return (isYang(sekki) ? '陽' : '陰') + n + '局';
}
// 局数文字列 -> {yin: '陽'|'陰', num}
export function parseKyokusu(k) { return { yin: k[0], num: +k.slice(1, k.indexOf('局')) }; }

const KYUSEI_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
export const kyuseiToNum = (k) => KYUSEI_KANJI.indexOf(k) + 1;
export const numToKyusei = (n) => KYUSEI_KANJI[((n - 1) % 9 + 9) % 9];

// ---- 超神接神アンカー（日家九星/inton 遁の切替日）----
// 規則(実データ2000-2019にフィット): 至点に最も近い甲子(60日周期)で
// オフセットが窓 [-29,+23] 日に入るものを採用。無ければ甲午(60日周期)で同窓。
const ANCHOR_LO = -29, ANCHOR_HI = 27;
/**
 * 指定年・冬至/夏至の遁アンカー日(YYYY-MM-DD)を返す。
 * @param targetKanshi 0(甲子) を優先, 30(甲午) を代替
 */
export function findAnchor(year, which) {
  const sol = solstice(year, which).date;
  const pick = (ki) => {
    // sol 周辺 ±40日で干支index==ki の日のうち、窓内・|offset|最小
    let best = null;
    for (let off = -40; off <= 40; off++) {
      const d = addDays(sol, off);
      if (((kanshiIndexFromEpoch(d)) % 60) !== ki) continue;
      if (off < ANCHOR_LO || off > ANCHOR_HI) continue;
      if (!best || Math.abs(off) < Math.abs(best.off)) best = { date: d, off };
    }
    return best;
  };
  const kou = pick(0);    // 甲子
  if (kou) return kou.date;
  const go = pick(30);    // 甲午
  if (go) return go.date;
  // フォールバック: 窓を無視して至点最寄りの甲子
  let best = null;
  for (let off = -35; off <= 35; off++) { const d = addDays(sol, off); if ((kanshiIndexFromEpoch(d) % 60) === 0) { if (!best || Math.abs(off) < Math.abs(best.off)) best = { date: d, off }; } }
  return best ? best.date : sol;
}

// 干支は実データに依存せず、エポックからの連続計算でも出せるようにする。
// 基準: 2000-01-07 は 甲子(index 0)（v3データで確認済み）。
const KANSHI_EPOCH = '2000-01-07';
export function kanshiIndexFromEpoch(date) {
  const diff = dayDiff(date, KANSHI_EPOCH);
  return ((diff % 60) + 60) % 60;
}

/**
 * 日家九星 と inton_youton を、年範囲にわたり連続シミュレーションで生成。
 * @param {string[]} dates 昇順の日付配列
 * @returns Map date -> {kyusei_day, inton_youton}
 * アルゴリズム: 冬至アンカーで陽遁開始(甲子=一,以降+1/日,九→一)、
 *   夏至アンカーで陰遁開始(甲子=九,以降-1/日)。アンカー日は値を据え置き(前日と同値)。
 */
export function simulateKyuseiInton(dates) {
  if (!dates.length) return new Map();
  const firstYear = +dates[0].slice(0, 4) - 1;
  const lastYear = +dates[dates.length - 1].slice(0, 4) + 1;
  // アンカー列（日付昇順）: {date, yin:'陽'|'陰'}
  const anchors = [];
  for (let y = firstYear; y <= lastYear; y++) {
    anchors.push({ date: findAnchor(y, '冬至'), yin: '陽' });
    anchors.push({ date: findAnchor(y, '夏至'), yin: '陰' });
  }
  anchors.sort((a, b) => (a.date < b.date ? -1 : 1));
  // 各日について「直近で開始したアンカー」を参照して値を決める
  const out = new Map();
  let ai = 0;
  // アンカー値(陽=一始まり/陰=九始まり), 据え置き表現: アンカー日 value, 翌日から ±1
  for (const date of dates) {
    // date 以前の最後のアンカーを進める
    while (ai + 1 < anchors.length && anchors[ai + 1].date <= date) ai++;
    // date が最初のアンカーより前なら、最初のアンカーから逆算しない（範囲外）→ skip
    let a = anchors[ai];
    if (date < anchors[0].date) { continue; }
    const n = dayDiff(date, a.date); // 0=アンカー日
    let num;
    if (a.yin === '陽') {
      // アンカー=一, 翌日から+1, ただしアンカー当日(n=0)は一。n>=1 で n を足す。
      num = numToKyusei(1 + Math.max(0, n));
    } else {
      num = numToKyusei(9 - Math.max(0, n));
    }
    out.set(date, { kyusei_day: num, inton_youton: a.yin });
  }
  return out;
}

/**
 * sekki24 を (sangen, time_kyokusu) 列から正準順序ウォークで復元（time_kyokusuがある区間用）。
 * @param rows [{date, sangen, time_kyokusu}] 昇順, time_kyokusu必須
 * @param seedSekki 最初の日の節気（天文から決定して渡す）
 * @returns Map date->sekki24, および異常 {date, reason} のリスト
 */
export function reconstructSekkiFromKyokusu(rows, seedAstro) {
  const out = new Map();
  const issues = [];
  let curIdx = -1; // SEKKI_ORDER index
  let prevSangen = null;
  for (const r of rows) {
    const atUpper = r.sangen === '上元' && prevSangen !== '上元';
    if (curIdx < 0) {
      // 初日: 天文の節気に最も近い候補で time_kyokusu に一致するものを探す
      const astro = seedAstro(r.date); // 節気名（天文上いま有効）
      let best = -1, bestDist = 99;
      for (let k = 0; k < 24; k++) {
        if (kyokusuOf(SEKKI_ORDER[k], r.sangen) === r.time_kyokusu) {
          const d = Math.min((k - SEKKI_ORDER.indexOf(astro) + 24) % 24, (SEKKI_ORDER.indexOf(astro) - k + 24) % 24);
          if (d < bestDist) { bestDist = d; best = k; }
        }
      }
      curIdx = best >= 0 ? best : SEKKI_ORDER.indexOf(astro);
    } else if (atUpper) {
      // 節気は据え置き(閏)か +1(通常)。time_kyokusu で判定。
      const stay = SEKKI_ORDER[curIdx];
      const next = SEKKI_ORDER[(curIdx + 1) % 24];
      const matchStay = kyokusuOf(stay, '上元') === r.time_kyokusu;
      const matchNext = kyokusuOf(next, '上元') === r.time_kyokusu;
      if (matchNext && !matchStay) curIdx = (curIdx + 1) % 24;
      else if (matchStay && !matchNext) { /* 閏: 据え置き */ }
      else if (matchNext && matchStay) {
        // 両方一致(レア): 通常は前進。閏は連続2ブロックのみなので、直前が閏でなければ前進。
        curIdx = (curIdx + 1) % 24;
      } else {
        // どちらも不一致: +2 など飛び。time_kyokusu に合う最も近い前方節気を探す
        let found = -1;
        for (let step = 1; step <= 3; step++) {
          const cand = (curIdx + step) % 24;
          if (kyokusuOf(SEKKI_ORDER[cand], '上元') === r.time_kyokusu) { found = cand; break; }
        }
        if (found >= 0) curIdx = found;
        else issues.push({ date: r.date, reason: `上元局数 ${r.time_kyokusu} に一致する前方節気なし(cur=${stay})` });
      }
    }
    out.set(r.date, SEKKI_ORDER[curIdx]);
    prevSangen = r.sangen;
  }
  return { map: out, issues };
}

/**
 * sekki24 を 天文＋sangen から復元（time_kyokusuが無い 1900-1921 用・純計算）。
 * 各「上元」開始ブロックに正準節気を割り当て、閏は天文節入との比較で挿入。
 */
export function reconstructSekkiFromAstro(rows, termsByYear) {
  const out = new Map();
  const boundaryFlags = [];
  // 節入日(date)->節気名 の索引を作る（その日以降その節気が有効）
  // termsByYear: Map year -> [{name,date,hourJst}]
  const allTerms = [];
  for (const [, terms] of termsByYear) for (const t of terms) allTerms.push(t);
  allTerms.sort((a, b) => (a.date < b.date ? -1 : 1));
  const astroSekkiAt = (date) => {
    // date 時点で有効な(直近で始まった)節気
    let cur = null;
    for (const t of allTerms) { if (t.date <= date) cur = t.name; else break; }
    return cur;
  };
  let curIdx = -1, prevSangen = null;
  for (const r of rows) {
    const atUpper = r.sangen === '上元' && prevSangen !== '上元';
    if (curIdx < 0) {
      curIdx = SEKKI_ORDER.indexOf(astroSekkiAt(r.date));
      if (curIdx < 0) curIdx = 0;
    } else if (atUpper) {
      const next = SEKKI_ORDER[(curIdx + 1) % 24];
      // この上元ブロックの開始日 r.date における天文節気
      const astro = astroSekkiAt(r.date);
      // 通常は前進。ただし「次の節気の天文節入がまだ来ていない(符頭が先行=超神過多)」なら閏(据え置き)。
      // 判定: next の天文節入日 > r.date + 余裕 なら閏
      let nextTermDate = null;
      for (const t of allTerms) { if (t.name === next && t.date >= addDays(r.date, -20) && t.date <= addDays(r.date, 40)) { nextTermDate = t.date; break; } }
      if (nextTermDate && dayDiff(nextTermDate, r.date) > 9) {
        // 閏: 据え置き
      } else {
        curIdx = (curIdx + 1) % 24;
      }
    }
    out.set(r.date, SEKKI_ORDER[curIdx]);
    prevSangen = r.sangen;
  }
  return { map: out, boundaryFlags };
}

export { solarTermsForYear };
