import React, { useEffect } from 'react';
import { ACCESS_MODE, ANNUAL_PRICE_LABEL, PRO_PRICE_LABEL } from '../../lib/accessPolicy.js';

// アプリの紹介ページ（LP）。「吉方位を探す → 行き先を選ぶ → 実際に動く」が伝わるようにする。
//   順番: HERO → 4ステップ → 2つの使い方 → その方位には何がある？ → 盤は簡略化しない → 無料・料金 → 最後の案内
//   - 初めて来た未ログインの人に1回だけ自動で出す（INTRO_SEEN_KEY）
//   - 設定 →「このアプリについて」→「このアプリの紹介」、またはアドレスに ?about を付けても開ける
// 載せているアプリの画面は、実際の画面を撮ったもの（public/lp/screen-*.webp・step-*.webp）。架空の画面は描かない。
// 風景・墨絵の画像は public/lp/ に置く（元の画像は 奇門遁甲用イメージ/。作り方は docs/lp_images.md）。
// 書いてある機能は実際にあるものだけ。効果をうたう表現（運が上がる・運を動かす 等）は書かない。

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

const IMG = '/lp';
export const MAIN_CTA = '今日の吉方位を見る';

// 使い方は、かんたん4ステップ（実際に使う順番）
export const STEPS = [
  {
    title: '日時を選ぶ',
    body: '知りたい日時を選ぶだけで、すぐに吉方位が表示されます。',
    image: 'step-date.webp',
    alt: '今日・明日・日付と、時間帯を選ぶ画面',
  },
  {
    title: '吉の理由がわかる',
    body: 'ご縁・仕事・金運・健康・勉強。目的に合わせて、吉の理由を読めます。',
    image: 'step-reason.webp',
    alt: '方位の点数と、テーマ別の相性が並ぶ画面',
  },
  {
    title: '地図で探す',
    body: '吉方位にあるカフェ・神社・公園などを、地図で探せます。',
    image: 'step-map.webp',
    alt: '8方位に色が付いた地図の画面',
  },
  {
    title: '実際に出かける',
    body: '気になる場所を見つけたら、あとは出かけるだけ。',
    image: 'spot-shrine.webp',
    alt: '緑に囲まれた神社の参道',
    photo: true,
  },
];

export const USAGES = [
  {
    key: 'now',
    label: 'NOW',
    title: '今から吉方位へ',
    lines: ['今日・現在地から', '行ける場所を探す'],
    cta: '今から行ける場所を見る',
    image: 'now-street.webp',
  },
  {
    key: 'plan',
    label: 'PLAN',
    title: '休みの日から旅先を探す',
    lines: ['休日・旅行の日から', '計画を立てて探す'],
    cta: '予定日から探す',
    image: 'plan-sea.webp',
  },
];

export const SPOTS = [
  { title: 'カフェでひと息', sub: '近くの吉方位で', image: 'spot-cafe.webp' },
  { title: '神社へお参り', sub: '散歩がてらに', image: 'spot-shrine.webp' },
  { title: '観光スポットへ', sub: '休みの日の遠出に', image: 'spot-sea.webp' },
  { title: 'お気に入りの店を探す', sub: 'いつもの暮らしに', image: 'spot-shop.webp' },
];

/** 料金の表示内容（実際の設定どおり。lib/accessPolicy.js） */
export function priceInfo(mode = ACCESS_MODE) {
  const plans = [PRO_PRICE_LABEL, ANNUAL_PRICE_LABEL];
  return mode === 'beta'
    ? {
      status: '現在、ベータ期間中',
      badge: ['β期間中', '無料'],
      lead: 'ログインすると、すべての機能を無料で使えます。',
      plansLabel: '正式版（予定）',
      plans,
      note: '正式版は、いつでも解約できます。',
    }
    : {
      status: 'プロ版',
      badge: ['プロ版', '有料'],
      lead: 'すべての機能を使えます。',
      plansLabel: 'プラン',
      plans,
      note: '自動更新です。いつでも解約できます。',
    };
}

const Arrow = () => <span className="lp-arrow" aria-hidden="true">→</span>;

// 実際のアプリ画面を、スマホの枠に入れて見せる
function Phone({ src, alt, className = '' }) {
  return (
    <div className={`lp-phone ${className}`.trim()}>
      <img src={`${IMG}/${src}`} alt={alt} loading="lazy" decoding="async" />
    </div>
  );
}

export default function IntroPage({ loggedIn, onClose, onLogin, onOpenToday, onOpenNow, onOpenPlan }) {
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

  const price = priceInfo();
  const openToday = onOpenToday || onClose;
  const usageActions = { now: onOpenNow || onClose, plan: onOpenPlan || onClose };

  return (
    <div className="intro-page lp" role="dialog" aria-modal="true" aria-label="このアプリの紹介">
      <button type="button" className="intro-close" aria-label="閉じる" onClick={onClose}>
        <span aria-hidden="true">×</span>
      </button>

      {/* 1. HERO */}
      <header className="lp-hero" style={{ backgroundImage: `url(${IMG}/hero-ink.webp)` }}>
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-brand"><span className="brand-mark" aria-hidden="true">遁</span>奇門遁甲Z</p>
            <h2 className="lp-h1"><span>今日、</span><span>どっちへ行く？</span></h2>
            <p className="lp-tagline">吉方位を、日常の行き先へ</p>
            <p className="lp-hero-text">奇門遁甲の知恵を、今日という一日に。吉方位から、行き先を見つけるアプリです。</p>
            <button type="button" className="lp-cta" onClick={openToday}>{MAIN_CTA} <Arrow /></button>
            <p className="lp-cta-note">登録なしでも、今日の盤が見られます</p>
          </div>
          <div className="lp-hero-visual">
            <img className="lp-deco lp-deco-compass" src={`${IMG}/compass.webp`} alt="" aria-hidden="true" />
            <img className="lp-deco lp-deco-crane" src={`${IMG}/crane.webp`} alt="" aria-hidden="true" />
            <Phone src="screen-home.webp" alt="奇門遁甲Zのホーム画面。今から使える吉方位と点数が出ている" />
          </div>
        </div>
      </header>

      {/* 2. 4ステップ */}
      <section className="lp-section" aria-label="使い方は、かんたん4ステップ">
        <div className="lp-wrap">
          <h3 className="lp-h2"><span>使い方は、</span><span>かんたん<b>4</b>ステップ</span></h3>
          <ol className="lp-steps">
            {STEPS.map((step, index) => (
              <li key={step.title} className="lp-step">
                <span className="lp-step-no lat" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <h4>{step.title}</h4>
                <div className={`lp-step-image${step.photo ? ' is-photo' : ''}`}>
                  <img src={`${IMG}/${step.image}`} alt={step.alt} loading="lazy" decoding="async" />
                </div>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 3. 2つの使い方 */}
      <section className="lp-section" aria-label="2つの使い方">
        <div className="lp-wrap">
          <h3 className="lp-h2"><b>2</b>つの使い方</h3>
          <p className="lp-sub">シーンに合わせて、好きな使い方を選べます。</p>
          <div className="lp-usages">
            {USAGES.map((usage) => (
              <article key={usage.key} className={`lp-usage is-${usage.key}`} style={{ backgroundImage: `url(${IMG}/${usage.image})` }}>
                <div className="lp-usage-body">
                  <span className="lp-usage-label lat">{usage.label}</span>
                  <h4>{usage.title}</h4>
                  <p>{usage.lines.map((line) => <span key={line}>{line}</span>)}</p>
                  <button type="button" className="lp-cta is-small" onClick={usageActions[usage.key]}>{usage.cta} <Arrow /></button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 4. その方位には、何がある？ */}
      <section className="lp-section lp-map" aria-label="その方位には、何がある？">
        <div className="lp-wrap lp-map-grid">
          <div className="lp-map-visual">
            <img className="lp-deco lp-deco-lotus" src={`${IMG}/lotus.webp`} alt="" aria-hidden="true" />
            <Phone src="screen-map.webp" alt="奇門遁甲Zの地図の画面。8つの方位に色が付き、点数が出ている" />
          </div>
          <div className="lp-map-copy">
            <h3 className="lp-h2 is-left">その方位には、何がある？</h3>
            <p className="lp-lead">方位を見るだけでなく、その先にある場所まで探せます。</p>
            <p className="lp-text">吉方位にあるカフェ・神社・公園などを、地図でまとめて表示します。</p>
            <ul className="lp-spots">
              {SPOTS.map((spot) => (
                <li key={spot.title} className="lp-spot">
                  <img src={`${IMG}/${spot.image}`} alt="" loading="lazy" decoding="async" />
                  <strong>{spot.title}</strong>
                  <small>{spot.sub}</small>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 5. 盤は簡略化しない */}
      <section className="lp-section lp-pro" aria-label="盤は簡略化しない">
        <img className="lp-deco lp-deco-mountain" src={`${IMG}/ink-mountain.webp`} alt="" aria-hidden="true" />
        <img className="lp-deco lp-deco-compass-soft" src={`${IMG}/compass.webp`} alt="" aria-hidden="true" />
        <div className="lp-wrap lp-pro-body">
          <h3 className="lp-h2"><span>便利にしても、</span><span>盤は簡略化しない</span></h3>
          <p className="lp-lead">判断をアプリ任せにするための道具ではありません。</p>
          <p className="lp-text">八門・九星・八神・十干剋応・格局。8方位の評価のもとになる盤の情報は、すべて見られます。学ぶときにも、実際の鑑定にも使えます。</p>
        </div>
      </section>

      {/* 6. 無料・料金 */}
      <section className="lp-section" aria-label="無料と料金">
        <div className="lp-wrap lp-price">
          <div className="lp-price-badge" aria-hidden="true">
            <small>{price.badge[0]}</small>
            <strong>{price.badge[1]}</strong>
          </div>
          <div className="lp-price-free">
            <h3 className="lp-h3">まずは無料で使えます</h3>
            <ul>
              <li><b>ログインなし</b>今日の盤を見る</li>
              <li><b>ログインあり</b>すべての機能を使える</li>
            </ul>
            <p className="lp-price-note">ログインはメールアドレスだけ。パスワードはいりません。</p>
            {!loggedIn && (
              <button type="button" className="lp-link" onClick={onLogin}>ログインしてすべての機能を使う <Arrow /></button>
            )}
          </div>
          <div className="lp-price-card">
            <span>{price.plansLabel}</span>
            {price.plans.map((plan) => <strong key={plan}>{plan}</strong>)}
            <small>{price.note}</small>
          </div>
        </div>
      </section>

      {/* 7. 最後の案内 */}
      <section className="lp-final" aria-label="まとめ" style={{ backgroundImage: `url(${IMG}/final-sunset.webp)` }}>
        <div className="lp-wrap lp-final-body">
          <p className="lp-final-copy">
            <span>探す</span><Arrow /><span>選ぶ</span><Arrow /><span>そして実際に動く</span>
          </p>
          <button type="button" className="lp-cta" onClick={openToday}>{MAIN_CTA} <Arrow /></button>
          <p className="lp-final-note">いつもの一歩を、吉方位へ</p>
        </div>
      </section>
    </div>
  );
}
