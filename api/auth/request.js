// api/auth/request.js
// POST /api/auth/request  body: { email }
//   - email を小文字化・trim・形式検証
//   - レート制限: cooldown:{email} TTL60秒（期間内は 429）＋ 同一IPは1時間10通まで
//   - ワンタイムトークン（randomBytes 32B hex）を magic:{token}→email TTL15分で保存
//   - 6桁のログインコードを otp:{email}→{hash,attempts,token} TTL15分で保存（コードは HMAC で保存）
//   - Resend でマジックリンク＋コードを送信（/api/auth/verify?token=... / POST /api/auth/verify-code）
//   - 存在秘匿のため成功は常に同形（登録済みか否かを返さない）
import { randomBytes } from 'node:crypto';
import { kv } from '../../lib/kv.js';
import { sendMagicLink, magicFromSource, mailProvider } from '../../lib/email.js';
import { buildOrigin } from '../../lib/session.js';
import { clientIp, generateLoginCode, hashLoginCode } from '../../lib/auth.js';
import { loadInvites, mayLogin } from '../../lib/invite.js';

const MAGIC_TTL_SEC = 15 * 60;
const COOLDOWN_TTL_SEC = 60;
// 同じIPからの送信は1時間に10通まで（アドレスを変えて大量に送らせる悪用・送信元の評判悪化を防ぐ）。
const IP_LIMIT = 10;
const IP_WINDOW_SEC = 60 * 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readEmail(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const raw = body && typeof body.email === 'string' ? body.email : '';
  return raw.trim().toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const email = readEmail(req);
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  const origin = buildOrigin(req);
  if (!origin) return res.status(500).json({ error: 'origin_unavailable' });

  // 招待制（lib/invite.js）: 招待した人だけにログインのメールを送る。
  if (!mayLogin(email, await loadInvites({ fresh: true }))) {
    return res.status(403).json({ error: 'invite_only' });
  }

  // IP単位の上限（厳密な原子性は不要。概算で十分）。
  const ipKey = `ratelimit:ip:${clientIp(req)}`;
  const ipCount = Number(await kv().get(ipKey)) || 0;
  if (ipCount >= IP_LIMIT) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  await kv().set(ipKey, ipCount + 1, { ex: IP_WINDOW_SEC });

  // レート制限（NXで原子的に確保。既存なら 429）。
  const reserved = await kv().set(`cooldown:${email}`, '1', { nx: true, ex: COOLDOWN_TTL_SEC });
  if (!reserved) {
    return res.status(429).json({ error: 'rate_limited' });
  }

  const token = randomBytes(32).toString('hex');
  await kv().set(`magic:${token}`, email, { ex: MAGIC_TTL_SEC });

  // 6桁のコード（ホーム画面のアプリ内で入力してログインする用）。リンクと同じ15分で失効。
  const code = generateLoginCode();
  await kv().set(
    `otp:${email}`,
    { hash: hashLoginCode(email, code, process.env.SESSION_SECRET), attempts: 0, token },
    { ex: MAGIC_TTL_SEC },
  );

  const url = `${origin}/api/auth/verify?token=${token}`;
  // env が効いているかを常に可視化（'env' なら MAGIC_LINK_FROM 適用、'fallback' なら未適用）。
  // アドレス自体は出さず env|fallback の区別だけ。
  console.log('[auth] mail provider:', mailProvider(), '/ from source:', magicFromSource());
  try {
    await sendMagicLink(email, url, code);
  } catch (err) {
    // err.message は 'resend_error:<name>' / 'gmail_error:<code>' 形式（詳細は lib 側で記録済み）。
    // メール本文・マジックリンクURL・トークンはログに出さない。
    console.error('[auth] magic link send failed', err?.message || String(err));
    // 送れなかったのに「送りました」と見せない（届かないメールを待たせてしまう）。
    // 登録の有無は返していない（誰のアドレスでも同じ結果になる）ので、存在秘匿は崩れない。
    // すぐやり直せるように、待ち時間・コード・リンクも片づける。
    await Promise.all([
      kv().del(`cooldown:${email}`),
      kv().del(`otp:${email}`),
      kv().del(`magic:${token}`),
    ]);
    return res.status(502).json({ error: 'send_failed' });
  }

  // 存在秘匿: 送れたときは常に同じ成功レスポンス。
  return res.status(200).json({ ok: true });
}
