import { useEffect, useState } from 'react';

// KaisetsuPanel.jsx と統合カード(FusionCard.jsx)で共有する解説データ取得hook。
// 局key単位で /api/kaisetsu（short・認証非依存）と /api/kaisetsu-full（paid限定・mid/full）
// を取得し、認証状態・キャッシュ・エラー状態を一元管理する。

export function useKaisetsuPalace(key) {
  const [cache, setCache] = useState({}); // 局key -> palaces（short のみ）
  const [auth, setAuth] = useState({ phase: 'loading', loggedIn: false, status: 'free' });
  const [fullCache, setFullCache] = useState({}); // 局key -> palaces（paid のみ: short+mid+full+axisRanks）
  const [fullErrorKey, setFullErrorKey] = useState(null);

  // 局key が変わったら full の一時エラーも畳む。
  useEffect(() => {
    setFullErrorKey(null);
  }, [key]);

  // 認証状態は hook 単独で取得する。full API は paid 確認後の effect だけから呼ぶ。
  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { loggedIn: false }))
      .then((data) => {
        if (!alive) return;
        if (data?.loggedIn) {
          setAuth({ phase: 'ready', loggedIn: true, email: data.email, status: data.status || 'free' });
        } else {
          setAuth({ phase: 'ready', loggedIn: false, status: 'free' });
          setFullCache({});
        }
      })
      .catch(() => {
        if (!alive) return;
        setAuth({ phase: 'ready', loggedIn: false, status: 'free' });
        setFullCache({});
      });
    return () => { alive = false; };
  }, []);

  // short を API から取得（局keyごと1回だけ・取得済みは再フェッチしない）。
  useEffect(() => {
    if (!key || cache[key]) return;
    let alive = true;
    fetch(`/api/kaisetsu?key=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j && j.palaces) {
          setCache((c) => ({ ...c, [key]: j.palaces }));
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [key, cache]);

  // paid 確認後だけ full API を取得する。free/未ログインでは 403 を踏みに行かない。
  useEffect(() => {
    if (!key || auth.phase !== 'ready' || !auth.loggedIn || auth.status !== 'paid') return;
    if (fullCache[key] || fullErrorKey === key) return;
    let alive = true;
    fetch(`/api/kaisetsu-full?key=${encodeURIComponent(key)}`, { credentials: 'same-origin' })
      .then(async (r) => {
        if (r.status === 403) {
          if (alive) {
            setAuth((current) => ({ ...current, status: 'free' }));
            setFullCache({});
          }
          return null;
        }
        if (!r.ok) throw new Error('kaisetsu_full_failed');
        return r.json();
      })
      .then((j) => {
        if (alive && j?.palaces) {
          setFullCache((c) => ({ ...c, [key]: j.palaces }));
        }
      })
      .catch(() => {
        if (alive) setFullErrorKey(key);
      });
    return () => { alive = false; };
  }, [key, auth.phase, auth.loggedIn, auth.status, fullCache, fullErrorKey]);

  const palaces = cache[key] || null;
  const fullPalaces = fullCache[key] || null;
  const isPaid = auth.phase === 'ready' && auth.loggedIn && auth.status === 'paid';
  const isAnon = auth.phase === 'ready' && !auth.loggedIn;
  const isFree = auth.phase === 'ready' && auth.loggedIn && auth.status !== 'paid';

  return { auth, palaces, fullPalaces, fullErrorKey, isPaid, isAnon, isFree };
}
