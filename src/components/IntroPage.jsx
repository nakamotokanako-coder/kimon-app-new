import React, { useEffect } from 'react';
import Ja from '../utils/Ja.jsx';
import { ACCESS_MODE, ANNUAL_PRICE_LABEL, PRO_PRICE_LABEL } from '../../lib/accessPolicy.js';

// アプリの紹介ページ。「奇門遁甲を、実際の予定と場所につなげる道具」であることを伝える。
//   前半: 使うと何ができるようになるか（4つの問い → 2つの使い方 → 盤は簡略化しない）
//   後半: ログイン・料金などのサービス情報 → 最後の案内
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

const HERO_BODY = [
  '盤を出して終わり、のアプリではありません。',
  ['いつ行くか', 'どちらへ行くか', 'その方位に何があるか'],
  '盤を読んで、日時を探して、地図で行き先まで見つけられます。',
];

// できること: 使う人の「問い」から始める。専門語は、何ができるかを言ったあとに出す。
const QUESTIONS = [
  {
    question: '今日、どっちへ行く？',
    body: [
      '日付と時刻を選ぶと、8方位の点数と吉凶が並びます。',
      'その時間に使いやすい方位が、すぐ分かります。',
    ],
    note: '時盤・日盤のどちらも引けます',
  },
  {
    question: 'なぜ、この方位が吉なの？',
    body: [
      '点数を出して終わりにはしません。',
      '八門・九星・八神・十干剋応・格局のどれで点数が上がり、どれで下がったのかを見られます。',
      'ご縁・仕事・金運・健康・勉強の5つのテーマごとに、その方位の使い方も読めます。',
    ],
  },
  {
    question: 'その方位には、何がある？',
    featured: true,
    body: [
      '吉方位は分かった。でも、どこへ行けばいい？ そこで止まらないようにしました。',
      '基準点から見た8方位を地図に重ねて、吉方位の中にある場所を探せます。',
      'カフェ、神社、公園、駅。実際に行ける場所まで、そのまま探せます。',
    ],
    emphasis: ['目的地から方位を見るだけでなく、', '方位から目的地を探せます。'],
  },
  {
    question: '次の休み、いつ・どっちへ行く？',
    body: ['行き先がまだ決まっていなくても大丈夫です。'],
    list: ['日付から、吉方位を探す。', '行きたい方位から、良い日を探す。', '格局などの条件から、日を探す。'],
    after: ['吉方位を3回つないで巡る「奇門三盤ルート」も探せます。'],
    closing: '予定に合う吉を探すことも、吉に合わせて予定を立てることもできます。',
  },
];

const USAGES = [
  {
    board: '時盤',
    title: '今から吉方位へ',
    body: [
      '散歩、買い物、カフェ、仕事。ふだんの移動で使える吉方位を探します。',
      '「今から出るなら、どっち？」を地図ですぐ見られます。',
    ],
    tag: '時盤 × 近場',
  },
  {
    board: '日盤',
    title: '休みの日から旅先を探す',
    body: [
      '休みの日や旅行の日を選んで、その日の吉方位から行き先を探します。',
      '行きたい場所が決まっていなくても、「この日なら、どっちへ行こう？」から旅を決められます。',
    ],
    tag: '日盤 × 遠出',
  },
];

const PRO_BODY = [
  '判断をアプリに任せてしまうための道具ではありません。',
  '八門・九星・八神・天盤干・地盤干・十干剋応・格局。判断のもとになる情報は、すべて見られるようにしています。',
  '点数だけ見て終わるのではなく、「なぜこの評価なのか」を自分の目で確かめられます。学ぶときにも、実際の鑑定にも使えるようにしています。',
];
const PRO_NOTE = '初心者向けに盤を簡単にはしていません。専門の情報はそのままに、「探す」「比べる」「地図で確かめる」ところを便利にしました。';

/** 料金の表示内容（実際の設定どおり。lib/accessPolicy.js） */
export function priceInfo(mode = ACCESS_MODE) {
  const plans = [PRO_PRICE_LABEL, ANNUAL_PRICE_LABEL];
  return mode === 'beta'
    ? {
      status: '現在、ベータ期間中',
      lead: 'ログインすると、すべての機能を無料で使えます。',
      plansLabel: '正式版（予定）',
      plans,
      note: '正式版は、いつでも解約できます。',
    }
    : {
      status: 'プロ版',
      lead: 'すべての機能を使えます。',
      plansLabel: 'プラン',
      plans,
      note: '自動更新です。いつでも解約できます。',
    };
}

const Paragraphs = ({ items }) => items.map((text) => <p key={text}><Ja>{text}</Ja></p>);

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

  const price = priceInfo();

  return (
    <div className="intro-page" role="dialog" aria-modal="true" aria-label="このアプリの紹介">
      <button type="button" className="intro-close" aria-label="閉じる" onClick={onClose}>
        <span aria-hidden="true">×</span>
      </button>
      <div className="intro-inner">
        <header className="intro-hero">
          <span className="brand-mark intro-mark" aria-hidden="true">遁</span>
          <p className="intro-kicker lat">KIMON TONKO Z</p>
          <p className="intro-name">奇門遁甲Z</p>
          <h2 className="intro-title">吉方位を、<wbr />日常の行き先へ</h2>
          <div className="intro-hero-body">
            <p><Ja>{HERO_BODY[0]}</Ja></p>
            <p className="intro-hero-three">
              {HERO_BODY[1].map((line) => <span key={line}>{line}</span>)}
            </p>
            <p><Ja>{HERO_BODY[2]}</Ja></p>
          </div>
          <p className="intro-sub"><Ja>奇門遁甲を学んでいる方、鑑定に使う方のために作りました。</Ja></p>
        </header>

        <section className="intro-section" aria-label="できること">
          <h3 className="intro-heading">できること</h3>
          <ol className="intro-questions">
            {QUESTIONS.map((q, i) => (
              <li key={q.question} className={`intro-question${q.featured ? ' is-featured' : ''}`}>
                <span className="intro-question-no lat" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <h4><Ja tail={4}>{q.question}</Ja></h4>
                <Paragraphs items={q.body} />
                {q.list && (
                  <ul className="intro-question-list">
                    {q.list.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                )}
                {q.after && <Paragraphs items={q.after} />}
                {q.emphasis && (
                  <p className="intro-emphasis">
                    {q.emphasis.map((line) => <span key={line}>{line}</span>)}
                  </p>
                )}
                {q.closing && <p className="intro-closing"><Ja>{q.closing}</Ja></p>}
                {q.note && <p className="intro-tag">{q.note}</p>}
              </li>
            ))}
          </ol>
        </section>

        <section className="intro-section" aria-label="2つの使い方">
          <h3 className="intro-heading">2つの使い方</h3>
          <p className="intro-statement">
            <span>今日の小さな移動にも</span>
            <span>次の旅にも</span>
          </p>
          <div className="intro-usages">
            {USAGES.map((u) => (
              <article key={u.board} className="intro-usage">
                <span className="intro-usage-board">{u.board}</span>
                <h4>{u.title}</h4>
                <Paragraphs items={u.body} />
                <p className="intro-tag">{u.tag}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="intro-section" aria-label="盤は簡略化しない">
          <p className="intro-statement">
            <span>便利にしても、</span>
            <span>盤は簡略化しない</span>
          </p>
          <div className="intro-prose">
            <Paragraphs items={PRO_BODY} />
          </div>
          <p className="intro-aside"><Ja>{PRO_NOTE}</Ja></p>
        </section>

        <section className="intro-section is-service" aria-label="ログインについて">
          <h3 className="intro-heading">ログインについて</h3>
          <div className="intro-compare">
            <div>
              <strong>ログインなしでも試せます</strong>
              <p><Ja>今日の盤と、方位ごとの短い解説は、ログインしなくても見られます。</Ja></p>
            </div>
            <div>
              <strong>ログインすると、すべての機能が使えます</strong>
              <p><Ja>日時を変える、詳しい解説を読む、吉方位を地図で見る、日取りを探す。ぜんぶ使えるようになります。</Ja></p>
              <p><Ja>ログインに使うのはメールアドレスだけ。パスワードはいりません。</Ja></p>
            </div>
          </div>
        </section>

        <section className="intro-section is-service" aria-label="料金">
          <h3 className="intro-heading">料金</h3>
          <div className="intro-price">
            <strong className="intro-price-status">{price.status}</strong>
            <p><Ja>{price.lead}</Ja></p>
            <dl className="intro-price-plans">
              <dt>{price.plansLabel}</dt>
              {price.plans.map((plan) => <dd key={plan}>{plan}</dd>)}
            </dl>
            <p className="intro-price-note">{price.note}</p>
          </div>
        </section>

        <section className="intro-final" aria-label="まとめ">
          <p className="intro-final-copy">
            <span>探す</span>
            <span>選ぶ</span>
            <span>そして実際に動く</span>
          </p>
          <p><Ja>盤の中で終わっていた吉方位を、ふだんの予定と、実際の場所へ。</Ja></p>
          <p className="intro-final-three">
            <span>奇門遁甲Zは、</span>
            <span><b>「いつ」</b><b>「どっち」</b><b>「どこへ」</b>をつなぎます。</span>
          </p>
          <div className="intro-actions">
            {loggedIn ? (
              <button type="button" className="account-btn intro-cta" onClick={onClose}>
                今日の吉方位を見る
              </button>
            ) : (
              <>
                <button type="button" className="account-btn intro-cta" onClick={onLogin}>
                  ログインしてすべての機能を使う
                </button>
                <button type="button" className="account-btn account-btn-ghost" onClick={onClose}>
                  まず今日の盤を見る
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
