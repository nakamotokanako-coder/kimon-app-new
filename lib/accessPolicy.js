// lib/accessPolicy.js
// 「誰がどこまで使えるか」の唯一の定義（サーバー API とクライアント UI の両方から import する純関数）。
//
//   ACCESS_MODE = 'beta' … ログインすれば全機能（決済導入前のベータ期間）
//   ACCESS_MODE = 'paid' … 有料会員（status==='paid'）だけが全機能
//
// 未ログイン（および 'paid' モードの無料会員）は「今日の盤の閲覧」だけ。
// 販売開始時はここを 'paid' に切り替えるだけで、全画面・全 API の出し分けが揃って変わる。

export const ACCESS_MODE = 'beta';

/** プロ版の料金（表示用。実際の請求額は Stripe の価格 kimon_pro_monthly が正） */
export const PRO_PRICE_LABEL = '月額980円（税込）';
/** 年額プランの料金（表示用。実際の請求額は Stripe の価格 kimon_pro_annual が正） */
export const ANNUAL_PRICE_LABEL = '年額10,000円（税込）';

/**
 * 申し込みボタンを全員に見せるか。ベータ期間中は false（決済はテスト環境で動作確認だけ行う）。
 * 販売開始時に ACCESS_MODE='paid' にすると自動で見えるようになる。
 * false の間も、アドレスに ?billing=preview を付けて開いた端末にだけ表示する（動作確認用）。
 */
export function isBillingUiVisible(mode = ACCESS_MODE) {
  return mode === 'paid';
}

/**
 * 有料会員として有効か。status==='paid' かつ、有料期限（paidUntil: ISO日時）が未設定か未来のとき。
 * 月額サブスクは決済のたびに paidUntil を延ばす。更新が止まれば期限切れで自動的に無料に戻る
 * （status を書き換え忘れても期限で止まる）。
 */
export function isPaidActive({ status, paidUntil } = {}, now = Date.now()) {
  if (status !== 'paid') return false;
  if (!paidUntil) return true;
  const until = Date.parse(paidUntil);
  return Number.isFinite(until) && until > now;
}

/** 全機能（詳しい解説・吉方位・日付変更・検索など）を使えるか */
export function hasFullAccess({ loggedIn, status, paidUntil } = {}, mode = ACCESS_MODE, now = Date.now()) {
  if (!loggedIn) return false;
  if (mode === 'beta') return true;
  return isPaidActive({ status, paidUntil }, now);
}

/** 未ログイン・無料の人に出す案内文（全画面で同じ文言を使う） */
export function lockedMessage(mode = ACCESS_MODE) {
  return mode === 'beta'
    ? 'ログインすると、ベータ期間中は全機能を無料で使えます。'
    : 'この機能はプロ版でご利用いただけます。';
}

/**
 * 吉日・吉方位の検索で、3ヶ月以上の期間を年額プラン限定にするか。
 * 年額プランを売り始めるまでは false（全員が1年先まで検索できる。鍵も出さない）。
 * true にすると、年額プラン（user.plan === 'annual'）以外には鍵つきで見せ、押すと案内を出す。
 * 月額プランの人も鍵つきになる（年額だけの機能）。
 */
export const LONG_RANGE_REQUIRES_ANNUAL = false;

/** 3ヶ月以上の検索が、この人には鍵つきか */
export function isLongRangeLocked({ plan, invited } = {}, required = LONG_RANGE_REQUIRES_ANNUAL) {
  // 招待した人（lib/invite.js）は、年額の機能も使える。
  return Boolean(required) && plan !== 'annual' && !invited;
}

/**
 * 3ヶ月以上の期間に「年額」の印を出すか（鍵をかけていなくても出す）。
 * 知り合いに見せるベータ期間は、印は出すが開けておく: 印 = true / LONG_RANGE_REQUIRES_ANNUAL = false。
 * 「年額プランの機能だが、いまは試せる」と伝えるため。
 */
export const LONG_RANGE_SHOW_ANNUAL_MARK = true;
