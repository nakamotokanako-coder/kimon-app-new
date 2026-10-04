import React, { useEffect } from 'react';
import { ACCESS_MODE, PRO_PRICE_LABEL } from '../../lib/accessPolicy.js';

// アプリの紹介ページ。「何ができて、ログインすると何が増えて、いくらか」を1枚で伝える。
//   - 初めて来た未ログインの人に1回だけ自動で出す（INTRO_SEEN_KEY）
//   - 設定 →「このアプリについて」→「このアプリの紹介」、またはアドレスに ?about を付けても開ける
// 書いてある機能は実際にあるものだけ。効果をうたう表現（運が上がる 等）は書かない。

export const INTRO_SEEN_KEY = 'kimon-intro-seen';

export function hasSeenIntro() {
  try {
    return window.localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return true; // 保存できない環境で毎回出し続けない
  }
}

export function markIntroSeen() {
  try {
    window.localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // 保存できなくても閉じることはできる
  }
}

const FEATURES = [
  {
    title: '時盤・日盤をすぐに引ける',
    body: '日付と時刻を選ぶだけで盤が出ます。8方位それぞれの点数と吉凶が、ひと目で分かります。',
  },
  {
    title: '「なぜその評価か」まで読める',
    body: '八門・九星・八神・十干剋応・格局の内訳を、点数つきで確認できます。ご縁・仕事・金運・健康・勉強の5テーマごとに、方位の使い方を文章で解説します。',
  },
  {
    title: '吉方位を地図で確かめられる',
    body: '基準点から見た8方位を地図に重ねて、行きたい場所がどの方位に入るかを確かめられます。よく行く場所はお気に入りに登録できます。',
  },
  {
    title: '日取りを探せる',
    body: '日盤ランキング、格局からの日時検索、吉を3つつないで巡る奇門三盤ルートで、条件に合う日と方位を探せます。',
  },
];

export function priceLines(mode = ACCESS_MODE) {
  return mode === 'beta'
    ? ['いまはベータ期間です。ログインすると、全機能を無料で使えます。', `正式版は${PRO_PRICE_LABEL}の予定です。`]
    : [`プロ版は${PRO_PRICE_LABEL}。1か月ごとの自動更新で、いつでも解約できます。`];
}

export default function IntroPage({ loggedIn, onClose, onLogin }) {
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

  return (
    <div className="intro-page" role="dialog" aria-modal="true" aria-label="このアプリの紹介">
      <button type="button" className="intro-close" aria-label="閉じる" onClick={onClose}>
        <span aria-hidden="true">×</span>
      </button>
      <div className="intro-inner">
        <header className="intro-hero">
          <span className="brand-mark intro-mark" aria-hidden="true">遁</span>
          <p className="intro-kicker lat">KIMON TONKO</p>
          <h2 className="intro-title">奇門遁甲Z</h2>
          <p className="intro-lead">
            奇門遁甲の盤を引いて、読んで、<br />
            吉方位を地図で確かめるためのアプリです。
          </p>
          <p className="intro-sub">奇門遁甲を学んでいる方、鑑定に使う方に向けて作っています。</p>
        </header>

        <section className="intro-section" aria-label="できること">
          <h3 className="intro-heading">できること</h3>
          <ol className="intro-features">
            {FEATURES.map((f, i) => (
              <li key={f.title} className="intro-feature">
                <span className="intro-feature-no lat" aria-hidden="true">{i + 1}</span>
                <div>
                  <strong>{f.title}</strong>
                  <p>{f.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="intro-section" aria-label="ログインについて">
          <h3 className="intro-heading">ログインすると</h3>
          <div className="intro-compare">
            <div>
              <span className="intro-compare-label">ログインなし</span>
              <p>今日の盤と、方位ごとの短い解説を見られます。</p>
            </div>
            <div className="is-full">
              <span className="intro-compare-label">ログインあり</span>
              <p>日付を自由に選べます。詳しい解説、吉方位の地図、日取りの検索まで、すべての機能を使えます。</p>
            </div>
          </div>
          <p className="intro-note">ログインはメールアドレスだけ。パスワードは要りません。</p>
        </section>

        <section className="intro-section" aria-label="料金">
          <h3 className="intro-heading">料金</h3>
          {priceLines().map((line) => <p key={line} className="intro-price">{line}</p>)}
        </section>

        <div className="intro-actions">
          {!loggedIn && (
            <button type="button" className="account-btn intro-cta" onClick={onLogin}>
              ログインして使う
            </button>
          )}
          <button type="button" className={`account-btn ${loggedIn ? 'intro-cta' : 'account-btn-ghost'}`} onClick={onClose}>
            {loggedIn ? '閉じる' : 'まず今日の盤を見る'}
          </button>
        </div>
      </div>
    </div>
  );
}
