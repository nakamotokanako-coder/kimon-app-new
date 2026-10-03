// api/auth/verify.js
// ログインリンクの受け口。
//   GET  /api/auth/verify?token=... → 「ログインする」ボタンだけの確認ページを返す（トークンは消費しない）
//   POST /api/auth/verify (token=...) → magic:{token} を取得→即削除（ワンタイム）→ セッションCookie発行 → トップへ
// GET で即ログインさせないのは、メールのセキュリティ機能（リンク先の事前チェック）がリンクを先に開いて
// ワンタイムトークンを使い切り、本人が開くと「リンクが無効です」になるのを防ぐため。
//   - 無効/期限切れは「リンクが無効です」の簡易HTML
//   - user:{email} 未作成時は { status:"free", sv:0, createdAt } で作成
import { kv } from '../../lib/kv.js';
import { buildOrigin } from '../../lib/session.js';
import { issueSession } from '../../lib/auth.js';

const PAGE_STYLE = 'font-family:sans-serif;max-width:30rem;margin:4rem auto;padding:0 1rem;line-height:1.8';

function page(res, status, title, body) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(
    '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<title>${title}</title></head>`
    + `<body style="${PAGE_STYLE}">${body}</body></html>`,
  );
}

function invalidHtml(res) {
  return page(
    res,
    400,
    'リンクが無効です',
    '<h1 style="font-size:1.2rem">リンクが無効です</h1>'
    + '<p>このログインリンクは期限切れか、すでに使用済みです。お手数ですが、もう一度ログインリンクを送信してください。</p>',
  );
}

function confirmHtml(res, token) {
  return page(
    res,
    200,
    'ログイン',
    '<h1 style="font-size:1.2rem">奇門遁甲アプリにログイン</h1>'
    + '<p>下のボタンを押すとログインが完了します。</p>'
    + '<form method="POST" action="/api/auth/verify">'
    + `<input type="hidden" name="token" value="${token}">`
    + '<button type="submit" style="font-size:1rem;padding:.7rem 1.6rem;border-radius:999px;border:0;background:#1f2937;color:#fff">ログインする</button>'
    + '</form>',
  );
}

const TOKEN_RE = /^[0-9a-f]{64}$/;

function readToken(req) {
  if (req.method === 'GET') return typeof req.query?.token === 'string' ? req.query.token.trim() : '';
  let body = req.body;
  if (typeof body === 'string') {
    body = Object.fromEntries(new URLSearchParams(body));
  }
  return body && typeof body.token === 'string' ? body.token.trim() : '';
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }

  const token = readToken(req);
  if (!token || !TOKEN_RE.test(token)) return invalidHtml(res);

  if (req.method === 'GET') {
    // 消費せずに存在だけ確認し、ボタンのページを返す。
    const pending = await kv().get(`magic:${token}`);
    if (!pending) return invalidHtml(res);
    return confirmHtml(res, token);
  }

  // ワンタイム: 取得できたら即削除。後続の同一トークンは無効になる。
  const email = await kv().get(`magic:${token}`);
  if (!email) return invalidHtml(res);
  await kv().del(`magic:${token}`);

  if (!(await issueSession(res, email))) return res.status(500).json({ error: 'server_misconfigured' });
  // リンクでログインしたら、同じメール宛てのコードも使えないようにする（片方だけ有効）。
  await kv().del(`otp:${email}`);

  const origin = buildOrigin(req) || '';
  res.setHeader('Location', `${origin}/`);
  // POST の後は 303（See Other）でトップへ GET させる。
  return res.status(303).end();
}
