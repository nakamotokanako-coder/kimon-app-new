// lib/email.js
// Resend 経由のマジックリンク送信ラッパー。テストからは setEmailSender() で差し替え可能。
import { Resend } from 'resend';
import nodemailer from 'nodemailer';

let sender = null;
let gmailTransportFactory = (options) => nodemailer.createTransport(options);

/** テスト用: Gmail の送信口を差し替える（(options) => ({ sendMail }))。 */
export function setGmailTransportFactory(fn) {
  gmailTransportFactory = fn || ((options) => nodemailer.createTransport(options));
}

// 送り方は2つ。
//   gmail : GMAIL_USER と GMAIL_APP_PASSWORD があるとき。Gmail から送る（無料・誰にでも送れる・1日500通まで）。
//   resend: それ以外。Resend は、独自ドメインを登録するまで「登録した本人のアドレス」にしか送れない。
export function mailProvider(env = process.env) {
  return env.GMAIL_USER && env.GMAIL_APP_PASSWORD ? 'gmail' : 'resend';
}

/** Gmail で1通送る。失敗したら throw する（理由はログに。本文・リンク・コード・パスワードは出さない）。 */
export async function sendViaGmail({ to, subject, text, html }, env = process.env) {
  const transport = gmailTransportFactory({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    // アプリ パスワードは4文字ずつ空白で区切って表示されるので、空白を取り除く。
    auth: { user: env.GMAIL_USER, pass: String(env.GMAIL_APP_PASSWORD).replace(/\s+/g, '') },
  });
  try {
    return await transport.sendMail({
      from: `${env.MAIL_FROM_NAME || '奇門遁甲Z'} <${env.GMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error('[auth] gmail send failed', { code: err?.code, responseCode: err?.responseCode });
    throw new Error(`gmail_error:${err?.code || 'unknown'}`);
  }
}

// env.MAGIC_LINK_FROM 未設定時の既定送信元。Resend の共有検証済み送信元を使う
// （架空ドメインのプレースホルダだと必ず 403 になり env 未適用を覆い隠すため）。
// 注: onboarding@resend.dev はアカウント所有者のアドレス宛てのみ送信可。任意宛ては要・検証済みドメイン。
export const DEFAULT_MAGIC_LINK_FROM = 'onboarding@resend.dev';

/** テスト用: 送信関数を差し替える（(email, url, code) => any）。実送信せず内容を捕捉できる。 */
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
export async function sendMagicLink(email, url, code, env = process.env) {
  if (sender) return sender(email, url, code);
  const message = {
    to: email,
    subject: `ログインコード ${code}（奇門遁甲Z）`,
    text: `ログインコード：${code}\n\n`
      + 'アプリのログイン画面にこのコードを入力してください（15分間有効）。\n'
      + 'ホーム画面に追加したアプリでは、リンクではなくコードの入力がおすすめです（リンクを開くと別のブラウザでログインしてしまうことがあります）。\n\n'
      + `ブラウザで使っている場合は、次のリンクからもログインできます：\n${url}\n\n`
      + '心当たりがない場合はこのメールを破棄してください。',
    html:
      '<p>ログインコード</p>'
      + `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>`
      + '<p>アプリのログイン画面にこのコードを入力してください（15分間有効）。<br>'
      + 'ホーム画面に追加したアプリでは、リンクではなくコードの入力がおすすめです（リンクを開くと別のブラウザでログインしてしまうことがあります）。</p>'
      + `<p>ブラウザで使っている場合は、こちらからもログインできます：<a href="${url}">ログインする</a></p>`
      + '<p>心当たりがない場合はこのメールを破棄してください。</p>',
  };
  if (mailProvider(env) === 'gmail') return sendViaGmail(message, env);
  const resend = new Resend(env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({ from: resolveMagicFrom(env), ...message });
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
