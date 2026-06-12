// lib/email.js
// Resend 経由のマジックリンク送信ラッパー。テストからは setEmailSender() で差し替え可能。
import { Resend } from 'resend';

let sender = null;

// env.MAGIC_LINK_FROM 未設定時の既定送信元。Resend の共有検証済み送信元を使う
// （架空ドメインのプレースホルダだと必ず 403 になり env 未適用を覆い隠すため）。
// 注: onboarding@resend.dev はアカウント所有者のアドレス宛てのみ送信可。任意宛ては要・検証済みドメイン。
export const DEFAULT_MAGIC_LINK_FROM = 'onboarding@resend.dev';

/** テスト用: 送信関数を差し替える（(email, url) => any）。実送信せず内容を捕捉できる。 */
export function setEmailSender(fn) {
  sender = fn;
}

/** 実際に使う from を返す（env優先・未設定なら既定）。 */
export function resolveMagicFrom(env = process.env) {
  return env.MAGIC_LINK_FROM || DEFAULT_MAGIC_LINK_FROM;
}

/** from の出所（'env' | 'fallback'）。env が効いているかをログで確認するため。 */
export function magicFromSource(env = process.env) {
  return env.MAGIC_LINK_FROM ? 'env' : 'fallback';
}

/** マジックリンクを送信する。env.RESEND_API_KEY / env.MAGIC_LINK_FROM を使用。
 *  Resend SDK は API エラー時に throw せず { data, error } を resolve するため、
 *  error を検査して握りつぶさない（ログに残し throw する）。
 *  ※ ログには Resend の error オブジェクト（name/statusCode/message）のみ。
 *    メール本文・マジックリンクURL・トークンは出さない。 */
export async function sendMagicLink(email, url, env = process.env) {
  if (sender) return sender(email, url);
  const resend = new Resend(env.RESEND_API_KEY);
  const from = resolveMagicFrom(env);
  const { data, error } = await resend.emails.send({
    from,
    to: email,
    subject: 'ログインリンク（奇門アプリ）',
    text: `下記のリンクを開くとログインできます（15分間有効）。\n\n${url}\n\n心当たりがない場合はこのメールを破棄してください。`,
    html:
      '<p>下記のボタンからログインできます（15分間有効）。</p>'
      + `<p><a href="${url}">ログインする</a></p>`
      + `<p>リンクが開けない場合は次のURLをブラウザに貼り付けてください：<br>${url}</p>`
      + '<p>心当たりがない場合はこのメールを破棄してください。</p>',
  });
  if (error) {
    // Resend 側の拒否理由を可視化（name/statusCode/message のみ。本文/URL/トークンは出さない）。
    console.error('[auth] resend send failed', {
      name: error.name,
      statusCode: error.statusCode,
      message: error.message,
    });
    throw new Error(`resend_error:${error.name || 'unknown'}`);
  }
  return data;
}
