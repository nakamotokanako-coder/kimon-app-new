import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

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

function planLabel(auth) {
  if (auth.status === 'paid') {
    const t = Date.parse(auth.paidUntil || '');
    if (!t) return '有料会員';
    const d = new Date(t);
    return `有料会員（${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} まで）`;
  }
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
      await fetch(all ? '/api/auth/logout-all' : '/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
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
        <DeviceList email={auth.email} />
        <p className="account-note account-note-small">ログインの有効期間は30日です。期間が過ぎたら、メールのコードでもう一度ログインしてください。</p>
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
          placeholder="123456"
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
    </div>
  );
}
