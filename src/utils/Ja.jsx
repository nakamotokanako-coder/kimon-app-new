import React from 'react';
import { loadDefaultJapaneseParser } from 'budoux';

// 日本語の文を、文節（意味のまとまり）の切れ目でだけ折り返すための部品。
// スマホの狭い幅で「小さな開運 / 法。」のように言葉の途中で改行されるのを防ぐ。
//   <Ja>吉方位へ行けない日の、小さな開運法。</Ja>
//   → 「吉方位へ｜行けない｜日の、｜小さな｜開運法。」の切れ目にだけ改行の候補（<wbr>）を置く
// 文節の区切りは BudouX（Google の日本語の改行用の小さな辞書）で決める。
// 画面の文字そのもの（textContent）は変わらない。CSS は styles.css の .ja。

const parser = loadDefaultJapaneseParser();
const cache = new Map();

/** 文を文節に分ける（同じ文は覚えておく） */
export function jaPhrases(text) {
  const key = String(text ?? '');
  if (!cache.has(key)) cache.set(key, key ? parser.parse(key) : []);
  return cache.get(key);
}

export default function Ja({ children }) {
  if (typeof children !== 'string') return children ?? null;
  const phrases = jaPhrases(children);
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
