// src/kimon/studyCards.js
// 「この盤から学ぶ」の学習カードの中身を組み立てる。
//
// 1枚のカードは、次の形（components/StudyCard.jsx がそのまま描く）:
//   { id, kind, name, reading, category, tone, toneLabel, tags, gist, meaning, usage, condition, here }
//     kind      … 何のカードか（格局／八門／九星／八神／天盤干。この先 十干剋応・九遁 なども同じ形で足せる）
//     gist      … ひとことで
//     meaning   … そのものの一般的な意味（どの盤に出ても同じ）
//     usage     … 一般的な使い方の目安（どの盤に出ても同じ）
//     condition … 成立する条件
//     here      … 今回の盤ではどうか（この盤・この方位だけの話。文の配列）
//
// 「一般的な意味」と「今回の盤では」を混ぜないのが、このカードの決まり。
// 判定は scoreEngine / kakkyoku の結果をそのまま使い、ここでは計算しない。
// 要素ごとの点数（内訳）は書かない。吉凶の向きだけを札で示す。
import { ELEMENT_TEXTS } from './elementTexts.generated.js';
import { kakkyokuData } from './kakkyoku.js';
import { DATE_BOUND_KAKKYOKU, KAN_TEXTS, findKakkyokuEntry } from './palaceExplain.js';

/**
 * 格局が成立する条件（判定の決まりは src/kimon/kakkyoku.js。そこに書いてある条件を言葉にしたもの）。
 * 「甲」は盤に出ないので、その盤の旬首の干が代わりを務める。
 */
export const KAKKYOKU_CONDITIONS = {
  '天遁': '天盤に丙、地盤に丁、八門が生門',
  '地遁': '天盤に乙、地盤に己、八門が開門',
  '人遁': '天盤に丁、八門が休門、八神が太陰',
  '雲遁': '天盤に乙、地盤に辛、八門が休門・生門・開門のどれか（または、天盤に乙、八門が開門で、坤の方位）',
  '風遁': '天盤に乙、八門が休門・生門・開門のどれかで、巽の方位',
  '龍遁': '天盤に乙、八門が休門で、坎の方位',
  '虎遁': '天盤に乙、地盤に辛、八門が休門で、艮の方位',
  '神遁': '天盤に丙、八門が生門、八神が九天',
  '鬼遁': '天盤に乙、八門が杜門か開門、八神が九地',
  '乙奇得使': '天盤に乙があり、乾か離の方位',
  '丙奇得使': '天盤に丙があり、坤か坎の方位',
  '丁奇得使': '天盤に丁があり、巽か艮の方位',
  '乙奇昇殿': '天盤に乙があり、震の方位',
  '丙奇昇殿': '天盤に丙があり、離の方位',
  '丁奇昇殿': '天盤に丁があり、兌の方位',
  '玉女守門': '天盤に丁があり、八門がその盤の直使の門',
  '伏宮格': '天盤に庚、地盤に甲（その盤の旬首の干）',
  '飛宮格': '天盤に甲（その盤の旬首の干）、地盤に庚',
  '刑格': '天盤に庚、地盤に己',
  '歳格': '天盤に庚、地盤に年の干',
  '月格': '天盤に庚、地盤に月の干',
  '日格': '天盤に庚、地盤に日の干',
  '伏干': '天盤に庚、地盤に日の干（日格と同じ条件）',
  '雲干': '天盤に日の干、地盤に庚',
  '時格': '天盤に庚、地盤に時の干（時盤だけ）',
  '青龍逃走': '天盤に乙、地盤に辛',
  '白虎猖狂': '天盤に辛、地盤に乙',
  '螣蛇妖矯': '天盤に癸、地盤に丁',
  '朱雀投江': '天盤に丁、地盤に癸',
  '天羅': '天盤に癸、地盤に時の干',
  '地網': '天盤に壬、地盤に時の干',
  '乙奇入墓': '天盤に乙があり、坤の方位',
  '丙奇入墓': '天盤に丙があり、乾の方位',
  '丁奇入墓': '天盤に丁があり、艮の方位',
  '六儀撃刑格': '天盤の干と方位の組み合わせ（戊と震、己と坤、庚と艮、辛と離、壬と巽、癸と巽）',
};

/** 格局の名前 → その方位を凶として扱う条件（拒否権。src/kimon/palaceVeto.js）の名前 */
const VETO_OF = {
  '六儀撃刑格': '六儀撃刑',
  '乙奇入墓': '三奇入墓',
  '丙奇入墓': '三奇入墓',
  '丁奇入墓': '三奇入墓',
  '天網四張': '天網四張',
};

const TONE_LABEL = { kichi: '吉格', kyo: '凶格', chu: '格局' };

/** data/kakkyoku.json の項目（よみ・分類）を、名前から引く */
function findRule(name) {
  for (const group of [kakkyokuData.kichi, kakkyokuData.kyo]) {
    for (const [key, value] of Object.entries(group || {})) {
      if (key === name || value?.display_name === name) return value;
    }
  }
  return null;
}

/** 最初の一文と、残り（最初の一文が短すぎて意味が取れないときは、二文目まで） */
export function splitFirstSentence(text) {
  const t = String(text || '').trim();
  let i = t.indexOf('。');
  if (i >= 0 && i < 9) {
    const j = t.indexOf('。', i + 1);
    if (j >= 0) i = j;
  }
  if (i < 0 || i === t.length - 1) return [t, ''];
  return [t.slice(0, i + 1), t.slice(i + 1).trim()];
}

/** 分類の名前（data/kakkyoku.json）を、画面に出す言葉にする。格局の名前と同じなら出さない */
const CATEGORY_LABEL = {
  '庚×干（盤レベル凶意）': '庚と年月日時の干',
};

function categoryOf(name, raw) {
  const label = CATEGORY_LABEL[raw] || raw || '';
  return label === name ? '' : label;
}

function placementText(data) {
  const parts = [
    data?.tenban ? `天盤${data.tenban}` : '',
    data?.chiban ? `地盤${data.chiban}` : '',
    data?.hachimon,
    data?.hasshin,
    data?.kyusei,
  ].filter(Boolean);
  return parts.length ? `この方位の配置は、${parts.join('・')}です。` : '';
}

function toneOfKakkyoku(k) {
  if (k.kichi_kyo === 'kichi') return 'kichi';
  if (k.kichi_kyo === 'kyo') return 'kyo';
  return k.score > 0 ? 'kichi' : k.score < 0 ? 'kyo' : 'chu';
}

/** その方位に出ている格局の学習カード（全件） */
export function buildKakkyokuStudyCards(palaceScore, palaceData) {
  const detected = palaceScore?.detected_kakkyoku || [];
  const vetoes = palaceScore?.vetoes || [];
  return detected.map((k) => {
    const entry = findKakkyokuEntry(k.name);
    const rule = findRule(k.name);
    const tone = toneOfKakkyoku(k);
    const general = entry?.modern || k.meaning || rule?.meaning || '';
    const [gist, rest] = splitFirstSentence(general);
    const others = detected.map((o) => o.name).filter((name) => name !== k.name);
    const dateBound = DATE_BOUND_KAKKYOKU.includes(k.name);

    const here = [placementText(palaceData)];
    if (VETO_OF[k.name] && vetoes.includes(VETO_OF[k.name])) {
      here.push('この格局があるため、ほかの要素が良くても、この方位は凶として扱っています。');
    }
    if (dateBound) here.push('年・月・日の干で決まる格局なので、この日時だけに付いています。');
    if (others.length) here.push(`同じ方位に、${others.join('・')}も出ています。`);

    return {
      id: `kakkyoku-${k.name}`,
      kind: '格局',
      name: k.name,
      reading: k.reading || rule?.reading || '',
      category: categoryOf(k.name, k.category || rule?.category),
      tone,
      toneLabel: TONE_LABEL[tone],
      tags: dateBound ? ['この日時だけ'] : [],
      gist: gist || 'この格局の説明は登録されていません。',
      meaning: rest,
      usage: entry?.practical || '',
      condition: KAKKYOKU_CONDITIONS[k.name] || '',
      here: here.filter(Boolean),
    };
  });
}

function toneOfPoints(points) {
  if (points > 0) return 'kichi';
  if (points < 0) return 'kyo';
  return 'chu';
}

const POINT_TONE_LABEL = { kichi: '吉', kyo: '凶', chu: '中立' };

/** その方位の配置（八門・九星・八神・天盤干）の学習カード */
export function buildElementStudyCards(palaceScore, palaceData) {
  const b = palaceScore?.breakdown || {};
  const data = palaceData || {};
  const cards = [];
  const push = (kind, name, text, points) => {
    if (!name || !text) return;
    const [gist, rest] = splitFirstSentence(text);
    const tone = typeof points === 'number' ? toneOfPoints(points) : 'chu';
    cards.push({
      id: `${kind}-${name}`,
      kind,
      name,
      reading: '',
      category: '',
      tone,
      toneLabel: typeof points === 'number' ? POINT_TONE_LABEL[tone] : '',
      tags: [],
      gist,
      meaning: rest,
      usage: '',
      condition: '',
      here: [`この方位に、${name}が入っています。`],
    });
  };
  push('八門', data.hachimon, ELEMENT_TEXTS.gates[data.hachimon], b.hachimon);
  push('九星', data.kyusei, ELEMENT_TEXTS.stars[data.kyusei], b.kyusei);
  push('八神', data.hasshin, ELEMENT_TEXTS.gods[data.hasshin], b.hasshin);
  const kans = [...String(data.tenban || '')].filter((k) => KAN_TEXTS[k]);
  kans.forEach((kan) => push('天盤干', kan, KAN_TEXTS[kan], kans.length === 1 ? b.tenban_kan : undefined));
  return cards;
}
