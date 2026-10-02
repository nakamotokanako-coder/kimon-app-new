// lib/accessPolicy.js
// 「誰がどこまで使えるか」の唯一の定義（サーバー API とクライアント UI の両方から import する純関数）。
//
//   ACCESS_MODE = 'beta' … ログインすれば全機能（決済導入前のベータ期間）
//   ACCESS_MODE = 'paid' … 有料会員（status==='paid'）だけが全機能
//
// 未ログイン（および 'paid' モードの無料会員）は「今日の盤の閲覧」だけ。
// 販売開始時はここを 'paid' に切り替えるだけで、全画面・全 API の出し分けが揃って変わる。

export const ACCESS_MODE = 'beta';

/** 全機能（詳しい解説・吉方位・日付変更・検索など）を使えるか */
export function hasFullAccess({ loggedIn, status } = {}, mode = ACCESS_MODE) {
  if (!loggedIn) return false;
  if (mode === 'beta') return true;
  return status === 'paid';
}

/** 未ログイン・無料の人に出す案内文（全画面で同じ文言を使う） */
export function lockedMessage(mode = ACCESS_MODE) {
  return mode === 'beta'
    ? 'ログインすると、ベータ期間中は全機能を無料で使えます。'
    : 'この機能はプロ版でご利用いただけます。';
}
