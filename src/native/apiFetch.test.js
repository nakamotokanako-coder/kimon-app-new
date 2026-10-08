import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./platform.js', () => ({ API_ORIGIN: 'https://example.test', isNativeApp: vi.fn(() => false) }));

import { installNativeApiFetch, toApiUrl } from './apiFetch.js';
import { isNativeApp } from './platform.js';

afterEach(() => { isNativeApp.mockReturnValue(false); });

describe('toApiUrl', () => {
  it('/api/ で始まるアドレスに、サーバーのアドレスを付ける', () => {
    expect(toApiUrl('/api/auth/me?data=1')).toBe('https://example.test/api/auth/me?data=1');
  });

  it('それ以外はそのまま返す', () => {
    expect(toApiUrl('https://msearch.gsi.go.jp/address-search/AddressSearch?q=a')).toBe('https://msearch.gsi.go.jp/address-search/AddressSearch?q=a');
    expect(toApiUrl('/apiary')).toBe('/apiary');
    const request = { url: '/api/auth/me' };
    expect(toApiUrl(request)).toBe(request);
  });
});

describe('installNativeApiFetch', () => {
  it('Web では fetch を差し替えない', () => {
    const fetch = vi.fn();
    const target = { fetch };
    expect(installNativeApiFetch(target)).toBe(false);
    expect(target.fetch).toBe(fetch);
  });

  it('アプリの中では、/api の呼び出しをサーバーへ向け直す', async () => {
    isNativeApp.mockReturnValue(true);
    const fetch = vi.fn(async () => 'ok');
    const target = { fetch };
    expect(installNativeApiFetch(target)).toBe(true);
    const init = { method: 'POST' };
    await expect(target.fetch('/api/auth/logout', init)).resolves.toBe('ok');
    expect(fetch).toHaveBeenCalledWith('https://example.test/api/auth/logout', init);
  });
});
