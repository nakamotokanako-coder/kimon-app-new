// lib/billingApi/line.js
// POST /api/billing?action=line → LINE 公式アカウントからの通知（Webhook）。
// リッチメニューのボタンが送る文字に合わせて返信する。ボタンは「テキスト」のアクションで作る
// （LINE の管理画面だけで作れる形。下の MENU の文字をそのまま送らせる）。
//   「今の吉方位」           → 今の時間帯の吉方位（時盤）
//   「次の休みの吉方位」     → 日付を選ぶボタンを出す → 選んだ日の吉方位（日盤）
//   「この方位はいつ行く？」 → 方位を選ぶボタンを出す → その方位が吉の日（日盤・これから30日）
//   「基準点を設定」         → 位置情報を送るボタンを出す → 時間帯を、その場所の経度に合わせる
//   「アプリと連携」         → 15分だけ使える連携用のリンクを返す（連携済みなら、今の会員の状態を返す）
//   - 上の文字と位置情報のほかには返信しない（公式アカウント側の応答メッセージや手動の返信を邪魔しない）
//   - 送るのは返信だけ（こちらから先に送るメッセージは使わない）
//   - 署名（x-line-signature）が合わない通知は受け付けない
//
// 基準点: 保存するのは「時間帯を何分ずらすか」だけ（KV の line:corr:{LINEのユーザーID}。1年で消える）。
// 送られた場所そのもの（緯度・経度・住所）は保存しない。
//
// アプリとの連携: LINE のユーザーとアプリの会員を結びつける（lib/lineLink.js）。結びついた会員が
// 全機能を使えるか（有料・期限・招待）は memberOfLineUser で見られる。今の4つのボタンは誰でも使える。
//
// 決済とは関係ないが、Vercel の Hobby プランは関数が12個までのため api/billing.js に同居させている。
// 署名の確認に加工前の本文が要る点も Stripe の Webhook と同じ。
//
// 環境変数: LINE_CHANNEL_SECRET（署名の確認）/ LINE_CHANNEL_ACCESS_TOKEN（返信）
import { createHmac, timingSafeEqual } from 'node:crypto';
import { kv } from '../kv.js';
import { buildOrigin } from '../session.js';
import {
  buildDayText, buildNowText, buildWhenText, correctionMinutes, isDateText, loadLineToday, restDayChoices,
} from '../lineToday.js';
import { createLinkToken, memberOfLineUser, unlinkByLineUser } from '../lineLink.js';
import { getBoardDate } from '../../src/utils/boardDate.js';

const REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const PROFILE_URL = 'https://api.line.me/v2/bot/profile/';
const CORR_KEEP_SEC = 365 * 24 * 60 * 60;
// 日本の時計で時間帯を決めているので、基準点は日本の経度の範囲だけ受け付ける。
const JAPAN_LNG = [122, 154];

/** リッチメニューのボタンが送る文字 */
export const MENU = {
  now: '今の吉方位',
  day: '次の休みの吉方位',
  when: 'この方位はいつ行く？',
  base: '基準点を設定',
  link: 'アプリと連携',
};

const corrKey = (userId) => `line:corr:${userId}`;

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  if (typeof req.rawBody === 'string' || Buffer.isBuffer(req.rawBody)) return Buffer.from(req.rawBody);
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export function isValidSignature(raw, signature, secret) {
  if (typeof signature !== 'string' || !signature) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const given = Buffer.from(signature, 'base64');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const textMessage = (text, items) => ({
  type: 'text',
  text,
  ...(items?.length ? { quickReply: { items: items.map((action) => ({ type: 'action', action })) } } : {}),
});

/** この人の「時間帯を何分ずらすか」。受け取っていない・読めないときは 0（日本の時計のまま） */
async function readCorrection(userId) {
  if (!userId) return 0;
  try {
    const value = Number(await kv().get(corrKey(userId)));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function dayPicker(now) {
  const today = getBoardDate(now);
  const choices = restDayChoices(now);
  return textMessage('いつの吉方位を見ますか？', [
    ...choices.map((choice) => ({ type: 'postback', label: choice.label, data: `day:${choice.date}`, displayText: choice.label })),
    { type: 'datetimepicker', label: '日付を選ぶ', data: 'day', mode: 'date', initial: choices[0].date, min: today, max: loadLineToday().max },
  ]);
}

function directionPicker() {
  return textMessage('どの方位へ行きますか？', loadLineToday().dirs.map((dir) => (
    { type: 'postback', label: dir, data: `when:${dir}`, displayText: dir }
  )));
}

function basePrompt() {
  return textMessage(
    '基準点にする場所（自宅など）の位置情報を送ってください。\n時間帯を、その場所の経度に合わせて見るようになります。\n保存するのは「何分ずらすか」だけで、場所そのものは保存しません。',
    [
      { type: 'location', label: '位置情報を送る' },
      { type: 'postback', label: '基準点をやめる', data: 'base:clear', displayText: '基準点をやめる' },
    ],
  );
}

async function saveBase(userId, longitude) {
  if (!Number.isFinite(longitude) || longitude < JAPAN_LNG[0] || longitude > JAPAN_LNG[1]) {
    return textMessage('日本の中の場所を送ってください。');
  }
  if (!userId) return textMessage('基準点を保存できませんでした。');
  const minutes = correctionMinutes(longitude);
  await kv().set(corrKey(userId), minutes, { ex: CORR_KEEP_SEC });
  const shift = minutes === 0
    ? '日本の時計とのずれはありません。'
    : `日本の時計より${Math.abs(minutes)}分${minutes > 0 ? '進めて' : '遅らせて'}見ます。`;
  return textMessage(`基準点を受け取りました。${shift}\n保存したのは、この「何分ずらすか」だけです。`, [
    { type: 'message', label: MENU.now, text: MENU.now },
  ]);
}

async function clearBase(userId) {
  if (userId) await kv().del(corrKey(userId));
  return textMessage('基準点をやめました。時間帯は、日本の時計のまま見ます。');
}

/** 'kanako@example.com' → 'ka***@example.com'（返信に会員のアドレスをそのまま出さない） */
export function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  return `${name.slice(0, 2)}***@${domain || ''}`;
}

/** LINE の表示名（連携の確認画面に出す）。取れなければ空 */
async function displayName(userId, token) {
  if (!token) return '';
  try {
    const res = await fetch(`${PROFILE_URL}${encodeURIComponent(userId)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return '';
    return String((await res.json())?.displayName || '');
  } catch {
    return '';
  }
}

async function linkAnswer(userId, appUrl, token) {
  if (!userId || !appUrl) return textMessage('いまは連携できません。時間をおいてもう一度お試しください。');
  const member = await memberOfLineUser(userId);
  if (member) {
    const plan = member.full
      ? (member.status === 'paid' ? 'プロ版をご利用中です。' : '全機能を使えます。')
      : '無料でご利用中です。';
    return textMessage(`アプリと連携しています（${maskEmail(member.email)}）。\n${plan}`, [
      { type: 'postback', label: '連携をやめる', data: 'link:clear', displayText: '連携をやめる' },
    ]);
  }
  const linkToken = await createLinkToken(userId, await displayName(userId, token));
  return textMessage([
    '下のリンクを開いて、アプリにログインしてください。画面の「連携する」を押すと、LINEとアプリの会員が結びつきます。',
    'リンクは15分だけ使えます。ほかの人には送らないでください。',
    `${appUrl}/?line=${linkToken}`,
  ].join('\n'));
}

/**
 * 通知1件に対する返信（返信しないものは null）
 * @param {string} [token] - チャネルアクセストークン（連携のときに LINE の表示名を取るのに使う）
 */
export async function answer(event, now, appUrl, token = '') {
  const userId = event?.source?.userId || '';
  const nowText = async () => textMessage(buildNowText(now, appUrl, await readCorrection(userId)));

  if (event?.type === 'message' && event.message?.type === 'location') {
    return saveBase(userId, Number(event.message.longitude));
  }
  if (event?.type === 'message' && event.message?.type === 'text') {
    const text = String(event.message.text || '').trim();
    if (text === MENU.day) return dayPicker(now);
    if (text === MENU.when || text === MENU.when.replace('？', '')) return directionPicker();
    if (text === MENU.base) return basePrompt();
    if (text === MENU.link) return linkAnswer(userId, appUrl, token);
    if (text.includes('吉方位')) return nowText();
    return null;
  }
  if (event?.type === 'postback') {
    const data = String(event.postback?.data || '');
    if (data === 'today') return nowText();
    if (data === 'base:clear') return clearBase(userId);
    if (data === 'link:clear') {
      if (userId) await unlinkByLineUser(userId);
      return textMessage('アプリとの連携をやめました。');
    }
    if (data === 'day' || data.startsWith('day:')) {
      const date = data === 'day' ? event.postback?.params?.date : data.slice(4);
      return isDateText(date) ? textMessage(buildDayText(date, appUrl)) : null;
    }
    if (data.startsWith('when:')) {
      const text = buildWhenText(data.slice(5), now, appUrl);
      return text ? textMessage(text) : null;
    }
  }
  return null;
}

async function reply(replyToken, message, token) {
  const res = await fetch(REPLY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [message] }),
  });
  if (!res.ok) console.error('[line] reply failed', res.status);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const secret = process.env.LINE_CHANNEL_SECRET;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!secret || !token) return res.status(503).json({ error: 'line_unavailable' });

  const raw = await readRawBody(req);
  if (!isValidSignature(raw, req.headers?.['x-line-signature'], secret)) {
    return res.status(401).json({ error: 'bad_signature' });
  }

  let events = [];
  try {
    events = JSON.parse(raw.toString('utf8')).events || [];
  } catch {
    return res.status(400).json({ error: 'bad_request' });
  }

  // 返信に失敗しても 200 を返す（LINE に同じ通知を送り直させない。返信用トークンは1回きり）。
  const appUrl = buildOrigin(req);
  for (const event of events) {
    if (!event.replyToken) continue;
    try {
      const message = await answer(event, new Date(), appUrl, token);
      if (message) await reply(event.replyToken, message, token);
    } catch (err) {
      console.error('[line] reply error', err?.message || String(err));
    }
  }
  return res.status(200).json({ ok: true });
}
