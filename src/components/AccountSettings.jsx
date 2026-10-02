import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

// 設定タブ「アカウント」セクションの中身。メールマジックリンクでログイン/ログアウトする。
// 認証状態・利用範囲の判定はすべてサーバー側（/api/auth/me → AuthContext）。ここでは表示だけ。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function planLabel(auth) {
  if (auth.status === 'paid') return '有料会員';
  if (auth.accessMode === 'beta' && auth.full) return 'ベータ版（全機能を無料で利用中）';
  return '無料';
}

export default function AccountSettings() {
  const auth = useAuth();
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState('');
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
      }
    } catch {
      setError('送信に失敗しました。時間をおいてお試しください。');
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
      <div className="account-note">
        メールを確認してください。<br />
        届いたメールのリンクを開き、表示された「ログインする」ボタンを押すとログインが完了します（リンクの有効期限は15分です）。
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
