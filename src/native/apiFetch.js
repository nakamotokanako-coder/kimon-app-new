import { API_ORIGIN, isNativeApp } from './platform.js';

// iPhone アプリの中では、画面のコードが呼ぶ /api/... を本番のサーバーへ向け直す。
// 通信そのものは Capacitor が端末側で行う（capacitor.config.json の CapacitorHttp）。
// ログインの Cookie も端末側に残るので、Web と同じ書き方（fetch('/api/...')）のまま動く。

/** /api/ で始まるアドレスだけ、サーバーのアドレスを頭に付ける。それ以外はそのまま返す。 */
export function toApiUrl(url, origin = API_ORIGIN) {
  return typeof url === 'string' && url.startsWith('/api/') ? `${origin}${url}` : url;
}

/** アプリの中でだけ、fetch を上の向け直しつきに差し替える。Web では何もしない。 */
export function installNativeApiFetch(target = window) {
  if (!isNativeApp()) return false;
  const original = target.fetch.bind(target);
  target.fetch = (input, init) => original(toApiUrl(input), init);
  return true;
}
