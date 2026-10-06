import { openLegal } from '../legal/documents.js';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { ANNUAL_PRICE_LABEL, isBillingUiVisible, PRO_PRICE_LABEL } from '../../lib/accessPolicy.js';
import {
  isSyncEnabled, enableUserDataSync, disableUserDataSync, SYNC_SETTING_CHANGED_EVENT,
} from '../sync/userDataSync.js';

// 設定タブ「アカウント」セクションの中身。メールマジックリンクでログイン/ログアウトする。
// 認証状態・利用範囲の判定はすべてサーバー側（/api/auth/me → AuthContext）。ここでは表示だけ。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// コード入力待ちの状態を15分だけ端末に覚えておく。iPhone ではメールアプリへ切り替えた間に
// ホーム画面のアプリが再読み込みされることがあり、戻ったときにコード入力画面を出し直すため。
const PENDING_KEY = 'kimon-login-pending';
const PENDING_TTL_MS = 15 * 60 * 1000;

function readPending() {
  try {
    const p = JSON.parse(window.localStorage.getItem(PENDING_KEY) || 'null');
    if (p?.email && Date.now() - p.at < PENDING_TTL_MS) return p.email;
  } catch {
    // 保存領域が使えなくても通常どおり動く
  }
  return '';
}

function writePending(email) {
  try {
    if (email) window.localStorage.setItem(PENDING_KEY, JSON.stringify({ email, at: Date.now() }));
    else window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // 保存領域が使えなくても通常どおり動く
  }
}

function formatSeen(iso) {
  const t = Date.parse(iso || '');
  if (!t) return '';
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ログイン中の端末（最大3台）。この端末以外は個別にログアウトできる。
function DeviceList({ email }) {
  const [state, setState] = useState({ phase: 'loading', max: 3, sessions: [] });
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    try {
      const r = await fetch('/api/auth/sessions', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('failed');
      const j = await r.json();
      setState({ phase: 'ready', max: j.max || 3, sessions: j.sessions || [] });
    } catch {
      setState((s) => ({ ...s, phase: 'error' }));
    }
  };

  useEffect(() => { load(); }, [email]);

  const revoke = async (id) => {
    setBusyId(id);
    try {
      await fetch('/api/auth/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id }),
      });
    } finally {
      setBusyId('');
      load();
    }
  };

  return (
    <div className="device-list">
      <div className="device-list-head">
        <strong>ログイン中の端末</strong>
        <small>{state.max}台まで（超えると一番使っていない端末がログアウトされます）</small>
      </div>
      {state.phase === 'loading' && <p className="account-note">読み込み中…</p>}
      {state.phase === 'error' && <p className="account-note">端末の一覧を読み込めませんでした。</p>}
      {state.phase === 'ready' && state.sessions.map((d) => (
        <div className="device-row" key={d.id}>
          <div>
            <span className="device-label">{d.label}</span>
            {d.current && <span className="device-current">この端末</span>}
            <small className="device-seen">最終利用 {formatSeen(d.lastSeenAt)}</small>
          </div>
          {!d.current && (
            <button type="button" className="device-logout" onClick={() => revoke(d.id)} disabled={busyId === d.id}>
              ログアウト
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

const BILLING_PREVIEW_KEY = 'kimon-billing-preview';

/** 申し込みボタンを出すか。販売開始後は全員、それまでは ?billing=preview で開いた端末だけ（動作確認用）。 */
function billingVisible() {
  if (isBillingUiVisible()) return true;
  try {
    if (new URLSearchParams(window.location.search).get('billing') === 'preview') {
      window.localStorage.setItem(BILLING_PREVIEW_KEY, '1');
    }
    return window.localStorage.getItem(BILLING_PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}

// お気に入りと基準点をアカウントに保存するかどうか（最初はオフ。場所の情報なので本人が選ぶ）。
function SyncSetting({ email }) {
  const [enabled, setEnabled] = useState(() => isSyncEnabled());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onChange = () => setEnabled(isSyncEnabled());
    window.addEventListener(SYNC_SETTING_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(SYNC_SETTING_CHANGED_EVENT, onChange);
  }, []);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const ok = enabled ? await disableUserDataSync() : await enableUserDataSync(email);
    if (!ok) setError(enabled ? 'オフにできませんでした。時間をおいてもう一度お試しください。' : 'オンにできませんでした。時間をおいてもう一度お試しください。');
    setBusy(false);
  };

  return (
    <>
      <div className="settings-row">
        <div>
          <strong>お気に入りを他の端末でも使う</strong>
          <small>
            オンにすると、お気に入りと基準点（名前と位置）をアカウントに保存し、ログインした他の端末でも使えます。
            オフにすると、アカウントに保存した分を消します（この端末の分は残ります）。現在地は保存しません。
          </small>
        </div>
        <button
          type="button"
          className={`settings-switch${enabled ? ' is-on' : ''}`}
          aria-pressed={enabled}
          aria-label="お気に入りを他の端末でも使う"
          onClick={toggle}
          disabled={busy}
        >
          <span />
        </button>
      </div>
      {error && <p className="account-note account-note-small">{error}</p>}
    </>
  );
}

// 招待の管理（運営者だけに出る）。招待した人だけが使えるようにする・招待する人を足す／外す。
function InviteAdmin() {
  const [state, setState] = useState({ phase: 'loading', restricted: false, emails: [] });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const call = async (body) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/me?invites=1', {
        method: body ? 'PUT' : 'GET',
        credentials: 'same-origin',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setState({ phase: 'ready', restricted: Boolean(data.restricted), emails: data.emails || [] });
        setBusy(false);
        return true;
      }
      setError(data.error === 'invalid_email' ? 'メールアドレスの形式をご確認ください。' : '保存できませんでした。時間をおいてお試しください。');
    } catch {
      setError('保存できませんでした。時間をおいてお試しください。');
    }
    setBusy(false);
    return false;
  };

  useEffect(() => { call(null); }, []);

  const add = async () => {
    const email = input.trim().toLowerCase();
    if (!email) return;
    if (await call({ add: email })) setInput('');
  };

  if (state.phase === 'loading') return <p className="account-note">招待の一覧を読み込み中…</p>;

  return (
    <div className="invite-admin">
      <div className="settings-section-head">
        <h3 className="maru">招待の管理</h3>
        <span>運営者だけに表示</span>
      </div>
      <div className="settings-row">
        <div>
          <strong>招待した人だけが使える</strong>
          <small>
            オンにすると、下の一覧の人（とあなた）だけがログインできます。ほかの人にはログインのメールを送りません。
            すでにログインしている人も、一覧にいなければ使えなくなります。
          </small>
        </div>
        <button
          type="button"
          className={`settings-switch${state.restricted ? ' is-on' : ''}`}
          aria-pressed={state.restricted}
          aria-label="招待した人だけが使える"
          onClick={() => call({ restricted: !state.restricted })}
          disabled={busy}
        >
          <span />
        </button>
      </div>
      <p className="account-note account-note-small">
        一覧の人は、課金を始めたあとも、ずっと全機能（年額プランの機能を含む）を使えます。
      </p>
      <label className="account-label" htmlFor="invite-email-input">招待する人のメールアドレス</label>
      <div className="invite-add">
        <input
          id="invite-email-input"
          className="account-input"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          disabled={busy}
        />
        <button type="button" className="account-btn" onClick={add} disabled={busy || !input.trim()}>追加</button>
      </div>
      {error && <p className="account-error">{error}</p>}
      {state.emails.length === 0 ? (
        <p className="account-note account-note-small">まだ誰も招待していません。</p>
      ) : (
        <ul className="invite-list">
          {state.emails.map((email) => (
            <li key={email}>
              <span>{email}</span>
              <button type="button" onClick={() => call({ remove: email })} disabled={busy} aria-label={`${email} を外す`}>外す</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// プロ版の申し込み・解約（Stripe のページへ移動する）。
function BillingSection({ auth }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!auth.billing?.available || !billingVisible()) return null;

  const go = async (action) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/billing?action=${action}`, { method: 'POST', credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data.error === 'already_subscribed'
        ? 'すでにプロ版をご利用中です。'
        : '手続きのページを開けませんでした。時間をおいてお試しください。');
    } catch {
      setError('手続きのページを開けませんでした。時間をおいてお試しください。');
    }
    setBusy(false);
  };

  return (
    <div className="billing-box">
      {auth.billing.subscribed ? (
        <>
          <p className="account-note">
            {auth.billing.cancelAtPeriodEnd
              ? '解約の手続き済みです。有効期限まではプロ版をご利用いただけます。'
              : (auth.plan === 'annual'
                ? `プロ版・年額プラン（${ANNUAL_PRICE_LABEL}）をご利用中です。1年ごとに自動で更新されます。`
                : `プロ版（${PRO_PRICE_LABEL}）をご利用中です。1か月ごとに自動で更新されます。`)}
          </p>
          {auth.plan !== 'annual' && !auth.billing.cancelAtPeriodEnd && (
            <p className="account-note account-note-small">
              年額プラン（{ANNUAL_PRICE_LABEL}）にすると、最大1年先まで吉日・吉方位を検索できます。切り替えは下のボタンから行えます。
            </p>
          )}
          <button type="button" className="account-btn account-btn-ghost" onClick={() => go('portal')} disabled={busy}>
            お支払い方法の変更・解約
          </button>
        </>
      ) : (
        <>
          <p className="account-note">プロ版：{PRO_PRICE_LABEL}。1か月ごとに自動で更新され、いつでも解約できます。</p>
          <button type="button" className="account-btn" onClick={() => go('checkout')} disabled={busy}>
            プロ版に申し込む（月額）
          </button>
          <p className="account-note">
            年額プラン：{ANNUAL_PRICE_LABEL}。1年ごとに自動で更新されます。最大1年先まで吉日・吉方位を検索できます。
          </p>
          <button type="button" className="account-btn" onClick={() => go('checkout&plan=annual')} disabled={busy}>
            年額プランに申し込む
          </button>
        </>
      )}
      {error && <p className="account-error">{error}</p>}
    </div>
  );
}

function planLabel(auth) {
  if (auth.status === 'paid') {
    const t = Date.parse(auth.paidUntil || '');
    if (!t) return '有料会員';
    const d = new Date(t);
    return `有料会員（${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} まで）`;
  }
  if (auth.invited) return '招待（全機能を利用できます）';
  if (auth.accessMode === 'beta' && auth.full) return 'ベータ版（全機能を無料で利用中）';
  return '無料';
}

export default function AccountSettings() {
  const auth = useAuth();
  const [sent, setSent] = useState(() => Boolean(readPending()));
  const [email, setEmail] = useState(() => readPending());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const sendLink = async () => {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setError('メールアドレスの形式をご確認ください。');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: value }),
      });
      if (res.status === 429) {
        setError('短時間に複数回送信されています。少し時間をおいてお試しください。');
      } else if (res.status === 403) {
        setError('このアプリは現在、招待された方だけがご利用いただけます。');
      } else if (res.status === 502) {
        setError('メールを送れませんでした。時間をおいて、もう一度お試しください。');
      } else if (!res.ok) {
        setError('送信に失敗しました。時間をおいてお試しください。');
      } else {
        setSent(true);
        writePending(value);
      }
    } catch {
      setError('送信に失敗しました。時間をおいてお試しください。');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (code.length !== 6) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: email.trim().toLowerCase(), code }),
      });
      if (res.ok) {
        setSent(false);
        writePending('');
        setCode('');
        setNote('');
        await auth.refresh?.();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.error === 'expired' || data.error === 'too_many_attempts') {
        setError('コードの有効期限が切れたか、入力回数の上限に達しました。もう一度メールを送ってください。');
      } else {
        setError(`コードが違います。${typeof data.remaining === 'number' ? `あと${data.remaining}回入力できます。` : ''}`);
      }
    } catch {
      setError('ログインに失敗しました。時間をおいてお試しください。');
    } finally {
      setBusy(false);
    }
  };

  const logout = async (all = false) => {
    setBusy(true);
    try {
      await fetch(all ? '/api/auth/logout?all=1' : '/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // 失敗しても表示はログアウト扱いに倒す（再取得で実際の状態に戻る）
    } finally {
      setBusy(false);
      setEmail('');
      setSent(false);
      setNote(all ? 'すべての端末からログアウトしました。' : '');
      auth.refresh?.();
    }
  };

  if (auth.phase === 'loading') {
    return <div className="account-note">読み込み中…</div>;
  }

  if (auth.loggedIn) {
    return (
      <>
        <div className="settings-info-row">
          <span>メールアドレス</span>
          <strong className="account-email">{auth.email}</strong>
        </div>
        <div className="settings-info-row">
          <span>ご利用プラン</span>
          <strong>{planLabel(auth)}</strong>
        </div>
        <BillingSection auth={auth} />
        <DeviceList email={auth.email} />
        <p className="account-note account-note-small">ログインの有効期間は30日です。期間が過ぎたら、メールのコードでもう一度ログインしてください。</p>
        {auth.full && <SyncSetting email={auth.email} />}
        {auth.owner && <InviteAdmin />}
        <button type="button" className="account-btn account-btn-ghost" onClick={() => logout(false)} disabled={busy}>
          ログアウト
        </button>
        <button type="button" className="account-btn account-btn-ghost" onClick={() => logout(true)} disabled={busy}>
          すべての端末からログアウト
        </button>
      </>
    );
  }

  if (sent) {
    return (
      <div className="account-login">
        <p className="account-note">
          {email.trim().toLowerCase()} にメールを送りました。<br />
          メールに書かれた6桁のコードを入力してください（15分間有効）。
        </p>
        <label className="account-label" htmlFor="account-code-input">ログインコード</label>
        <input
          id="account-code-input"
          className="account-input account-code-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => { if (e.key === 'Enter') verifyCode(); }}
          disabled={busy}
        />
        {error && <p className="account-error">{error}</p>}
        <button type="button" className="account-btn" onClick={verifyCode} disabled={busy || code.length !== 6}>
          ログイン
        </button>
        <button
          type="button"
          className="account-btn account-btn-ghost"
          onClick={() => { setSent(false); writePending(''); setCode(''); setError(''); }}
          disabled={busy}
        >
          メールアドレスを入れ直す・再送する
        </button>
        <p className="account-note account-note-small">
          ※ ホーム画面に追加したアプリでは、メールのリンクを押すと別のブラウザでログインしてしまうことがあります。コードの入力がおすすめです。
        </p>
      </div>
    );
  }

  return (
    <div className="account-login">
      {note && <p className="account-note">{note}</p>}
      <label className="account-label" htmlFor="account-email-input">メールアドレスでログイン</label>
      <input
        id="account-email-input"
        type="email"
        className="account-input"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') sendLink(); }}
        disabled={busy}
      />
      {error && <p className="account-error">{error}</p>}
      <button type="button" className="account-btn" onClick={sendLink} disabled={busy}>
        ログインリンクを送る
      </button>
      <p className="account-note account-note-small account-legal">
        ログインすると、
        <button type="button" onClick={() => openLegal('terms')}>利用規約</button>と
        <button type="button" onClick={() => openLegal('privacy')}>プライバシーポリシー</button>
        に同意したことになります。
      </p>
    </div>
  );
}
