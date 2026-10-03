// api/auth/sessions.js
// ログイン中の端末の一覧と、端末ごとのログアウト（設定画面「ログイン中の端末」用）。
//   GET  /api/auth/sessions → { max, sessions: [{ id, label, lastSeenAt, current }] }（最近使った順）
//   POST /api/auth/sessions  body: { id } → その端末をログアウト（自分のアカウントの端末だけ）
import { getActiveSession, liveSessions, revokeSession, MAX_DEVICES } from '../../lib/auth.js';

function readId(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return typeof body?.id === 'string' ? body.id : '';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }

  const active = await getActiveSession(req);
  if (!active) return res.status(401).json({ error: 'not_logged_in' });

  if (req.method === 'POST') {
    const id = readId(req);
    if (!id || !liveSessions(active.user).some((s) => s.sid === id)) {
      return res.status(400).json({ error: 'unknown_session' });
    }
    await revokeSession(active.email, id);
    return res.status(200).json({ ok: true });
  }

  const sessions = liveSessions(active.user)
    .sort((a, b) => Date.parse(b.lastSeenAt || 0) - Date.parse(a.lastSeenAt || 0))
    .map((s) => ({ id: s.sid, label: s.label || '端末', lastSeenAt: s.lastSeenAt, current: s.sid === active.sid }));
  return res.status(200).json({ max: MAX_DEVICES, sessions });
}
