// src/kimon/charm.js
// 「お守り」: 吉方位へ実際に行けないときに、その吉方位の象意を、物・色・行動として日常に取り入れる提案。
//
// ランダムなラッキーアイテムではない。必ず次の順で決める（同じ盤なら同じ結果）:
//   盤 → 一番点数の高い吉方位 → その方位の象意（八卦の定位）と、入っている門 → 取り入れるもの
//     - 方位の象意 … どの候補（6つ）から選ぶか
//     - 門         … 候補のうち、どの種類（口にするもの／持ち物／色…）を先に勧めるか
// 日盤からは「今日のお守り」（1日固定）、時盤からは「この時間のお守り」（その時辰の間）。エンジンは共通。
//
// 象意と候補は、data/kyusei_shoui.json（方位ごとの色・持ち物・食べ物・行動・天候の持ち物）をもとに、
// 落ち着いた言い回しに整えたもの。効果を言い切らない（「〜を取り入れる」「〜という考え方」）。

export const CHARM_CATEGORIES = ['身につけるもの', '持ち物', '色', '口にするもの', '行動'];

/**
 * 方位（宮）ごとの象意と、取り入れ方の候補。
 *   symbols: その方位が表すもの（4語）
 *   charms:  { category, name, how（どう取り入れるか）, link（象意とのつながり） }
 */
export const CHARM_LIBRARY = {
  kan: {
    symbols: ['水', '静けさ', '休息', '内省'],
    charms: [
      { category: '口にするもの', name: '温かい汁物・お茶', how: '汁物やお茶を一杯、落ち着いて口にしてください。', link: '水の気を、体に取り入れるもの' },
      { category: '持ち物', name: '水筒・飲み物', how: '飲み物を持ち歩き、こまめに口にしてください。', link: '水を持ち歩けるもの' },
      { category: '色', name: '黒・青のもの', how: '黒や青の小物を、ひとつ身につけてください。', link: '水を表す色' },
      { category: '行動', name: 'お風呂にゆっくり浸かる', how: '湯船に浸かって、静かな時間をとってください。', link: '水に触れて休むこと' },
      { category: '身につけるもの', name: '黒い小物', how: '黒い小物を、目立たないところに身につけてください。', link: '水を表す色を身につけるもの' },
      { category: '口にするもの', name: '海藻・塩気のあるもの', how: 'わかめや昆布など、海のものを食事に加えてください。', link: '水の味（塩辛さ）を持つもの' },
    ],
  },
  gon: {
    symbols: ['山', '区切り', '蓄え', '切り替え'],
    charms: [
      { category: '行動', name: '机の上を片づける', how: '身のまわりを5分だけ片づけて、区切りをつけてください。', link: '止めて、整えること' },
      { category: '色', name: '白・ベージュのもの', how: '白やベージュのものを、ひとつ身につけてください。', link: '山と土を表す色' },
      { category: '口にするもの', name: '牛乳・山菜', how: '牛乳や山菜の料理を、食事に加えてください。', link: '山と、丑（うし）にちなむもの' },
      { category: '持ち物', name: '貯金箱・積み重ねるもの', how: '小銭をひとつ貯めるなど、何かを積み重ねてください。', link: '少しずつ蓄えること' },
      { category: '行動', name: '高い場所から景色を見る', how: '階段を上がる、見晴らしのよい場所に立つ、でも構いません。', link: '山の高さに身を置くこと' },
      { category: '身につけるもの', name: '白いもの', how: '白いシャツやハンカチなど、白いものを身につけてください。', link: '山と土を表す色を身につけるもの' },
    ],
  },
  shin: {
    symbols: ['音', '始まり', '勢い', '成長'],
    charms: [
      { category: '行動', name: '音楽を聴く', how: '好きな音楽を一曲、聴いてから動き出してください。', link: '音と響きに触れること' },
      { category: '持ち物', name: 'イヤホン・音の出るもの', how: '音を持ち歩けるものを、かばんに入れてください。', link: '音を持ち歩けるもの' },
      { category: '色', name: '青・緑のもの', how: '青や緑のものを、ひとつ身につけてください。', link: '芽吹く木を表す色' },
      { category: '口にするもの', name: '酸味のあるもの・卵', how: '梅干しや酢の物、卵料理を食事に加えてください。', link: '木の味（酸味）と、卯（う）にちなむもの' },
      { category: '行動', name: '朝いちばんに動く', how: '用事をひとつ、朝のうちに済ませてください。', link: '始まりの勢いに乗ること' },
      { category: '身につけるもの', name: '青い小物', how: '青い小物を、ひとつ身につけてください。', link: '木を表す色を身につけるもの' },
    ],
  },
  son: {
    symbols: ['風', '移動', '人との縁', '整う'],
    charms: [
      { category: '身につけるもの', name: 'ストール・スカーフ', how: '風を受け流し、軽やかに動けるものを身につけてください。', link: '風にまつわるもの、揺れるもの' },
      { category: '持ち物', name: '手紙・便箋', how: '手紙やメッセージを、ひとつ送ってください。', link: '風のように、遠くへ届くもの' },
      { category: '色', name: '緑・オレンジのもの', how: '緑やオレンジのものを、ひとつ身につけてください。', link: '風にそよぐ木を表す色' },
      { category: '口にするもの', name: 'そば・うどん', how: '長いもの（麺類）を、食事に選んでください。', link: '長く伸びて、縁をつなぐもの' },
      { category: '行動', name: '少し歩く', how: '5分でも、外を歩いて風に当たってください。', link: '風の中を、自分で動くこと' },
      { category: '身につけるもの', name: '香り（アロマ・香水）', how: '好きな香りを、ひと吹きまとってください。', link: '風に乗って届くもの' },
    ],
  },
  ri: {
    symbols: ['光', '知性', '美しさ', '表現'],
    charms: [
      { category: '持ち物', name: '本', how: '読みたい本を一冊、持ち歩いてください。', link: '知性と、明るく照らすもの' },
      { category: '身につけるもの', name: 'メガネ・サングラス', how: '見ることを助けるものを、身につけてください。', link: '光と、見ることにまつわるもの' },
      { category: '色', name: '紫・赤のもの', how: '紫や赤のものを、ひとつ身につけてください。', link: '火を表す色' },
      { category: '口にするもの', name: 'ブラックコーヒー・苦味のあるもの', how: '苦味のあるものを、少し口にしてください。', link: '火の味（苦味）を持つもの' },
      { category: '行動', name: '日の光を浴びる', how: '明るい場所で、数分過ごしてください。', link: '光そのものに当たること' },
      { category: '持ち物', name: '名刺', how: '名刺や、自分を表すものを整えて持ってください。', link: '自分を表に出すもの' },
    ],
  },
  kun: {
    symbols: ['大地', '育む', '堅実', '支え'],
    charms: [
      { category: '口にするもの', name: 'おにぎり・お米', how: 'お米を、よく噛んで食べてください。', link: '大地が育てたもの' },
      { category: '身につけるもの', name: '布もの（ハンカチ・羽織もの）', how: 'やわらかい布ものを、身につけてください。', link: '包んで支えるもの' },
      { category: '色', name: '黄・茶のもの', how: '黄色や茶色のものを、ひとつ身につけてください。', link: '土を表す色' },
      { category: '行動', name: '土や植物に触れる', how: '鉢植えの世話や、公園でのひと休みでも構いません。', link: '大地に直接触れること' },
      { category: '持ち物', name: '使い慣れた古いもの', how: '長く使っているものを、ひとつ持ち歩いてください。', link: '積み重ねた時間を持つもの' },
      { category: '口にするもの', name: '甘いもの', how: '甘いものを、少しだけ口にしてください。', link: '土の味（甘味）を持つもの' },
    ],
  },
  da: {
    symbols: ['喜び', '会話', '実り', '楽しみ'],
    charms: [
      { category: '身につけるもの', name: 'アクセサリー', how: '気に入っているものを、ひとつ身につけてください。', link: '金属の輝きと、喜びを表すもの' },
      { category: '持ち物', name: '財布', how: '財布の中を整えてから、出かけてください。', link: '実りを納めるもの' },
      { category: '色', name: '赤・金のもの', how: '赤や金色のものを、ひとつ身につけてください。', link: '実りの秋を表す色' },
      { category: '口にするもの', name: '甘いもの・おいしいもの', how: 'おいしいと感じるものを、味わって食べてください。', link: '口の喜びにまつわるもの' },
      { category: '行動', name: '人と話して笑う', how: '誰かと言葉を交わす時間を、少しとってください。', link: '口と、喜びにまつわること' },
      { category: '身につけるもの', name: '口紅・リップ', how: '口もとを整えてから、出かけてください。', link: '口にまつわるもの' },
    ],
  },
  ken: {
    symbols: ['天', '格', '決断', '充実'],
    charms: [
      { category: '身につけるもの', name: '時計・指輪', how: '質のよいものを、ひとつ身につけてください。', link: '丸く、硬く、価値のあるもの' },
      { category: '色', name: '白・金・銀のもの', how: '白や金、銀のものを、ひとつ身につけてください。', link: '金属と天を表す色' },
      { category: '口にするもの', name: '果物', how: '果物を、ひとつ食べてください。', link: '丸く実ったもの' },
      { category: '行動', name: '神社やお寺で手を合わせる', how: '通りかかったら、手を合わせるだけでも構いません。', link: '天に向き合うこと' },
      { category: '持ち物', name: '上質な筆記具・小物', how: '長く使える、質のよいものをひとつ持ち歩いてください。', link: '格のあるもの' },
      { category: '行動', name: '見晴らしのよい場所へ行く', how: '高い場所から、遠くを眺めてください。', link: '天に近い場所に身を置くこと' },
    ],
  },
};

/**
 * 門によって、どの種類を先に勧めるか。
 * 理由（reason）は「なぜこれがお守りになる？」に出す。
 */
export const GATE_PREFERENCE = {
  '休門': { order: ['口にするもの', '行動', '身につけるもの'], reason: '休門（休息と和合の門）が入っているので、口にするものや、休む行動から選んでいます。' },
  '生門': { order: ['口にするもの', '持ち物', '身につけるもの'], reason: '生門（実りを生む門）が入っているので、体に取り入れるものや、手もとで育てるものから選んでいます。' },
  '開門': { order: ['持ち物', '行動', '身につけるもの'], reason: '開門（物事の入口を開く門）が入っているので、外へ持ち出すものや、動き出す行動から選んでいます。' },
  '景門': { order: ['色', '身につけるもの', '持ち物'], reason: '景門（華やかさを呼ぶ門）が入っているので、色や装いから選んでいます。' },
};
const DEFAULT_PREFERENCE = { order: ['身につけるもの', '色', '持ち物'], reason: '身につけて一緒に動けるものから選んでいます。' };

/** お守りの ID（方位-番号。番号は CHARM_LIBRARY に書いてある順の1〜6）。画像のファイル名にも使う */
export function charmId(palace, index) {
  return `${palace}-${index + 1}`;
}

/** 候補を、門の優先順（同じ種類の中では書いてある順）に並べる */
export function orderCharms(palace, gate) {
  const entry = CHARM_LIBRARY[palace];
  if (!entry) return [];
  const { order } = GATE_PREFERENCE[gate] || DEFAULT_PREFERENCE;
  const rank = (category) => {
    const i = order.indexOf(category);
    return i === -1 ? order.length : i;
  };
  return entry.charms
    .map((charm, index) => ({ charm: { ...charm, id: charmId(palace, index) }, index }))
    .sort((a, b) => rank(a.charm.category) - rank(b.charm.category) || a.index - b.index)
    .map((item) => item.charm);
}

/**
 * お守りを決める。
 * @param {object} args
 * @param {Array} args.rankings - buildReverseBoard / buildDayReverseBoard の rankings（点数順）
 * @param {'day'|'hour'} args.sourceType
 * @param {string} [args.validTime] - 有効な時間（時盤なら「13-15時」、日盤なら日付）
 * @returns {object|null} 吉の方位が無い盤では null
 */
export function getCharm({ rankings, sourceType, validTime = '' }) {
  const best = (rankings || []).find((item) => item.score > 0 && CHARM_LIBRARY[item.palace]);
  if (!best) return null;
  const entry = CHARM_LIBRARY[best.palace];
  const gate = best.palaceData?.hachimon || '';
  const ordered = orderCharms(best.palace, gate);
  const [charm, ...rest] = ordered;
  // ほかの取り入れ方: 主のお守りと違う種類から2つ
  const alternatives = [];
  for (const other of rest) {
    if (other.category === charm.category || alternatives.some((a) => a.category === other.category)) continue;
    alternatives.push(other);
    if (alternatives.length === 2) break;
  }
  return {
    sourceType,
    validTime,
    sourceDirection: best.label,
    sourcePalace: best.palace,
    score: best.score,
    elements: {
      gate,
      deity: best.palaceData?.hasshin || '',
      star: best.palaceData?.kyusei || '',
    },
    symbols: entry.symbols,
    charm,
    alternatives,
    reason: (GATE_PREFERENCE[gate] || DEFAULT_PREFERENCE).reason,
  };
}
