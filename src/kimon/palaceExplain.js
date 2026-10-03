// src/kimon/palaceExplain.js
// 1宮の「評価の解説」（点数の内訳と各要素の説明）を組み立てる唯一の実装。
// 盤のシート（components/BottomSheet.jsx）と吉方位の詳細シート（components/yoho/L3Sheet.jsx）で共有する。
//
//   - 説明文の出どころは解説文と同じ文言バンク（elementTexts.generated.js）と象意辞書（shoui_dict.json）
//   - 内訳は scoreEngine.js の breakdown をそのまま並べ、順利ボーナス・120点上限・拒否権の上限
//     （palaceVeto.js）も行として出す。行の点数を足すと必ず総合点になる（テストで固定）。
import shouiDict from '../../data/shoui_dict.json';
import { ELEMENT_TEXTS } from './elementTexts.generated.js';
import { getJukanShouiByPair } from './loadShouiDict.js';

/** 天盤干（三奇・六儀）の意味 */
const KAN_TEXTS = {
  '乙': '三奇の乙。柔軟さと人縁を司る。',
  '丙': '三奇の丙。発信と栄光を司る。',
  '丁': '三奇の丁。知性と専門技術を司る。',
  '戊': '六儀の戊。元手や資本を表す。',
  '己': '六儀の己。私的なことや表に出ない事柄を表す。',
  '庚': '六儀の庚。行く手を阻む障害を表す。',
  '辛': '六儀の辛。過ちや損失を表す。',
  '壬': '六儀の壬。流れや移ろいを表す。',
  '癸': '六儀の癸。隠れて滞る気配を表す。',
};

/** 盤全体の判定名 → 文言バンクの拒否権キー */
const BAN_LEVEL_GROUP = {
  '干伏吟': '伏吟', '星伏吟': '伏吟', '門伏吟': '伏吟',
  '星反吟': '反吟', '門反吟': '反吟',
  '五不遇時': '五不遇時',
};

const BAN_LEVEL_FLAGS = [
  ['kan_fukugin', '干伏吟'],
  ['sei_fukugin', '星伏吟'],
  ['mon_fukugin', '門伏吟'],
  ['sei_hangin', '星反吟'],
  ['mon_hangin', '門反吟'],
  ['gofuguuji', '五不遇時'],
];

// 十干剋応は「天盤×地盤」の組み合わせで引く。名前だけで引くと、同じ名前で意味が逆の組み合わせ
// （華蓋孛師: 癸＋丙＝吉 / 丙＋癸＝凶、ほかに華蓋蓬星・凶蛇入獄）を取り違えるため。
function findJukkanEntry(item) {
  if (!item) return null;
  const byPair = getJukanShouiByPair(item.tenban, item.chiban);
  if (byPair && (!item.name || byPair.name === item.name)) return byPair;
  const indexes = shouiDict.jukan_index_by_name?.[item.name] || [];
  return indexes.length === 1 ? shouiDict.jukan_kokuou?.find((e) => e.no === indexes[0]) || null : null;
}

function findKakkyokuEntry(name) {
  if (!name) return null;
  const index = shouiDict.kakkyoku_index_by_name?.[name];
  return shouiDict.kakkyoku?.find((item) => item.no === index || item.name === name) || null;
}

function dictText(entry) {
  return [entry?.modern, entry?.practical].filter(Boolean).join(' ');
}

function firstText(name) {
  const t = String(ELEMENT_TEXTS.vetoes?.[name] || '');
  return t;
}

/** 盤全体の判定名（干伏吟・星反吟など）の一覧 */
export function banLevelNames(banLevel) {
  if (banLevel?.detected?.length) return banLevel.detected;
  return BAN_LEVEL_FLAGS.map(([key, name]) => (banLevel?.[key] ? name : null)).filter(Boolean);
}

/** 盤全体の判定の説明（伏吟・反吟・五不遇時をまとめて1回ずつ） */
export function banLevelText(banLevel) {
  const names = banLevelNames(banLevel);
  if (!names.length) return '盤全体に重い配置。';
  const groups = [...new Set(names.map((n) => BAN_LEVEL_GROUP[n]).filter(Boolean))];
  const explain = groups.map(firstText).filter(Boolean).join('');
  return `${names.join('・')}。${explain}`;
}

/** 宮に出た格局（全件）を { name, tone, meaning } で返す（1件目だけにしない） */
export function listKakkyoku(palaceScore) {
  return (palaceScore?.detected_kakkyoku || []).map((k) => {
    const entry = findKakkyokuEntry(k.name);
    return {
      name: k.name,
      tone: k.kichi_kyo === 'kichi' ? 'kichi' : (k.kichi_kyo === 'kyo' ? 'kyo' : (k.score > 0 ? 'kichi' : k.score < 0 ? 'kyo' : 'chu')),
      meaning: entry?.display_text || dictText(entry) || '',
    };
  });
}

function toneOf(points) {
  if (points > 0) return 'kichi';
  if (points < 0) return 'kyo';
  return 'chu';
}

/**
 * 点数の内訳。各行 { key, label, points, desc, tone }。
 * 行の points の合計は palaceScore.score と一致する。
 */
export function buildScoreBreakdown(palaceScore, palaceData, banLevel) {
  const b = palaceScore?.breakdown || {};
  const data = palaceData || {};
  const rows = [];
  const push = (key, label, points, desc) => {
    if (typeof points !== 'number' || points === 0) return;
    rows.push({ key, label, points, desc, tone: toneOf(points) });
  };

  push('tenban_kan', `天盤干（${data.tenban || '—'}）`, b.tenban_kan,
    [...String(data.tenban || '')].map((k) => KAN_TEXTS[k]).filter(Boolean).join('') || '天盤の干の働き。');
  push('hachimon', `八門（${data.hachimon || '—'}）`, b.hachimon, ELEMENT_TEXTS.gates[data.hachimon] || '');
  push('kyusei', `九星（${data.kyusei || '—'}）`, b.kyusei, ELEMENT_TEXTS.stars[data.kyusei] || '');
  push('hasshin', `八神（${data.hasshin || '—'}）`, b.hasshin, ELEMENT_TEXTS.gods[data.hasshin] || '');

  const jukkan = (palaceScore?.detected_jukkan || []).filter((j) => j?.name);
  push('jukkan_kokuou', `十干剋応${jukkan.length ? `（${jukkan.map((j) => j.name).join('・')}）` : ''}`, b.jukkan_kokuou,
    jukkan.map((j) => dictText(findJukkanEntry(j))).filter(Boolean).join(' / '));

  const kakkyoku = listKakkyoku(palaceScore);
  push('kakkyoku', `格局${kakkyoku.length ? `（${kakkyoku.map((k) => k.name).join('・')}）` : ''}`, b.kakkyoku,
    kakkyoku.map((k) => k.meaning).filter(Boolean).join(' / '));

  push('monpaku', '門迫', b.monpaku, dictText(findKakkyokuEntry('門迫')) || '門が宮に剋され、吉門の力が削がれる。');
  push('kuubou', '空亡', b.kuubou, firstText('空亡'));
  push('ban_level_minus', '盤全体', b.ban_level_minus, banLevelText(banLevel));
  push('junri_bonus', '順利', b.junri_bonus, '日干の宮から流れに乗る吉方位。');

  // 120点の上限（順利ボーナス込みで超えた分）
  if (b.clipped && typeof b.raw_score === 'number') {
    const before = b.raw_score + (b.junri_bonus || 0);
    const after = typeof b.pre_veto_score === 'number' ? b.pre_veto_score : palaceScore.score;
    push('clip', '上限（120点）', after - before, '点数は120点が上限。');
  }

  // 拒否権（空亡・三奇入墓など）の上限（palaceVeto.js）
  if (typeof b.pre_veto_score === 'number') {
    const vetoes = palaceScore?.vetoes || [];
    const hard = vetoes.filter((v) => v !== '空亡');
    const desc = hard.length
      ? `${hard.join('・')}があるため、この方位は凶として扱う（点数は−20が上限）。${hard.map(firstText).filter(Boolean).join('')}`
      : '空亡のため吉の効果が出にくく、点数は0が上限。';
    push('veto_cap', `上限（${vetoes.join('・')}）`, palaceScore.score - b.pre_veto_score, desc);
  }

  return rows;
}
