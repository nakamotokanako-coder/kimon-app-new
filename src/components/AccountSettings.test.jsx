// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import AccountSettings from './AccountSettings.jsx';

// /api/auth/me の応答だけを差し替える（AccountSettings は useAuth で自分で取りに行く）
function stubMe(me, { linked = false } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const body = String(url).includes('line=1') ? { linked } : me;
    return { ok: true, status: 200, json: async () => body };
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('アカウント画面の LINE ログイン', () => {
  it('鍵が設定されているとき、ログイン前の画面に「LINEでログイン」とメールアドレスの欄の両方を出す', async () => {
    stubMe({ loggedIn: false, full: false, accessMode: 'beta', lineLogin: true });
    render(<AccountSettings />);
    const link = await screen.findByRole('link', { name: 'LINEでログイン' });
    expect(link.getAttribute('href')).toBe('/api/auth/me?linelogin=start');
    expect(screen.getByLabelText('メールアドレスでログイン')).toBeTruthy();
  });

  it('鍵が設定されていないときは、メールアドレスの欄だけ', async () => {
    stubMe({ loggedIn: false, full: false, accessMode: 'beta', lineLogin: false });
    render(<AccountSettings />);
    await screen.findByLabelText('メールアドレスでログイン');
    expect(screen.queryByRole('link', { name: 'LINEでログイン' })).toBeNull();
  });

  it('LINE でログインしたはじめての人には、メールアドレスの登録を案内する', async () => {
    window.localStorage.setItem('kimon-line-link', JSON.stringify({ token: 'a'.repeat(32), at: Date.now(), login: true }));
    stubMe({ loggedIn: false, full: false, accessMode: 'beta', lineLogin: true });
    render(<AccountSettings />);
    expect(await screen.findByText(/はじめの1回だけメールアドレスの登録が要ります/)).toBeTruthy();
  });

  it('ログイン中で未連携なら「LINEと連携する」、連携済みなら「連携をやめる」を出す', async () => {
    const me = { loggedIn: true, email: 'a@example.com', status: 'free', full: true, accessMode: 'beta', lineLogin: true };
    stubMe(me);
    render(<AccountSettings />);
    expect(await screen.findByRole('link', { name: 'LINEと連携する' })).toBeTruthy();
    cleanup();

    stubMe(me, { linked: true });
    render(<AccountSettings />);
    expect(await screen.findByRole('button', { name: '連携をやめる' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'LINEと連携する' })).toBeNull());
  });
});
