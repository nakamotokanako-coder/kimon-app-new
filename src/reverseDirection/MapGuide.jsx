import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

// 地図の見方・使い方（色とピンの意味、お気に入りの登録のしかた）。
// 地図の上の「？ 使い方」から開く。見本のピンは、実際の地図と同じ見た目（同じ CSS）で描く。

const Pin = ({ tone, label, favorite = false }) => (
  <span className="map-guide-pin" aria-hidden="true">
    <span className={`direction-poi-pin is-${tone}${favorite ? ' is-favorite' : ''} is-numbered`}><span>{label}</span></span>
  </span>
);

const Swatch = ({ tone }) => <i className={`legend-swatch tone-${tone}`} aria-hidden="true" />;

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
    <div className="intro-page legal-page map-guide" role="dialog" aria-modal="true" aria-label="地図の使い方">
      <button type="button" className="intro-close" aria-label="閉じる" onClick={onClose}>
        <span aria-hidden="true">×</span>
      </button>
      <div className="intro-inner">
        <header className="legal-head">
          <h2>地図の使い方</h2>
          <p>色とピンの意味、お気に入りの登録のしかたをまとめました。</p>
        </header>

        <section className="legal-section">
          <h3>方位の色</h3>
          <p>基準点から8つの方位に、扇の形で色が付いています。</p>
          <ul className="map-guide-list">
            <li><Swatch tone="great" /><span><b>濃い青</b>：大吉。その時間でとくに使いやすい方位</span></li>
            <li><Swatch tone="weak" /><span><b>うすい青</b>：吉</span></li>
            <li><Swatch tone="neutral" /><span><b>灰色</b>：良くも悪くもない方位</span></li>
            <li><Swatch tone="bad" /><span><b>赤</b>：凶。できれば避けたい方位</span></li>
          </ul>
          <p>「BEST」の札は、その時間で一番点数の高い方位です。方位を押すと金色の枠が付き、地図の下に、その方位の内容と「場所を探す」ボタンが出ます。</p>
        </section>

        <section className="legal-section">
          <h3>ピンの色と数字</h3>
          <p>カフェなどを探すと、地図にピンが立ちます。ピンの色は、その場所が入っている方位の吉凶です。</p>
          <ul className="map-guide-list">
            <li><Pin tone="good" label="1" /><span><b>青いピン</b>：吉方位にある場所</span></li>
            <li><Pin tone="bad" label="2" /><span><b>赤いピン</b>：凶方位にある場所</span></li>
            <li><Pin tone="neutral" label="3" /><span><b>灰色のピン</b>：良くも悪くもない方位にある場所</span></li>
            <li><Pin tone="good" label="+" favorite /><span><b>金色のふちの大きなピン</b>：お気に入りに登録した場所</span></li>
          </ul>
          <p>ピンの数字は、地図の下の一覧の番号と同じです。赤いピンを出したくないときは、「吉方位のみ表示」をオンにしてください。</p>
        </section>

        <section className="legal-section">
          <h3>お気に入りに登録する</h3>
          <ol className="map-guide-steps">
            <li>「カフェ」などのボタンか、検索の欄で場所を探します。</li>
            <li>地図の下の一覧で、登録したい場所の <b>☆</b> を押します。地図のピンを押して「お気に入りに追加」でも登録できます。</li>
            <li>登録した場所は、地図の下の「お気に入り」に並びます。押すと、その場所が地図に出ます。</li>
          </ol>
          <p>名前の変更と削除は、「お気に入り」の「すべて見る」を開いて、鉛筆のしるし（✎）からできます。</p>
        </section>

        <section className="legal-section">
          <h3>拠点にする</h3>
          <p>自宅や職場など、よく出発する場所は「拠点にする」を押しておくと、基準点を選ぶときに上のほうに出ます。ピンを押したときの小さな窓か、お気に入りの編集から設定できます。</p>
        </section>

        <section className="legal-section">
          <h3>そのほかのボタン</h3>
          <ul>
            <li><b>現在地</b>：いまいる場所を地図に出します。基準点から見て、どの方位にいるかが分かります。</li>
            <li><b>距離（500m・2km など）</b>：基準点からその距離までが入るように、地図の大きさを合わせます。</li>
            <li><b>方位設定</b>：方位の線の引き方（平面・球面、偏角の補正）を変えます。ふだんはそのままで大丈夫です。</li>
            <li><b>全画面</b>：地図を画面いっぱいに広げます。</li>
          </ul>
        </section>

        <div className="intro-actions">
          <button type="button" className="account-btn account-btn-ghost" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );

  return createPortal(page, document.body);
}
