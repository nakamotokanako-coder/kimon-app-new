import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

// はじめての人向けの使い方ガイド。
//   実際に初めて使った人がつまずいた順に並べている:
//   時盤と日盤のどっちを見るのか → 今どっちへ行けばいいか → 行きたい場所が吉方位か調べる
//   → 地図にお店の名前が出ない理由 → 吉方位の中から行き先を探す → ピンの色 → お気に入り
// 検索の欄の下の「？ 説明書を見る」と、ホームの「使い方ガイド」から開く。
// 初めて地図を開いたときは、1回だけ自動で出る。
// 見本のピンは、実際の地図と同じ見た目（同じ CSS）で描く。
// 文章は yomiyasu の考え方で書く（ふだんの言葉・短い文・記号の飾りを使わない）。

export const MAP_GUIDE_SEEN_KEY = 'kimon-map-guide-seen';

export function hasSeenMapGuide() {
  try {
    return window.localStorage.getItem(MAP_GUIDE_SEEN_KEY) === '1';
  } catch {
    return true; // 保存できない環境で毎回出し続けない
  }
}

export function markMapGuideSeen() {
  try {
    window.localStorage.setItem(MAP_GUIDE_SEEN_KEY, '1');
  } catch {
    // 保存できなくても閉じることはできる
  }
}

const Pin = ({ tone, label, favorite = false }) => (
  <span className="map-guide-pin" aria-hidden="true">
    <span className={`direction-poi-pin is-${tone}${favorite ? ' is-favorite' : ''} is-numbered`}><span>{label}</span></span>
  </span>
);

const Swatch = ({ tone }) => <i className={`legend-swatch tone-${tone}`} aria-hidden="true" />;

// 見出しと本文。画面にも、文章の検査（テスト）にも同じものを使う。
export const GUIDE_SECTIONS = [
  {
    key: 'which',
    heading: 'まず、時盤と日盤のどっちを見る？',
    body: ['出かける先が近いか遠いかで、見る盤が変わります。'],
    cards: [
      {
        name: '時盤',
        title: '近所へ出かけるとき',
        lines: [
          '散歩、カフェ、買い物など、ふだんのお出かけに使います。',
          '吉方位は2時間ごとに変わります。',
          '500メートル以上はなれた場所へ行くか、5分以上かけて移動します。着いた先で5分以上過ごすのが目安です。',
        ],
      },
      {
        name: '日盤',
        title: '旅行や遠出のとき',
        lines: [
          '吉方位は1日ごとに変わります。',
          '50キロ以上はなれた場所へ行き、3時間以上そこで過ごすのが目安です。',
        ],
      },
    ],
    after: [
      '日盤で良い方位がない日でも、時盤には良い方位のある時間帯があります。近所へ出かけるなら、時盤を見てください。',
      '地図の画面では、上の「時盤」「日盤」で切り替えます。',
    ],
  },
  {
    key: 'now',
    heading: '今、どっちへ行けばいい？',
    body: [
      '下の「地図」を開くと、今の時間の8つの方位に色が付いています。',
    ],
    swatches: [
      ['great', '濃い青', 'とくに良い方位です'],
      ['weak', 'うすい青', '良い方位です'],
      ['neutral', '灰色', '良くも悪くもない方位です'],
      ['bad', '赤', 'できれば避けたい方位です'],
    ],
    after: [
      '「BEST」の札が付いているのが、その時間でいちばん点数の高い方位です。',
      '別の時間や明日のことを知りたいときは、地図の上の「今日」「明日」と時間帯を押してください。',
    ],
  },
  {
    key: 'place',
    heading: '行きたい場所が吉方位か調べる',
    steps: [
      '検索の欄に、場所の名前か住所を入れて「検索」を押します。',
      '地図にピンが立ちます。青いピンなら吉方位、赤いピンなら凶方位にある場所です。',
      '地図の下に「北西 +70」のように、その場所の方位と点数が出ます。',
    ],
    after: [
      'お店の名前では見つからないことがあります。そのときは住所を入れてください。住所は、Googleマップなどでお店を調べると分かります。',
      'Googleマップでそのお店を開き、「共有」で出るリンクをコピーして、検索の欄に貼り付ける方法もあります。',
      'よく行く場所は、一度探してお気に入りに登録しておくと、次からすぐ見られます。',
    ],
  },
  {
    key: 'labels',
    heading: '地図にお店の名前が出ないのはなぜ？',
    body: [
      'この地図は国土地理院の地図で、お店や施設の名前はあまり載っていません。Googleマップとは別の地図です。',
      '場所を探すときは、検索の欄か、「カフェ」「神社」などのボタンを使ってください。',
    ],
  },
  {
    key: 'direction',
    heading: '吉方位の中から行き先を探す',
    steps: [
      '地図の青い方位を押します。押した方位に金色の枠が付きます。',
      '地図の下に出る「カフェ」「神社」などから、探したいものを選びます。',
      '「北西でスポットを探す」のボタンを押すと、その方位にある場所だけが出ます。',
    ],
    after: ['見つからないときは、「Googleマップで探す」のリンクが出ます。'],
  },
  {
    key: 'pins',
    heading: 'ピンの色と数字',
    body: ['ピンの色は、その場所がある方位の吉凶です。'],
    pins: [
      ['good', '1', false, '青いピン', '吉方位にある場所'],
      ['bad', '2', false, '赤いピン', '凶方位にある場所'],
      ['neutral', '3', false, '灰色のピン', '良くも悪くもない方位にある場所'],
      ['good', '+', true, '金色のふちの大きなピン', 'お気に入りに登録した場所'],
    ],
    after: [
      'ピンの数字は、地図の下の一覧の番号と同じです。',
      '赤いピンを出したくないときは、「吉方位のみ表示」をオンにしてください。',
    ],
  },
  {
    key: 'favorite',
    heading: 'お気に入りに登録する',
    steps: [
      '検索の欄か、「カフェ」などのボタンで場所を探します。',
      '地図の下の一覧で、登録したい場所の星を押します。ピンを押して「お気に入りに追加」でも登録できます。',
      '登録した場所は、地図の下の「お気に入り」に並びます。押すと、その場所が地図に出ます。',
    ],
    after: [
      '名前の変更と削除は、「お気に入り」の「すべて見る」を開いて、鉛筆のしるしを押します。',
      '自宅や職場は「拠点にする」を押しておくと、出発する場所を選ぶときに上のほうに出ます。',
    ],
  },
  {
    key: 'buttons',
    heading: 'そのほかのボタン',
    items: [
      ['基準点の「変更」', '出発する場所を変えます。方位は、この場所から見た向きです。'],
      ['現在地', 'いまいる場所を地図に出します。出発する場所から見て、どの方位にいるかが分かります。'],
      ['500m・2km などの距離', 'その距離までが入るように、地図の大きさを合わせます。'],
      ['地図の設定', '方位の線の引き方を変えられます。ふだんはそのままで大丈夫です。地図を画面いっぱいに広げる「全画面」もここにあります。'],
    ],
  },
];

/** ガイドの文章を1つの文字列にする（文章の検査用） */
export function guideText() {
  return GUIDE_SECTIONS.flatMap((s) => [
    s.heading,
    ...(s.body || []),
    ...(s.cards || []).flatMap((c) => [c.title, ...c.lines]),
    ...(s.swatches || []).map((x) => `${x[1]}は、${x[2]}`),
    ...(s.steps || []),
    ...(s.pins || []).map((x) => `${x[3]}は、${x[4]}`),
    ...(s.items || []).map((x) => `${x[0]}は、${x[1]}`),
    ...(s.after || []),
  ]).join('\n');
}

export default function MapGuide({ onClose }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('sheet-scroll-lock');
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      root.classList.remove('sheet-scroll-lock');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const page = (
    <div className="intro-page legal-page map-guide" role="dialog" aria-modal="true" aria-label="使い方ガイド">
      <button type="button" className="intro-close" aria-label="閉じる" onClick={onClose}>
        <span aria-hidden="true">×</span>
      </button>
      <div className="intro-inner">
        <header className="legal-head">
          <h2>使い方ガイド</h2>
          <p>はじめての方が迷いやすいところを、順番にまとめました。</p>
          <p className="map-guide-again">このガイドは、地図の検索の欄の下にある「説明書を見る」から、いつでも開けます。</p>
        </header>

        {GUIDE_SECTIONS.map((section) => (
          <section key={section.key} className="legal-section">
            <h3>{section.heading}</h3>
            {(section.body || []).map((text) => <p key={text}>{text}</p>)}
            {section.cards && (
              <div className="map-guide-cards">
                {section.cards.map((card) => (
                  <div key={card.name} className="map-guide-card">
                    <span>{card.name}</span>
                    <strong>{card.title}</strong>
                    {card.lines.map((line) => <p key={line}>{line}</p>)}
                  </div>
                ))}
              </div>
            )}
            {section.swatches && (
              <ul className="map-guide-list">
                {section.swatches.map(([tone, name, text]) => (
                  <li key={tone}><Swatch tone={tone} /><span><b>{name}</b>　{text}</span></li>
                ))}
              </ul>
            )}
            {section.steps && (
              <ol className="map-guide-steps">
                {section.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            )}
            {section.pins && (
              <ul className="map-guide-list">
                {section.pins.map(([tone, label, favorite, name, text]) => (
                  <li key={name}><Pin tone={tone} label={label} favorite={favorite} /><span><b>{name}</b>　{text}</span></li>
                ))}
              </ul>
            )}
            {section.items && (
              <dl className="map-guide-items">
                {section.items.map(([name, text]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{text}</dd>
                  </div>
                ))}
              </dl>
            )}
            {(section.after || []).map((text) => <p key={text}>{text}</p>)}
          </section>
        ))}

        <div className="intro-actions">
          <button type="button" className="account-btn account-btn-ghost" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );

  return createPortal(page, document.body);
}
