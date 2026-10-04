import React from 'react';
import { loadDefaultJapaneseParser } from 'budoux';

// 日本語の文を、文節（意味のまとまり）の切れ目でだけ折り返すための部品。
// スマホの狭い幅で「小さな開運 / 法。」のように言葉の途中で改行されるのを防ぐ。
//   <Ja>吉方位へ行けない日の、小さな開運法。</Ja>
//   → 「吉方位へ｜行けない｜日の、｜小さな｜開運法。」の切れ目にだけ改行の候補（<wbr>）を置く
// 文節の区切りは BudouX（Google の日本語の改行用の小さな辞書）で決める。
// 画面の文字そのもの（textContent）は変わらない。CSS は styles.css の .ja。
//
// もう1つの目的: 最後の行に2〜3文字だけ残るのを防ぐ。
//   文の終わりの文節を、合わせて MIN_TAIL 文字以上になるまでつなげて、そこでは折り返さないようにする。
//   こうすると、最後の行には必ず MIN_TAIL 文字以上が来る（「…方位で / す。」「…行く / 日。」が起きない）。

const parser = loadDefaultJapaneseParser();
const cache = new Map();

/** 最後の行に最低これだけの文字を残す */
export const MIN_TAIL = 7;

const length = (text) => [...text].length;

/** 終わりの文節を、合わせて min 文字以上になるまで1つにつなげる（そこでは折り返さない） */
export function keepTail(phrases, min = MIN_TAIL) {
  const out = [...phrases];
  while (out.length > 1 && length(out[out.length - 1]) < min) {
    const last = out.pop();
    out[out.length - 1] += last;
  }
  return out;
}

/** 文を、折り返してよい単位に分ける（同じ文は覚えておく） */
export function jaPhrases(text, tail = MIN_TAIL) {
  const key = String(text ?? '');
  const cacheKey = `${tail}|${key}`;
  if (!cache.has(cacheKey)) cache.set(cacheKey, key ? keepTail(parser.parse(key), tail) : []);
  return cache.get(cacheKey);
}

/**
 * @param {number} [tail] - 最後の行に残す最低の文字数（既定 MIN_TAIL）。
 *   幅の狭い見出し（半分幅のカードの題など）では、まとまりが幅より長いと途中で折れてしまうので小さくする。
 */
export default function Ja({ children, tail = MIN_TAIL }) {
  if (typeof children !== 'string') return children ?? null;
  const phrases = jaPhrases(children, tail);
  if (phrases.length <= 1) return children;
  return (
    <span className="ja">
      {phrases.map((phrase, i) => (
        <React.Fragment key={i}>
          {i > 0 && <wbr />}
          {phrase}
        </React.Fragment>
      ))}
    </span>
  );
}
