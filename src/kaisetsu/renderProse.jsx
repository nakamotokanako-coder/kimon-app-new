import React from 'react';

// 解説文（src/kaisetsu/composeProse.js が作る文章）の表示。
// 段落は空行（\n\n）区切り、太字は **…**。それ以外の記法は使わない。

/** 文章を段落の配列にする */
export function proseParagraphs(text) {
  return String(text || '').split(/\n{2,}/u).map((p) => p.trim()).filter(Boolean);
}

/** 太字の印を外した文字列 */
export function stripBold(text) {
  return String(text || '').replace(/\*\*/gu, '');
}

/** 見出し（1段落目）と残りに分ける。カードの「大きな1行＋本文」用。 */
export function splitProse(text) {
  const [lead = '', ...rest] = proseParagraphs(text);
  return { lead: stripBold(lead), body: rest.join('\n\n') };
}

function inline(paragraph) {
  return paragraph.split(/\*\*(.+?)\*\*/gu).map((part, i) => (
    // split の奇数番目が ** で囲まれていた部分
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  ));
}

/** 解説文を段落（<p>）と太字（<strong>）で描く */
export function ProseText({ text, className = '' }) {
  return (
    <div className={`prose-text ${className}`.trim()}>
      {proseParagraphs(text).map((p, i) => <p key={i}>{inline(p)}</p>)}
    </div>
  );
}
