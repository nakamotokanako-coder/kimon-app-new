import React, { useEffect, useState } from 'react';
import Ja from '../utils/Ja.jsx';
import { markOmamoriOpened } from '../notifications/dynamicNotices.js';
import { CHARM_IMAGE_IDS } from '../kimon/charmImages.js';

// 「今日のお守り」（日盤）／「この時間のお守り」（時盤）の表示。
// 中身は src/kimon/charm.js の getCharm が盤から決める（ランダムではない）。
//   閉じた帯 → 開くと「取り入れるもの」と「どう使うか」→「なぜこれがお守りになる？」で根拠（方位・門・神・星・象意）
// 効果を言い切らない。吉方位へ実際に動く方法とは別の、補助的な取り入れ方として書く。

const COPY = {
  day: {
    title: '今日のお守り',
    sub: '吉方位へ行けない日の開運法',
    open: '今日のお守りを見る',
    lead: '吉方位へ行けない日の、小さな開運法。',
    takeLabel: '今日取り入れるもの',
    tail: '今日一日、吉のエッセンスとして取り入れてみてください。',
    dirTag: '今日の吉方位',
    cta: '今日の吉方位を詳しく見る',
    none: '今日の日盤には、吉の方位がありません。時盤の吉方位から「この時間のお守り」を見られます。',
  },
  hour: {
    title: 'この時間のお守り',
    sub: '予定を変えられないときの取り入れ方',
    open: 'この時間のお守りを見る',
    lead: '行かなければならないなら、その時間の吉を取り入れる。',
    takeLabel: 'この時間に取り入れるもの',
    tail: 'これから動くときのお守りとして、取り入れてみてください。',
    dirTag: 'この時間の吉方位',
    cta: 'この時間の吉方位を詳しく見る',
    none: 'この時間の時盤には、吉の方位がありません。次の時間帯のお守りを確かめてください。',
  },
};

/** お守りの画像（あるものだけ。public/charms/<ID>.webp。scripts/build_charm_images.py が用意する） */
function CharmImage({ id, name, small = false }) {
  if (!id || !CHARM_IMAGE_IDS.has(id)) return null;
  return (
    <img
      className={`charm-image${small ? ' is-small' : ''}`}
      src={`/charms/${id}.webp`}
      alt={name}
      width={small ? 56 : 180}
      height={small ? 56 : 180}
      loading="lazy"
      decoding="async"
    />
  );
}

const SCENES = [
  '仕事や通勤で、行く方向が決まっている日',
  '出張や旅行など、行き先を変えられない日',
  '病院・面接・商談など、予定が決まっている日',
];

export default function CharmCard({ charm, sourceType = 'day', validTime = '', onSeeDirection, defaultOpen = false, compact = false }) {
  const copy = COPY[sourceType] || COPY.day;
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [whyOpen, setWhyOpen] = useState(false);

  // 盤（日付・時辰）が変わったら、根拠の開閉は畳む。
  useEffect(() => {
    setWhyOpen(false);
  }, [charm?.sourcePalace, charm?.charm?.name, validTime]);

  const toggle = () => {
    if (!isOpen) markOmamoriOpened();
    setIsOpen((value) => !value);
  };

  const elements = charm ? [charm.elements.gate, charm.elements.deity, charm.elements.star].filter(Boolean) : [];

  return (
    <aside className={`charm${isOpen ? ' is-open' : ''}${compact ? ' is-compact' : ''}`} aria-label={copy.title}>
      <button type="button" className="charm-bar" aria-expanded={isOpen} onClick={toggle}>
        <span className="charm-seal" aria-hidden="true">福</span>
        <span className="charm-bar-text">
          <strong>{copy.title}</strong>
          {/* 細い帯（compact）は、閉じているあいだ題だけ（帯そのものが押せるため） */}
          {(isOpen || !compact) && <small>{isOpen ? copy.sub : copy.open}</small>}
        </span>
        <span className="charm-bar-chevron" aria-hidden="true">{isOpen ? '⌃' : compact ? '›' : '⌄'}</span>
      </button>

      {isOpen && (
        <div className="charm-sheet">
          <div className="charm-head">
            <p className="charm-lead"><Ja>{copy.lead}</Ja></p>
            {validTime && <p className="charm-valid">{validTime}</p>}
            <p className="charm-intro">
              <Ja>毎日、好きな方位へ動けるとは限りません。そんなときは、吉方位が持つ「象意」を、身につけるものや行動として日常に取り入れる、という考え方があります。</Ja>
            </p>
          </div>

          {charm ? (
            <div className="charm-paper">
              <p className="charm-take-label">{copy.takeLabel}</p>
              <CharmImage id={charm.charm.id} name={charm.charm.name} />
              <h3 className="charm-name"><Ja>{charm.charm.name}</Ja></h3>
              <p className="charm-category">{charm.charm.category}</p>
              <p className="charm-how"><Ja>{charm.charm.how}</Ja></p>
              <p className="charm-how"><Ja>{copy.tail}</Ja></p>

              <button
                type="button"
                className="charm-why-toggle"
                aria-expanded={whyOpen}
                onClick={() => setWhyOpen((value) => !value)}
              >
                なぜこれがお守りになる？ <span aria-hidden="true">{whyOpen ? '⌃' : '›'}</span>
              </button>

              {whyOpen && (
                <div className="charm-why">
                  <p className="charm-why-title">このお守りのもとになった吉方位</p>
                  <div className="charm-source">
                    <div className="charm-source-dir">
                      <strong>{charm.sourceDirection}</strong>
                      <span className="charm-source-tag">{copy.dirTag}</span>
                      <span className="charm-source-score lat">{charm.score > 0 ? '+' : ''}{charm.score}点</span>
                    </div>
                    {elements.length > 0 && (
                      <div className="charm-chips">
                        {elements.map((name) => <span key={name}>{name}</span>)}
                      </div>
                    )}
                  </div>
                  <p className="charm-why-text">
                    <Ja>{`${charm.sourceDirection}は「${charm.symbols.join('・')}」を表す方位です。その象意を日常で取り入れやすい形に置き換えて、「${charm.charm.name}」（${charm.charm.link}）を提案しています。`}</Ja>
                  </p>
                  <p className="charm-why-text"><Ja>{charm.reason}</Ja></p>
                  <p className="charm-why-text">
                    <Ja>吉方位へ実際に行けないときにも、その吉のエッセンスを日常へ取り入れる、という考え方です。吉方位へ動くことの代わりになるものではなく、補助的な取り入れ方です。</Ja>
                  </p>
                </div>
              )}

              {charm.alternatives.length > 0 && (
                <div className="charm-alt">
                  <p className="charm-section-title">ほかの取り入れ方</p>
                  <ul>
                    {charm.alternatives.map((alt) => (
                      <li key={alt.name} className={CHARM_IMAGE_IDS.has(alt.id) ? 'has-image' : undefined}>
                        <CharmImage id={alt.id} name={alt.name} small />
                        <strong><Ja>{alt.name}</Ja></strong>
                        <span><Ja>{alt.how}</Ja></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="charm-scenes">
                <p className="charm-section-title">こんな日に</p>
                <ul>
                  {SCENES.map((scene) => <li key={scene}><Ja>{scene}</Ja></li>)}
                </ul>
              </div>

              {onSeeDirection && (
                <button type="button" className="charm-cta" onClick={onSeeDirection}>
                  {copy.cta} <span aria-hidden="true">›</span>
                </button>
              )}
              <p className="charm-closing">あなたに、福がありますように。</p>
            </div>
          ) : (
            <div className="charm-paper">
              <p className="charm-how"><Ja>{copy.none}</Ja></p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
