// src/kaisetsu/composeProse.js
// 解説文の合成（v3）: 判定オブジェクト＋部品バンクから、4段落の解説文を組み立てる純関数。
//
//   1. 見出し（太字）      … その方位の使い方を一言で
//   2. 主な理由            … 門と拒否権（伏吟・反吟など）。「〜の影響で → 一方で」とつなぐ
//   3. 神と星              … 支える要素を先に、注意する要素を後に
//   4. 象意 ＋ しめ（太字）… 「〜ために使いたい方位」
//
// 文体は docs/kaisetsu_rewrite/approved_samples.md（運営者が承認した見本）。です・ます調。
// どの部品を使うかは判定（classifyPalace）で決まり、文章の吉凶は必ずテーマ別の◎○×（軸ランク）に合わせる。
// 部品の文言は data/kaisetsu/kaisetsu_bank_v3.json（門・神・星・拒否権）と
// kaisetsu_bank_v3_shoui.json（象意。v1 から scripts/build_shoui_v3.mjs で生成）。
//
//   short = 見出し（太字なし） / mid = 見出し＋主な理由 / full = 4段落
//   段落の区切りは空行（\n\n）、太字は **…**（画面側は src/kaisetsu/renderProse.jsx で描く）。
//
// バリエーション選択は決定的（同じ盤は何度生成しても同じ文）。ランダム禁止。

export const AXES = ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo'];
export const AXIS_LABELS = { goen: 'ご縁', shigoto: '仕事運', kinun: '金運', kenko: '健康運', benkyo: '勉強運' };

export const MID_MAX = 200;
export const FULL_MAX = 380;

/** 使わない言い回し（ふわっとした励まし・緩衝材）。部品にも生成文にも入れない。 */
export const FORBIDDEN_EXPRESSIONS = [
  'と安心', 'すると良いでしょう', 'してみましょう', '心がけましょう',
  '無理のない範囲で', '焦らずに', 'ゆっくりと', 'リラックスして',
  'かもしれません', '寄り添う', 'あなたらしく', '大切にして',
  'うまく付き合っていきましょう', '意識してみて',
];

const GOOD_GATE_CLASSES = new Set(['kichi3', 'chukichi']);
const GOOD_STAR_RANKS = new Set(['jokichi', 'shokichi']);
/** 宮ローカルの重い拒否権（盤全体の伏吟・反吟より先に語る） */
const CELL_LOCAL_VETOES = new Set(['空亡', '六儀撃刑', '三奇入墓', '天網四張', '五不遇時']);
const BOARD_VETOES = new Set(['伏吟', '反吟']);

const len = (s) => [...String(s || '')].length;

/** FNV-1a。局key+palace+axis から決定的にバリエーションを選ぶ */
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function rankDirection(rank) {
  if (rank === '◎' || rank === '○') return 1;
  if (rank === '×' || rank === '▲') return -1;
  return 0;
}

/** 文章で主に語る拒否権（三奇入墓・六儀撃刑など → 空亡 → 伏吟・反吟の順） */
function mainVeto(vetoes) {
  return vetoes.find((v) => CELL_LOCAL_VETOES.has(v) && v !== '空亡')
    || vetoes.find((v) => v === '空亡')
    || vetoes[0];
}

/** 同名で意味が違う十干剋応（華蓋孛師など）は、組み合わせ番号で variants を引く */
function variantOf(entry, name, judgment) {
  const no = judgment?.shouiVariant?.[name];
  return (no != null && entry?.variants?.[String(no)]) || null;
}

/**
 * 象意の1文を選ぶ。
 *   吉: 同じ向き（吉）の象意。無ければ凶の象意を注意として添える
 *   凶: 凶の象意だけ（吉の象意は褒め文になり結論と逆を向くので出さない）
 *   △: 凶・条件つきの象意。拒否権が無いときだけ吉の象意も可
 */
function pickShoui(judgment, axis, dir, bank, hasVeto) {
  // 拒否権として語る名前（伏吟・反吟など）は象意の文では繰り返さない。
  // 三大凶格（飛宮格など）は拒否権の文を持たないので、象意の文として語る。
  const names = (judgment.shoui || []).filter((n) => !BOARD_VETOES.has(n) && !bank.v3.vetoes?.[n]);
  const info = names.map((name) => {
    const v1 = bank.v1.shoui?.[name];
    const v3 = bank.shoui.shoui?.[name];
    if (!v1 || !v3) return null;
    const polarity = variantOf(v1, name, judgment)?.polarity ?? v1.polarity ?? 0;
    const text = (variantOf(v3, name, judgment) || v3).axes?.[axis] || '';
    return text ? { name, polarity, text } : null;
  }).filter(Boolean);
  const by = (p) => info.find((e) => e.polarity === p);
  if (dir > 0) {
    const same = by(1);
    if (same) return { ...same, role: 'support' };
    const opp = by(-1);
    return opp ? { ...opp, role: 'caution' } : null;
  }
  if (dir < 0) {
    const same = by(-1);
    return same ? { ...same, role: 'weigh' } : null;
  }
  const hit = by(-1) || by(0) || (hasVeto ? null : by(1));
  return hit ? { ...hit, role: hit.polarity > 0 ? 'support' : 'weigh' } : null;
}

/** 神・星の1文（向きに合う部品を選ぶ）。{ text, role } */
function elementLine(entry, isGood, dir) {
  if (!entry) return null;
  if (isGood) return dir >= 0 ? { text: entry.support, role: 'support' } : { text: entry.muted, role: 'muted' };
  return dir > 0 ? { text: entry.caution, role: 'caution' } : { text: entry.weigh, role: 'weigh' };
}

/** 「ただし、」は全体で1回だけ。2回目以降は「また、」にして、注意の羅列がくどくならないようにする。 */
function smoothButs(sentences) {
  let seen = false;
  return sentences.map((s) => {
    if (!s.startsWith('ただし、')) return s;
    if (!seen) { seen = true; return s; }
    return `また、${s.slice(4)}`;
  });
}

const join = (sentences) => sentences.filter(Boolean).join('');

/**
 * @param {object} rawJudgment - classifyPalace の出力
 * @param {string} axis
 * @param {{ v1: object, v3: object, shoui: object }} bank - v1（象意の吉凶・variants）/ v3 部品 / v3 象意
 * @returns {{ short: string, mid: string, full: string, meta: object }}
 */
export function composeProse(rawJudgment, axis, bank) {
  // 文章の吉凶は、画面で同じ行に出るテーマ別の◎○×（軸ランク）に合わせる。
  const axisRank = rawJudgment.axisRanks?.[axis];
  const judgment = axisRank ? { ...rawJudgment, rank: axisRank } : rawJudgment;
  const { rank, gate, gateClass, star, starRank, god, godClass, key, palace } = judgment;
  const { v3 } = bank;
  // 文章で語れる拒否権だけを見る（三大凶格は象意の文で語る）。
  const vetoes = (judgment.vetoes || []).filter((v) => v3.vetoes?.[v]);
  const dir = rankDirection(rank);
  const tone = dir > 0 ? 'pos' : (dir < 0 ? 'neg' : 'neu');
  const h = hashSeed(`${key}|${palace}|${axis}`);
  const axisLabel = AXIS_LABELS[axis] || axis;
  const G = v3.gates?.[gate] || {};
  const goodGate = GOOD_GATE_CLASSES.has(gateClass);

  // 吉門で和らぐ空亡（kuubouRelief）は主な理由にしない（4段落目に「遅れて届きやすい」と添える）。
  const vetoName = vetoes.length > 0 && !judgment.kuubouRelief ? mainVeto(vetoes) : null;
  const V = vetoName ? v3.vetoes?.[vetoName] : null;

  let shoui = pickShoui(judgment, axis, dir, bank, Boolean(V));
  // 凶門なのに吉で、吉の象意が入っている方位は、象意を主役にする
  // （門の限定的な使い道「関係の清算に限って使う」を見出しにすると、象意「縁談を進めるのに向く」と食い違う）。
  const shouiLed = dir > 0 && !goodGate && shoui?.role === 'support' && v3.shouiLed ? shoui : null;
  const fillLed = (t) => String(t || '').replace(/\{axis\}/gu, axisLabel).replace(/\{name\}/gu, shouiLed.name);

  // ---- 1. 見出し ----
  let head;
  if (dir < 0) {
    const heads = v3.negHeads?.[rank] || v3.negHeads?.['▲'] || [''];
    head = heads[h % heads.length].replace(/\{axis\}/gu, axisLabel);
  } else if (shouiLed) {
    head = fillLed(v3.shouiLed.head);
  } else {
    head = G.head?.[tone]?.[axis] || '';
  }

  // ---- 2. 主な理由（門と拒否権）----
  let reason;
  if (shouiLed) {
    reason = [shouiLed.text, G.body?.neg?.[axis] ? `ただし、${G.body.neg[axis]}` : ''];
    shoui = null;
  } else if (dir > 0) {
    reason = [G.body?.pos?.[axis]];
  } else if (dir === 0) {
    reason = V?.body ? [V.body, `一方で、${G.body?.neu?.[axis] || ''}`] : [G.body?.neu?.[axis]];
  } else if (goodGate) {
    reason = [G.body?.honrai?.[axis], V?.body ? `しかし、${V.body}` : v3.mutedTail];
  } else {
    reason = [V?.body, G.body?.neg?.[axis]];
  }

  // ---- 3. 神と星（支える要素を先に、注意を後に）----
  const godLine = godClass === 'kyo_muko'
    ? { text: String(v3.mukoGod || '').replace(/\{god\}/gu, god), role: 'support' }
    : elementLine(v3.gods?.[god], godClass === 'kichi', dir);
  let starLine = elementLine(v3.stars?.[star], GOOD_STAR_RANKS.has(starRank), dir);
  // 「本来は吉だが力を出しきれない」を神と星で二度言わない（門の mutedTail とも重なるため、神を優先）。
  if (starLine?.role === 'muted' && (godLine?.role === 'muted' || (goodGate && !V))) starLine = null;
  const order = { support: 0, muted: 1, weigh: 2, caution: 3 };
  let elements = [godLine, starLine].filter((e) => e?.text).sort((a, b) => order[a.role] - order[b.role]);

  // ---- 4. 象意 ＋ 注意 ＋ しめ ----
  const shouiText = () => (shoui ? (shoui.role === 'caution' ? `ただし、${shoui.text}` : shoui.text) : '');
  let vetoNote = '';
  if (dir > 0 && judgment.kuubouRelief) vetoNote = v3.vetoes?.['空亡']?.relief || '';
  else if (dir > 0 && V?.caution) vetoNote = V.caution;
  const close = shouiLed ? fillLed(v3.shouiLed.close) : (G.close?.[tone]?.[axis] || '');

  const build = () => {
    const [p2, p3, p4] = [reason, elements.map((e) => e.text), [shouiText(), vetoNote, close]];
    // 「ただし、」の整理は段落をまたいで行う。
    const flat = smoothButs([...p2, '\u0000', ...p3, '\u0000', ...p4].filter(Boolean));
    const paras = flat.join('').split('\u0000').filter(Boolean);
    return [`**${head}**`, ...paras].join('\n\n');
  };

  // 長さの上限。落とす順: 星 → 象意 → 神（拒否権の注意としめは残す）。
  let guard = 'none';
  let full = build();
  if (len(full) > FULL_MAX && starLine) { elements = elements.filter((e) => e !== starLine); guard = 'drop_star'; full = build(); }
  if (len(full) > FULL_MAX && shoui) { shoui = null; guard = 'drop_shoui'; full = build(); }
  if (len(full) > FULL_MAX) { elements = []; guard = 'drop_elements'; full = build(); }

  const mid = [`**${head}**`, join(reason)].filter(Boolean).join('\n\n');

  return {
    short: head,
    mid,
    full,
    meta: {
      tone,
      shouiLed: Boolean(shouiLed),
      veto: vetoName,
      shoui: shoui ? shoui.role : 'none',
      elements: elements.map((e) => e.role),
      guard,
      length: len(full),
      midLength: len(mid),
    },
  };
}
