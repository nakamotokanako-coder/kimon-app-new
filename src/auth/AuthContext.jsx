import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ACCESS_MODE, hasFullAccess } from '../../lib/accessPolicy.js';

// ログイン状態をアプリ全体で1回だけ取得して共有する（/api/auth/me）。
// full（全機能を使えるか）はサーバーの判定をそのまま使う。古いサーバー応答で full が無いときだけ
// lib/accessPolicy.js の同じルールで補う。出し分けの唯一の基準は full。

const LOADING = { phase: 'loading', loggedIn: false, status: 'free', full: false, accessMode: ACCESS_MODE };
const ANON = { phase: 'ready', loggedIn: false, status: 'free', full: false, accessMode: ACCESS_MODE };

export function normalizeMe(data) {
  if (!data?.loggedIn) return { ...ANON, accessMode: data?.accessMode || ACCESS_MODE };
  const status = data.status || 'free';
  return {
    phase: 'ready',
    loggedIn: true,
    email: data.email,
    status,
    paidUntil: data.paidUntil || null,
    plan: data.plan || null,
    invited: Boolean(data.invited),
    owner: Boolean(data.owner),
    billing: data.billing || { available: false, subscribed: false, cancelAtPeriodEnd: false },
    full: typeof data.full === 'boolean'
      ? data.full
      : hasFullAccess({ loggedIn: true, status, paidUntil: data.paidUntil }),
    accessMode: data.accessMode || ACCESS_MODE,
  };
}

async function fetchMe() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    return normalizeMe(r.ok ? await r.json() : null);
  } catch {
    return ANON;
  }
}

function useAuthState(enabled) {
  const [auth, setAuth] = useState(LOADING);
  const refresh = useCallback(async () => {
    const next = await fetchMe();
    setAuth(next);
    return next;
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    fetchMe().then((next) => { if (alive) setAuth(next); });
    return () => { alive = false; };
  }, [enabled]);
  return { ...auth, refresh };
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const value = useAuthState(true);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** ログイン状態。AuthProvider の外（単体テスト等）では自前で取得する。 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  const own = useAuthState(!ctx);
  return ctx || own;
}
