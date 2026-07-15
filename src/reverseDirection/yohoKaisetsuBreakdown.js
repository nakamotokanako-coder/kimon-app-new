// src/reverseDirection/yohoKaisetsuBreakdown.js
// 「評価の解説」の内訳ロジック。src/components/BottomSheet.jsx（盤タブ）の
// buildBreakdown/elementText 等を、吉方位側のデータ形状
// （best.palaceScore = scoreBoard().palaces[palace] / best.palaceData = board.palaces[palace] /
//  banLevel = board.score.ban_level）向けに書き写したもの。
// 盤タブ側は同じ scoreBoard() の出力を BoardGrid.jsx 経由で { score, data, banLevel } という
// 別名で渡しているだけで、フィールド名は共通（scoreEngine.js 由来）。
// 盤タブのBottomSheet.jsxは1文字も変更せず、ここに最小限の複製を置く（共通化はPR-4で検討）。
import shouiDict from '../../data/shoui_dict.json';

const MON_DESC = {
  '休門': '休息と回復の門。人間関係の調和を促し、穏やかな出会いや癒しの機会をもたらす。焦らず待つことで道が開ける。',
  '生門': '万物を生み出す門。新しい事業の立ち上げ、財運の向上、不動産取引に強い。積極的に動いて吉。',
  '開門': '物事を切り拓く門。仕事運・昇進・新規プロジェクトの発展に最も強い。リーダーシップを発揮する時。',
  '景門': '光と知恵の門。学問・試験・資格取得・芸術表現に吉。華やかな場での交流も良い。ただし商売には不向き。',
  '傷門': '衝突と競争の門。争いごとや口論が起きやすい。勝負事には使えるが、人間関係の修復には向かない。',
  '杜門': '閉じる門。物事が停滞し、前に進みにくい。隠れて準備するには良いが、積極的な行動は空回りする。',
  '死門': '変化が止まる門。新しいことを始めるのは避ける時期。静かに現状を守り、内省に充てるのが吉。',
  '驚門': '予想外の出来事が起きやすい門。驚きや不安を伴う変化がある。心の準備をして臨機応変に対応すること。',
};

const SEI_DESC = {
  '天蓬': '水の星。本来は凶星だが、生門と乙・丙が同宮すれば万事昌栄に転じる。争訟には使える。',
  '天芮': '病の星。健康面に注意が必要。ただし友人との交流や師匠に学ぶ場面では吉に働く。',
  '天衝': '行動と決断の星。勝負事や決着をつけたい場面に強い。ただし婚姻や引越しには不向き。',
  '天輔': '学問と成長の上吉星。遠方への旅行、教育、婚姻すべてに吉。子孫繁栄の暗示もある。',
  '天禽': '中央の上吉星。四季を通じてあらゆる事に吉。祭祀・商売・貴人への面会に特に強い。',
  '天心': '治癒と回復の上吉星。医療・健康回復・商売の旅に吉。金運面でも安定をもたらす。',
  '天柱': '守りの星。じっと耐えて守りに徹する時。遠出は災いを招きやすい。現状維持が最善。',
  '天任': '育みの吉星。財運と人縁を結ぶ力がある。金銭の請求、官位の申請、婚姻に吉。',
  '天英': '火の星。宴会や交流の場では吉。ただし商売や財を求める動きには空しい結果になりやすい。',
  '天冲': '行動と決断の星。勝負事や決着をつけたい場面に強い。ただし婚姻や引越しには不向き。',
};

const SHIN_DESC = {
  '直符': '最高位の神。急ぎの用事はこの方位が最適。天の加護があり、万事に通じる。',
  '九天': '攻めと拡大の神。発信・プレゼン・新規開拓に強い。積極的に外へ打って出る時。',
  '九地': '守りと蓄積の神。貯蓄・不動産・長期投資に強い。静かに基盤を固める時期。',
  '太陰': '隠の神。静かな準備や根回しに最適。急な災難からの避難先としても吉。',
  '六合': '縁結びの神。人との和合・パートナーシップに強い。商談や婚姻の成立を助ける。',
  '螣蛇': '惑わしの神。迷いや虚偽の情報に惑わされやすい。冷静な判断が求められる時。',
  '勾陳': '停滞の神。身動きが取りにくく、物事が膠着する。忍耐して時期を待つのが得策。',
  '朱雀': '口舌の神。言葉のトラブルや文書の問題が起きやすい。発言・契約は慎重に。',
};

const BAN_LEVEL_NAMES = [
  ['kan_fukugin', '干伏吟'],
  ['sei_fukugin', '星伏吟'],
  ['mon_fukugin', '門伏吟'],
  ['sei_hangin', '星反吟'],
  ['mon_hangin', '門反吟'],
  ['gofuguuji', '五不遇時'],
];

const BREAKDOWN_LABELS = {
  tenban_kan: (data) => `天盤干（${data?.tenban || '—'}）`,
  hachimon: (data) => `八門（${data?.hachimon || '—'}）`,
  kyusei: (data) => `九星（${data?.kyusei || '—'}）`,
  hasshin: (data) => `八神（${data?.hasshin || '—'}）`,
  jukkan_kokuou: (data, score) => {
    const names = score?.detected_jukkan?.map((item) => item.name).filter(Boolean).join('・');
    return `十干剋応${names ? `（${names}）` : ''}`;
  },
  kakkyoku: (data, score) => {
    const names = score?.detected_kakkyoku?.map((item) => item.name).filter(Boolean).join('・');
    return `格局${names ? `（${names}）` : ''}`;
  },
  monpaku: '門迫',
  kuubou: '空亡',
  ban_level_minus: '盤レベル',
  junri_bonus: '順利ボーナス',
};

function resolveLabel(label, data, score) {
  return typeof label === 'function' ? label(data, score) : label;
}

/** score.breakdown（scoreEngine.js由来）から、0でない要素だけを抽出する。 */
export function buildYohoBreakdown(score, data) {
  const breakdown = score?.breakdown || {};
  return Object.entries(BREAKDOWN_LABELS)
    .map(([key, label]) => ({
      key,
      label: resolveLabel(label, data, score),
      score: breakdown[key],
    }))
    .filter((item) => typeof item.score === 'number' && item.score !== 0);
}

function findJukkanEntry(name) {
  if (!name) return null;
  const indexes = shouiDict.jukan_index_by_name?.[name] || [];
  return shouiDict.jukan_kokuou?.find((item) => indexes.includes(item.no) || item.name === name) || null;
}

function findKakkyokuEntry(name) {
  if (!name) return null;
  const index = shouiDict.kakkyoku_index_by_name?.[name];
  return shouiDict.kakkyoku?.find((item) => item.no === index || item.name === name) || null;
}

function shouiText(entry) {
  return [entry?.modern, entry?.practical].filter(Boolean).join('\n') || '象意を確認';
}

function banLevelText(banLevel) {
  const names = banLevel?.detected?.length
    ? banLevel.detected
    : BAN_LEVEL_NAMES.map(([key, name]) => (banLevel?.[key] ? name : null)).filter(Boolean);
  return names.length ? names.join('・') : '盤全体に重い配置';
}

/** 内訳1項目の説明文。banLevel は盤全体共通なので palace 単位ではなく個別に渡す。 */
export function yohoElementText(key, score, data, banLevel) {
  if (key === 'tenban_kan') return data?.tenban ? `天盤${data.tenban}の働き` : '天盤干の働き';
  if (key === 'hachimon') return MON_DESC[data?.hachimon] || '門の象意';
  if (key === 'kyusei') return SEI_DESC[data?.kyusei] || '星の象意';
  if (key === 'hasshin') return SHIN_DESC[data?.hasshin] || '神の象意';
  if (key === 'jukkan_kokuou') {
    const names = score?.detected_jukkan?.map((item) => item.name).filter(Boolean) || [];
    return names.map((name) => shouiText(findJukkanEntry(name))).filter(Boolean).join(' / ') || '十干剋応の象意';
  }
  if (key === 'kakkyoku') {
    const names = score?.detected_kakkyoku?.map((item) => item.name).filter(Boolean) || [];
    return names.map((name) => shouiText(findKakkyokuEntry(name))).filter(Boolean).join(' / ') || '格局の象意';
  }
  if (key === 'monpaku') return shouiText(findKakkyokuEntry('門迫'));
  if (key === 'kuubou') return shouiText(findKakkyokuEntry('空亡'));
  if (key === 'ban_level_minus') return banLevelText(banLevel);
  if (key === 'junri_bonus') return '流れに乗る吉方位';
  return '配置の象意';
}

/** 吉=kichi / 凶=kyo / 中立=chu。styles.css の .shoui-kichi/.shoui-kyo/.shoui-chu と組み合わせて使う。 */
export function yohoToneClass(value) {
  if (value > 0) return 'kichi';
  if (value < 0) return 'kyo';
  return 'chu';
}
