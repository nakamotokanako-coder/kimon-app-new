import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { classifyPalace } from './classifyPalace.js';
import { composeProse, AXES, FORBIDDEN_EXPRESSIONS, rankDirection } from './composeProse.js';
import { loadBank, loadRows, formatProblems } from '../../scripts/build_kaisetsu_text.mjs';
import { politeEnding } from '../../scripts/build_shoui_v3.mjs';

const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];

// 全文のハッシュロック。文章が意図せず変わったら落ちる。部品や組み立てを意図して変えたときだけ更新する。
// v3-prose: です・ます調の4段落（見出し → 門と拒否権 → 神と星 → 象意としめ）へ全面的に書き直し（意図した変更）。
const FULL_SORTED_SHA256 = '213fc8cf973291705c45257e76b8894dd1c9cf5cf4b79257c58c20312fafe56c';

const bank = loadBank();
const rows = loadRows();
const rowOf = (key) => rows.find((r) => r.key === key);

/** 全43,200件を1回だけ合成して使い回す */
let cache = null;
function all() {
  if (cache) return cache;
  cache = [];
  for (const row of [...rows].sort((a, b) => (a.key < b.key ? -1 : 1))) {
    for (const palace of [...PALACES].sort()) {
      const j = classifyPalace(row, palace);
      for (const axis of [...AXES].sort()) {
        cache.push({ key: row.key, palace, axis, j, rank: j.axisRanks[axis], d: composeProse(j, axis, bank) });
      }
    }
  }
  return cache;
}

describe('解説文 v3: 全43,200件の不変条件', () => {
  it('崩れ・禁止表現・長さ超過・「ただし」の重なりが1件もない', () => {
    const failures = [];
    for (const c of all()) {
      const p = formatProblems(c.d);
      if (p.length && failures.length < 5) failures.push({ key: c.key, palace: c.palace, axis: c.axis, p, full: c.d.full });
    }
    expect(all()).toHaveLength(43200);
    expect(failures).toEqual([]);
  }, 60000);

  it('見出し・しめの向きが、テーマ別の◎○×と一致する', () => {
    const failures = [];
    for (const c of all()) {
      const dir = rankDirection(c.rank);
      const { full, short } = c.d;
      const negHead = /避けたい|守りを優先|重い配置|使わないことが守り|別の方位を選ぶ|置かないほうがよい/u.test(short);
      const negClose = /今日この方位を避ける|方位を変えて/u.test(full);
      const ok = dir < 0 ? (negHead && negClose) : (!negHead && !negClose);
      if (!ok && failures.length < 5) failures.push({ key: c.key, palace: c.palace, axis: c.axis, rank: c.rank, full });
    }
    expect(failures).toEqual([]);
  }, 60000);

  it('凶（▲×）の文に、吉の神・星をそのまま褒める文や吉の象意を入れない', () => {
    const praise = [
      ...Object.values(bank.v3.gods).map((g) => g.support),
      ...Object.values(bank.v3.stars).map((s) => s.support),
    ].filter(Boolean);
    const failures = [];
    for (const c of all()) {
      if (rankDirection(c.rank) >= 0) continue;
      if ((praise.some((t) => c.d.full.includes(t)) || c.d.meta.shoui === 'support') && failures.length < 5) {
        failures.push({ key: c.key, palace: c.palace, axis: c.axis, full: c.d.full });
      }
    }
    expect(failures).toEqual([]);
  }, 60000);

  it('文中に出る門・神・星は、その方位に実際に入っているものだけ', () => {
    const names = {
      gate: Object.keys(bank.v3.gates),
      god: Object.keys(bank.v3.gods),
      star: Object.keys(bank.v3.stars),
    };
    // 象意の名前には神の名前を含むものがある（白虎猖狂・朱雀投江など）ので、象意の名前は除いて調べる。
    const shouiNames = Object.keys(bank.shoui.shoui).sort((x, y) => y.length - x.length);
    const failures = [];
    for (const c of all()) {
      const body = shouiNames.reduce((t, n) => t.split(n).join(''), c.d.full);
      for (const kind of ['gate', 'god', 'star']) {
        const wrong = names[kind].filter((n) => n !== c.j[kind] && body.includes(n));
        if (wrong.length && failures.length < 5) failures.push({ key: c.key, palace: c.palace, axis: c.axis, kind, wrong, full: c.d.full });
      }
    }
    expect(failures).toEqual([]);
  }, 60000);

  it('全文が意図せず変わっていない（ハッシュロック）', () => {
    const hash = createHash('sha256').update(all().map((c) => c.d.full).join('\n')).digest('hex');
    expect(hash).toBe(FULL_SORTED_SHA256);
  }, 60000);
});

describe('解説文 v3: 組み立て', () => {
  const compose = (key, palace, axis) => composeProse(classifyPalace(rowOf(key), palace), axis, bank);

  it('short は見出し（太字なし）、mid は見出し＋主な理由、full は4段落', () => {
    const d = compose('陰2局壬子', 'ri', 'kinun');
    expect(d.short).not.toContain('**');
    expect(d.mid.split('\n\n')).toHaveLength(2);
    expect(d.full.split('\n\n')).toHaveLength(4);
    expect(d.full.startsWith(`**${d.short}**`)).toBe(true);
    expect(d.full.startsWith(d.mid)).toBe(true);
  });

  it('△で伏吟と吉門が同居する方位は「伏吟の影響で → 一方で、門は〜には使えます」とつなぐ', () => {
    const d = compose('陰2局壬子', 'ri', 'kinun');
    const reason = d.full.split('\n\n')[1];
    expect(reason).toMatch(/^伏吟の影響で.+。一方で、生門は、.+。$/u);
    expect(d.full).not.toContain('最も向いています');
  });

  it('凶門なのに吉で、吉の象意が入る方位は象意を主役にする（門の限定的な使い道を見出しにしない）', () => {
    const d = compose('陰1局丁卯', 'kan', 'goen');
    expect(d.meta.shouiLed).toBe(true);
    expect(d.short).toContain('天乙会合の後押し');
    expect(d.full.split('\n\n')[1]).toMatch(/^天乙会合により、.+。ただし、傷門は.+。$/u);
    expect(d.full).not.toContain('関係の清算に限って');
  });

  it('凶で吉門の方位は「本来は〜に向く門です。しかし、…」と書く', () => {
    const d = compose('陰1局丙子', 'son', 'kenko');
    expect(d.full.split('\n\n')[1]).toMatch(/^生門は本来、.+門です。しかし、六儀撃刑の影響で/u);
  });

  it('同じ入力からは同じ文章（決定的）', () => {
    expect(compose('陰1局丁卯', 'kan', 'goen')).toEqual(compose('陰1局丁卯', 'kan', 'goen'));
  });
});

describe('部品バンク v3', () => {
  const collect = (root) => {
    const out = [];
    const walk = (node) => {
      if (typeof node === 'string') out.push(node);
      else if (node && typeof node === 'object') Object.values(node).forEach(walk);
    };
    walk(root);
    return out;
  };
  const parts = collect({ ...bank.v3, meta: null, shouiLed: { head: bank.v3.shouiLed.head, close: bank.v3.shouiLed.close } });
  const shouiTexts = collect(bank.shoui);
  const texts = [...parts, ...shouiTexts];

  it('すべて です・ます調の文で終わる', () => {
    expect(texts.filter((t) => !/(です|ます|ません)。$/u.test(t))).toEqual([]);
  });

  it('禁止表現・効果の言い切り・断定を含まない', () => {
    const banned = [...FORBIDDEN_EXPRESSIONS, '治る', '治ります', '効く', '効きます'];
    expect(texts.filter((t) => banned.some((w) => t.includes(w)))).toEqual([]);
    // 門・神・星・拒否権の部品は、結果を断定しない（象意の「必ず書面で確認したい」は手順の話なので対象外）。
    expect(parts.filter((t) => /必ず|絶対/u.test(t))).toEqual([]);
  });

  it('象意の文は104種類×5テーマそろい、「{名前}により、」で始まる', () => {
    const entries = Object.entries(bank.shoui.shoui);
    expect(entries).toHaveLength(104);
    for (const [name, e] of entries) {
      for (const axis of AXES) expect(e.axes[axis].startsWith(`${name}により、`)).toBe(true);
    }
  });

  it('語尾の変換（politeEnding）', () => {
    expect(politeEnding('予約内容は確認しておきたい。')).toBe('予約内容は確認しておきたいところです。');
    expect(politeEnding('健康診断の予約に向く。')).toBe('健康診断の予約に向きます。');
    expect(politeEnding('今日は持ち出さないほうがよい。')).toBe('今日は持ち出さないほうがよい日です。');
    expect(politeEnding('体言止め')).toBe(null);
  });
});
