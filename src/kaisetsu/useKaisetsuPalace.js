import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

// 解説データ取得hook（盤のシート・統合カード(FusionCard)・L3・KaisetsuPanel で共有）。
// 局key単位で /api/kaisetsu（short・認証非依存）と /api/kaisetsu-full（全機能の利用者限定・mid/full）
// を取得する。ログイン状態は AuthContext（/api/auth/me を1回だけ取得）を使う。
//
// 返り値の isPaid は「全機能を使える（詳しい解説を読める）」の意味（lib/accessPolicy.js の full）。
// ベータ期間はログインで true、販売開始後は有料会員で true。

export function useKaisetsuPalace(key) {
  const auth = useAuth();
  const [cache, setCache] = useState({}); // 局key -> palaces（short のみ）
  const [fullCache, setFullCache] = useState({}); // 局key -> palaces（short+mid+full+axisRanks）
  const [fullErrorKey, setFullErrorKey] = useState(null);
  const [fullDenied, setFullDenied] = useState(false); // サーバーに 403 で断られた（権限が変わった等）

  // 局key が変わったら full の一時エラーも畳む。
  useEffect(() => {
    setFullErrorKey(null);
  }, [key]);

  // ログイン状態が変わったら、断られた記録と full のキャッシュを捨てる。
  useEffect(() => {
    setFullDenied(false);
    if (!auth.full) setFullCache({});
  }, [auth.full, auth.email]);

  // short を API から取得（局keyごと1回だけ・取得済みは再フェッチしない）。
  useEffect(() => {
    if (!key || cache[key]) return undefined;
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

  // 全機能の利用者だけ full API を取得する。未ログイン等では 403 を踏みに行かない。
  useEffect(() => {
    if (!key || auth.phase !== 'ready' || !auth.full || fullDenied) return undefined;
    if (fullCache[key] || fullErrorKey === key) return undefined;
    let alive = true;
    fetch(`/api/kaisetsu-full?key=${encodeURIComponent(key)}`, { credentials: 'same-origin' })
      .then(async (r) => {
        if (r.status === 403) {
          if (alive) {
            setFullDenied(true);
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
  }, [key, auth.phase, auth.full, fullDenied, fullCache, fullErrorKey]);

  const palaces = cache[key] || null;
  const fullPalaces = fullCache[key] || null;
  const isPaid = auth.phase === 'ready' && auth.full && !fullDenied;
  const isAnon = auth.phase === 'ready' && !auth.loggedIn;
  const isFree = auth.phase === 'ready' && auth.loggedIn && !isPaid;

  return { auth, palaces, fullPalaces, fullErrorKey, isPaid, isAnon, isFree };
}
