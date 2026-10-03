// api/auth/verify-code.js
// POST /api/auth/verify-code  body: { email, code } → 6桁のログインコードでログイン（JSON）
//
// ホーム画面に追加したアプリ（iPhone）は、ブラウザとログイン情報（Cookie）が別。メールのリンクを押すと
// 標準のブラウザが開いてそちらでログインしてしまうため、アプリの中でコードを入力してログインできるようにする。
//   - otp:{email} = { hash, attempts, token }（api/auth/request.js が作成・15分で失効）
//   - 1つのコードにつき入力ミスは5回まで（超えたらコードを無効化）
//   - 成功したらコードと同じメールのリンク（magic:{token}）も無効化し、セッションCookieを発行
import { kv } from '../../lib/kv.js';
import { issueSession, loginCodeMatches, LOGIN_CODE_MAX_ATTEMPTS } from '../../lib/auth.js';

function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body?.code === 'string' ? body.code.replace(/\s+/g, '') : '';
  return { email, code };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const { email, code } = readBody(req);
  if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'invalid_code' });

  const key = `otp:${email}`;
  const stored = await kv().get(key);
  if (!stored) return res.status(400).json({ error: 'expired' });

  if (!loginCodeMatches(stored, email, code, process.env.SESSION_SECRET)) {
    const attempts = (stored.attempts || 0) + 1;
    if (attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
      await kv().del(key);
      return res.status(400).json({ error: 'too_many_attempts' });
    }
    await kv().set(key, { ...stored, attempts }, { ex: 15 * 60 });
    return res.status(400).json({ error: 'invalid_code', remaining: LOGIN_CODE_MAX_ATTEMPTS - attempts });
  }

  await kv().del(key);
  if (stored.token) await kv().del(`magic:${stored.token}`);
  if (!(await issueSession(res, email))) return res.status(500).json({ error: 'server_misconfigured' });
  return res.status(200).json({ ok: true });
}
