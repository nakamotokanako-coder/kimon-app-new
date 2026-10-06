import React, { useState } from 'react';

// 奇門遁甲の学習カード。格局・八門・九星・八神・十干など、盤に出た1つの要素を説明する。
// 中身は src/kimon/studyCards.js が作る（このカードは、渡された形をそのまま描くだけ）。
//
// 決まり: 「そのものの一般的な意味」と「今回の盤ではどうか」を、見た目でも文章でも分ける。
//   閉じているとき … 名前・分類・ひとことで
//   開いたとき     … 意味／成立する条件／使い方の目安（ここまでが一般的な話）と、今回の盤では（この盤だけの話）
// 色はカード全体には塗らない。左の細い線と小さな札だけで吉凶を示す。

function Block({ label, children, here = false }) {
  return (
    <div className={`study-block${here ? ' is-here' : ''}`}>
      <p className="study-label">{label}</p>
      {children}
    </div>
  );
}

export default function StudyCard({ card, className = '', defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!card) return null;
  const hasGeneral = Boolean(card.meaning || card.condition || card.usage);
  const hasMore = hasGeneral || card.here?.length > 0;
  const bodyId = `study-${card.id}`;

  return (
    <article className={`study-card tone-${card.tone} ${className}`.trim()} data-kind={card.kind}>
      <header className="study-head">
        <p className="study-kind">
          <span>{card.kind}</span>
          {card.category && <span>{card.category}</span>}
        </p>
        <div className="study-title">
          <h4>
            <span className="study-name">{card.name}</span>
            {card.reading && <small className="study-reading">{card.reading}</small>}
          </h4>
          <span className="study-badges">
            {card.toneLabel && <b className={`study-badge tone-${card.tone}`}>{card.toneLabel}</b>}
            {(card.tags || []).map((tag) => <b key={tag} className="study-badge is-tag">{tag}</b>)}
          </span>
        </div>
      </header>

      <Block label="ひとことで">
        <p className="study-gist">{card.gist}</p>
      </Block>

      {hasMore && (
        <>
          {open && (
            <div className="study-more" id={bodyId}>
              {card.meaning && (
                <Block label={`${card.kind}の意味`}>
                  <p>{card.meaning}</p>
                </Block>
              )}
              {card.condition && (
                <Block label="成立する条件">
                  <p>{card.condition}</p>
                </Block>
              )}
              {card.usage && (
                <Block label="使い方の目安">
                  <p>{card.usage}</p>
                </Block>
              )}
              {card.here?.length > 0 && (
                <Block label="今回の盤では" here>
                  {card.here.map((line) => <p key={line}>{line}</p>)}
                </Block>
              )}
            </div>
          )}
          <button
            type="button"
            className="study-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={`${card.name}を${open ? '閉じる' : 'さらに詳しく'}`}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? '閉じる' : 'さらに詳しく'} <span aria-hidden="true">{open ? '−' : '＋'}</span>
          </button>
        </>
      )}
    </article>
  );
}
