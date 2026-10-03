import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync('index.html', 'utf8');
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
const publicPath = (url) => `public${new URL(url, 'https://kimon-tonko.vercel.app').pathname}`;

describe('アイコンと共有時の見え方', () => {
  it('index.html が指す画像・マニフェストが public/ に実在する', () => {
    const hrefs = [...html.matchAll(/(?:href|content)="([^"]+\.(?:png|webmanifest))"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(5);
    for (const href of hrefs) expect(existsSync(publicPath(href)), href).toBe(true);
  });

  it('マニフェストのアイコンが実在し、192・512・maskable がそろう', () => {
    for (const icon of manifest.icons) expect(existsSync(publicPath(icon.src)), icon.src).toBe(true);
    expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('共有用の画像は絶対URL（SNS は相対パスを読めない）で、説明文がある', () => {
    expect(html).toMatch(/property="og:image" content="https:\/\//);
    expect(html).toMatch(/name="twitter:card" content="summary_large_image"/);
    expect(html).toMatch(/name="description" content=".{20,}"/);
  });

  // ホーム画面から開いたときの動きは今のまま（ブラウザで開く）。専用アプリ風（standalone）にすると
  // 保存先が Safari と分かれ、ログインとお気に入りがやり直しになるため、変えるときは意図して変える。
  it('ホーム画面からの開き方は変えていない（display: browser）', () => {
    expect(manifest.display).toBe('browser');
    expect(html).not.toContain('apple-mobile-web-app-capable');
  });
});
