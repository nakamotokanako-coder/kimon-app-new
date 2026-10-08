import { Capacitor } from '@capacitor/core';

// iPhone アプリ（Capacitor）の中で動いているか。Web（ブラウザ・ホーム画面に追加）では false。
export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

// アプリの中から呼ぶサーバー。アプリの画面は端末の中のファイルから開くので、/api は本番のサーバーを名指しする。
export const API_ORIGIN = 'https://kimon-tonko.vercel.app';
