// lib/email.js
// Resend 経由のマジックリンク送信ラッパー。テストからは setEmailSender() で差し替え可能。
import { Resend } from 'resend';

let sender = null;

/** テスト用: 送信関数を差し替える（(email, url) => any）。実送信せず内容を捕捉できる。 */
export function setEmailSender(fn) {
  sender = fn;
}

/** マジックリンクを送信する。env.RESEND_API_KEY / env.MAGIC_LINK_FROM を使用。 */
export async function sendMagicLink(email, url, env = process.env) {
  if (sender) return sender(email, url);
  const resend = new Resend(env.RESEND_API_KEY);
  const from = env.MAGIC_LINK_FROM || 'login@kimon-app.example';
  return resend.emails.send({
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
}
