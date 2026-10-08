// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('アカウントの削除', () => {
  const me = { loggedIn: true, email: 'a@example.com', status: 'free', full: true, accessMode: 'beta' };

  it('1回押しただけでは消さず、消えるものを見せてから「削除する」で消す', async () => {
    stubMe(me);
    render(<AccountSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'アカウントを削除する' }));
    expect(fetch.mock.calls.some(([url]) => String(url).includes('delete=1'))).toBe(false);
    expect(screen.getByText(/元には戻せません/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/auth/logout?delete=1', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ confirm: 'delete' }),
    })));
  });

  it('「やめる」で元の画面に戻る', async () => {
    stubMe(me);
    render(<AccountSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'アカウントを削除する' }));
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(screen.getByRole('button', { name: 'アカウントを削除する' })).toBeTruthy();
    expect(screen.queryByText(/元には戻せません/)).toBeNull();
  });

  it('有料プランの人には、同時に解約されることを伝える', async () => {
    stubMe({ ...me, status: 'paid', billing: { available: true, subscribed: true, cancelAtPeriodEnd: false } });
    render(<AccountSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'アカウントを削除する' }));
    expect(screen.getByText(/削除と同時に解約されます/)).toBeTruthy();
  });

  it('運営者のアカウントには出さない', async () => {
    stubMe({ ...me, owner: true });
    render(<AccountSettings />);
    await screen.findByRole('button', { name: 'ログアウト' });
    expect(screen.queryByRole('button', { name: 'アカウントを削除する' })).toBeNull();
  });
});
