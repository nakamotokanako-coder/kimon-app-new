import React, { useEffect, useState } from 'react';

// 設定タブ「アカウント」セクションの中身。メールマジックリンクでログイン/ログアウトする。
// 認証状態・課金状態の判定はすべてサーバー側（/api/auth/me）。ここでは出し分けをしない。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AccountSettings() {
  const [phase, setPhase] = useState('loading'); // loading | anon | sent | authed
  const [email, setEmail] = useState('');
  const [account, setAccount] = useState(null); // { email, status }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadMe = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      const data = await res.json();
      if (data.loggedIn) {
        setAccount({ email: data.email, status: data.status });
        setPhase('authed');
      } else {
        setPhase('anon');
      }
    } catch {
      setPhase('anon');
    }
  };

  useEffect(() => { loadMe(); }, []);

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
        setPhase('sent');
      }
    } catch {
      setError('送信に失敗しました。時間をおいてお試しください。');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // 失敗してもUIはログアウト扱いに倒す
    } finally {
      setBusy(false);
      setAccount(null);
      setEmail('');
      setPhase('anon');
    }
  };

  if (phase === 'loading') {
    return <div className="account-note">読み込み中…</div>;
  }

  if (phase === 'authed' && account) {
    return (
      <>
        <div className="settings-info-row">
          <span>メールアドレス</span>
          <strong className="account-email">{account.email}</strong>
        </div>
        <button type="button" className="account-btn account-btn-ghost" onClick={logout} disabled={busy}>
          ログアウト
        </button>
      </>
    );
  }

  if (phase === 'sent') {
    return (
      <div className="account-note">
        メールを確認してください。<br />
        届いたログインリンクを開くとログインが完了します（リンクの有効期限は15分です）。
      </div>
    );
  }

  // anon
  return (
    <div className="account-login">
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
