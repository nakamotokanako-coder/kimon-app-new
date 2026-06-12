// api/auth/verify.js
// GET /api/auth/verify?token=...
//   - magic:{token} を取得→即削除（ワンタイム保証）
//   - 無効/期限切れは「リンクが無効です」の簡易HTML
//   - 有効なら user:{email} 未作成時に作成 { status:"free", createdAt }
//   - 署名付きセッションCookieを発行してアプリトップへリダイレクト（90日）
import { kv } from '../../lib/kv.js';
import { signSession, buildSessionCookie, buildOrigin, SESSION_MAX_AGE_SEC } from '../../lib/session.js';

function invalidHtml(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(400).send(
    '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>リンクが無効です</title></head>'
    + '<body style="font-family:sans-serif;max-width:30rem;margin:4rem auto;padding:0 1rem;line-height:1.8">'
    + '<h1 style="font-size:1.2rem">リンクが無効です</h1>'
    + '<p>このログインリンクは期限切れか、すでに使用済みです。お手数ですが、もう一度ログインリンクを送信してください。</p>'
    + '</body></html>',
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const token = typeof req.query?.token === 'string' ? req.query.token.trim() : '';
  if (!token) return invalidHtml(res);

  // ワンタイム: 取得できたら即削除。後続の同一トークンは無効になる。
  const email = await kv().get(`magic:${token}`);
  if (!email) return invalidHtml(res);
  await kv().del(`magic:${token}`);

  const secret = process.env.SESSION_SECRET;
  if (!secret) return res.status(500).json({ error: 'server_misconfigured' });

  // user レコードが無ければ free で作成。
  const userKey = `user:${email}`;
  const existing = await kv().get(userKey);
  if (!existing) {
    await kv().set(userKey, { status: 'free', createdAt: new Date().toISOString() });
  }

  const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  const cookie = buildSessionCookie(signSession({ email, exp }, secret));
  res.setHeader('Set-Cookie', cookie);

  const origin = buildOrigin(req) || '';
  res.setHeader('Location', `${origin}/`);
  return res.status(302).end();
}
