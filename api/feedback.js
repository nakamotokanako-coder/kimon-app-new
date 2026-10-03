// api/feedback.js
// POST /api/feedback  body: { message } → 設定画面の「フィードバック」から送られた意見を受け取る。
//   - 本文は 1〜2000 文字。同一IPは1時間に5件まで
//   - KV に feedback:{日時}:{乱数} で保存（1年で自動削除）。ログイン中ならメールアドレスも添える
//   - 環境変数 FEEDBACK_TO が設定されていれば、その宛先にもメールで転送する（未設定なら保存のみ）
import { randomBytes } from 'node:crypto';
import { Resend } from 'resend';
import { kv } from '../lib/kv.js';
import { clientIp, getActiveSession } from '../lib/auth.js';
import { resolveMagicFrom } from '../lib/email.js';

const MAX_LEN = 2000;
const IP_LIMIT = 5;
const IP_WINDOW_SEC = 60 * 60;
const KEEP_SEC = 365 * 24 * 60 * 60;

function readMessage(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return typeof body?.message === 'string' ? body.message.trim() : '';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const message = readMessage(req);
  if (!message || message.length > MAX_LEN) return res.status(400).json({ error: 'invalid_message' });

  const ipKey = `ratelimit:feedback:${clientIp(req)}`;
  const count = Number(await kv().get(ipKey)) || 0;
  if (count >= IP_LIMIT) return res.status(429).json({ error: 'rate_limited' });
  await kv().set(ipKey, count + 1, { ex: IP_WINDOW_SEC });

  const active = await getActiveSession(req);
  const at = new Date().toISOString();
  const record = { message, at, email: active?.email || null, userAgent: String(req.headers?.['user-agent'] || '').slice(0, 200) };
  await kv().set(`feedback:${at}:${randomBytes(4).toString('hex')}`, record, { ex: KEEP_SEC });

  const to = process.env.FEEDBACK_TO;
  if (to && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: resolveMagicFrom(),
        to,
        subject: 'フィードバックが届きました（奇門アプリ）',
        text: `${message}\n\n---\n送信者: ${record.email || '未ログイン'}\n日時: ${at}\n端末: ${record.userAgent}`,
      });
      if (error) console.error('[feedback] resend failed', error.name);
    } catch (err) {
      // 転送に失敗しても、保存できていれば成功として返す
      console.error('[feedback] forward failed', err?.message || String(err));
    }
  }

  return res.status(200).json({ ok: true });
}
