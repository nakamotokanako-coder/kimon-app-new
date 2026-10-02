// scripts/build_element_texts.mjs
// 解説文の文言バンク（data/kaisetsu/kaisetsu_bank_v1.json）から、盤のシート・吉方位の詳細シートの
// 「評価の解説」で使う八門・九星・八神・盤全体の説明文を生成する。
//
//   実行: node scripts/build_element_texts.mjs
//   出力: src/kimon/elementTexts.generated.js（コミットする）
//
// 画面ごとに別の説明文を手書きしていたため、解説文と食い違っていた（例: 杜門＝「停滞・空回り」
// と「守り・集中に向く」）。説明文の出どころを文言バンクに一本化する。
// バンク全体（有料の解説文の部品）はクライアントに載せないため、必要な短い説明だけを書き出す。
// ドリフトは test/elementTexts.test.js がバンクと突き合わせて検出する。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const bank = JSON.parse(readFileSync(join(ROOT, 'data', 'kaisetsu', 'kaisetsu_bank_v1.json'), 'utf8'));

export function buildElementTexts(b) {
  const gates = Object.fromEntries(
    Object.entries(b.gates).map(([name, g]) => [name, `${g.label}。${g.use}に向く。`]),
  );
  const stars = Object.fromEntries(
    Object.entries(b.stars).map(([name, s]) => [name, `${s.phrase}。`]),
  );
  // 天冲と天衝は同じ星（表記ゆれ）。どちらで渡されても同じ説明にする。
  if (stars['天冲'] && !stars['天衝']) stars['天衝'] = stars['天冲'];
  if (stars['天衝'] && !stars['天冲']) stars['天冲'] = stars['天衝'];
  const gods = Object.fromEntries(
    Object.entries(b.gods).map(([name, g]) => [name, `${g.phrase}。`]),
  );
  const vetoes = Object.fromEntries(
    Object.entries(b.vetoes).map(([name, v]) => [name, `${v.phrase}。`]),
  );
  return { gates, stars, gods, vetoes };
}

const texts = buildElementTexts(bank);
const out = '// 自動生成（scripts/build_element_texts.mjs）。手で編集しないこと。\n'
  + '// 出どころ: data/kaisetsu/kaisetsu_bank_v1.json（解説文と同じ文言）\n'
  + `export const ELEMENT_TEXTS = ${JSON.stringify(texts, null, 2)};\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(ROOT, 'src', 'kimon', 'elementTexts.generated.js'), out);
  console.log('wrote src/kimon/elementTexts.generated.js');
}
