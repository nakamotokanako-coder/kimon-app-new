// lib/kv.js
// Upstash Redis クライアントの薄いラッパー。Redis.fromEnv() を遅延生成し、
// テストからは setKvClient() でインメモリfakeに差し替えられる（既存の素朴流儀に合わせる）。
import { Redis } from '@upstash/redis';

let client = null;

/** テスト用: KVクライアントを差し替える（fakeは get/set/del/exists を実装）。 */
export function setKvClient(fake) {
  client = fake;
}

/** 実クライアント（または差し替え済みfake）を返す。実クライアントは初回に env から生成。 */
export function kv() {
  if (!client) client = Redis.fromEnv();
  return client;
}
