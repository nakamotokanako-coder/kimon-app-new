// api/auth/request.js
// POST /api/auth/request  body: { email }
//   - email を小文字化・trim・形式検証
//   - レート制限: cooldown:{email} TTL60秒（期間内は 429）
//   - ワンタイムトークン（randomBytes 32B hex）を magic:{token}→email TTL15分で保存
//   - Resend でマジックリンク送信（/api/auth/verify?token=...）
//   - 存在秘匿のため成功は常に同形（登録済みか否かを返さない）
import { randomBytes } from 'node:crypto';
import { kv } from '../../lib/kv.js';
import { sendMagicLink } from '../../lib/email.js';
import { buildOrigin } from '../../lib/session.js';

const MAGIC_TTL_SEC = 15 * 60;
const COOLDOWN_TTL_SEC = 60;
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

  // レート制限（NXで原子的に確保。既存なら 429）。
  const reserved = await kv().set(`cooldown:${email}`, '1', { nx: true, ex: COOLDOWN_TTL_SEC });
  if (!reserved) {
    return res.status(429).json({ error: 'rate_limited' });
  }

  const token = randomBytes(32).toString('hex');
  await kv().set(`magic:${token}`, email, { ex: MAGIC_TTL_SEC });

  const url = `${origin}/api/auth/verify?token=${token}`;
  try {
    await sendMagicLink(email, url);
  } catch (err) {
    // 存在秘匿のため送信成否に関わらず 200 を維持。失敗はログにのみ残す。
    // err.message は 'resend_error:<name>' 形式（詳細な error は lib 側で記録済み）。
    // メール本文・マジックリンクURL・トークンはログに出さない。
    console.error('[auth] magic link send failed', err?.message || String(err));
  }

  // 存在秘匿: 常に同じ成功レスポンス。
  return res.status(200).json({ ok: true });
}
