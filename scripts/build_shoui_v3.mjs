// scripts/build_shoui_v3.mjs
// 象意のテーマ別の文（v1 の shoui[*].axes）を、v3 の文体（です・ます調・「{象意名}により、」で始める）に変換する。
// 意味を変えないため、書き直しではなく語尾だけを決まった規則で整える（v1 を直せば v3 も追従する）。
//   実行: node scripts/build_shoui_v3.mjs  → data/kaisetsu/kaisetsu_bank_v3_shoui.json
import { readFileSync, writeFileSync } from 'node:fs';

const V1 = 'data/kaisetsu/kaisetsu_bank_v1.json';
const OUT = 'data/kaisetsu/kaisetsu_bank_v3_shoui.json';

/** 文末の語尾を です・ます調にする。規則に当てはまらない文は null（呼び出し側で止める）。 */
export function politeEnding(text) {
  const t = String(text || '').trim();
  const rules = [
    [/たい。$/u, 'たいところです。'],
    [/に向く。$/u, 'に向きます。'],
    [/よい。$/u, 'よい日です。'],
    [/やすい。$/u, 'やすい配置です。'],
    [/にくい。$/u, 'にくい配置です。'],
    [/残る。$/u, '残ります。'],
    [/利く。$/u, '利きます。'],
    [/(です|ます|ません)。$/u, '$1。'],
  ];
  for (const [re, to] of rules) if (re.test(t)) return t.replace(re, to);
  return null;
}

const toV3 = (name, axes, unresolved) => Object.fromEntries(Object.entries(axes).map(([axis, text]) => {
  const polite = politeEnding(text);
  if (!polite) unresolved.push(`${name}/${axis}: ${text}`);
  return [axis, `${name}により、${polite || text}`];
}));

export function buildShouiV3(bank) {
  const unresolved = [];
  const shoui = {};
  for (const [name, entry] of Object.entries(bank.shoui)) {
    const out = { axes: toV3(name, entry.axes || {}, unresolved) };
    if (entry.variants) {
      out.variants = Object.fromEntries(Object.entries(entry.variants)
        .map(([id, v]) => [id, { axes: toV3(name, v.axes || {}, unresolved) }]));
    }
    shoui[name] = out;
  }
  return { shoui, unresolved };
}

if (process.argv[1] && process.argv[1].endsWith('build_shoui_v3.mjs')) {
  const bank = JSON.parse(readFileSync(V1, 'utf8'));
  const { shoui, unresolved } = buildShouiV3(bank);
  if (unresolved.length) {
    console.error(`語尾の規則に当てはまらない文が ${unresolved.length} 件あります:\n${unresolved.join('\n')}`);
    process.exit(1);
  }
  writeFileSync(OUT, `${JSON.stringify({ meta: { version: 'v3', note: 'v1 の shoui[*].axes から scripts/build_shoui_v3.mjs で生成（手で編集しない）' }, shoui }, null, 2)}\n`);
  console.log(`象意 ${Object.keys(shoui).length} 種類 → ${OUT}`);
}
