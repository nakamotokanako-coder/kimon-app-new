import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 手元での見た目確認用: ログイン後の画面を、本物のサーバーなしで開く。
//   npx vite --mode fakelogin   （.claude/launch.json の kimon-dev-login）
// 開発サーバーを fakelogin モードで起動したときだけ、/api/auth/me が「ログイン済み」を返す。
// 本番のビルド（vite build）には一切入らない。解説文など他の /api は手元には無いので読み込めないまま。
function fakeLoginForLocalPreview() {
  return {
    name: 'kimon-fake-login',
    apply: (config, env) => env.command === 'serve' && env.mode === 'fakelogin',
    configureServer(server) {
      // 招待の管理（運営者の画面）を手元で確かめるための、仮の一覧
      const invites = { restricted: false, emails: ['friend@example.com'] };
      // LINE との連携を手元で確かめるための、仮の状態
      let lineLinked = false;
      server.middlewares.use('/api/auth/me', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url.includes('invites=1')) {
          if (req.method !== 'PUT') { res.end(JSON.stringify(invites)); return; }
          let raw = '';
          req.on('data', (chunk) => { raw += chunk; });
          req.on('end', () => {
            const body = JSON.parse(raw || '{}');
            if (typeof body.restricted === 'boolean') invites.restricted = body.restricted;
            if (body.add && !invites.emails.includes(body.add)) invites.emails.push(body.add);
            if (body.remove) invites.emails = invites.emails.filter((e) => e !== body.remove);
            res.end(JSON.stringify(invites));
          });
          return;
        }
        if (req.url.includes('line=1')) {
          if (req.method === 'GET') { res.end(JSON.stringify({ linked: lineLinked })); return; }
          if (req.method === 'DELETE') { lineLinked = false; res.end(JSON.stringify({ linked: false })); return; }
          let raw = '';
          req.on('data', (chunk) => { raw += chunk; });
          req.on('end', () => {
            const body = JSON.parse(raw || '{}');
            if (body.confirm) { lineLinked = true; res.end(JSON.stringify({ linked: true })); return; }
            res.end(JSON.stringify({ name: 'かなこ' }));
          });
          return;
        }
        if (req.url.includes('data=1')) {
          res.end(JSON.stringify({ enabled: false, favorites: [], favoritesAt: null, basePoint: null, basePointAt: null }));
          return;
        }
        res.end(JSON.stringify({
          loggedIn: true,
          email: 'preview@example.com',
          status: 'free',
          paidUntil: null,
          full: true,
          accessMode: 'beta',
          lineLogin: true,
          invited: true,
          owner: true,
          billing: { available: false, subscribed: false, cancelAtPeriodEnd: false },
        }));
      });
    },
  };
}

// 紹介ページ（about.html）を、手元でも本番と同じ /about で開けるようにする。
// 本番は vercel.json の cleanUrls が同じことをする。
function aboutPageCleanUrl() {
  const rewrite = (req, _res, next) => {
    const [path, query] = String(req.url).split('?');
    if (path === '/about') req.url = '/about.html' + (query ? '?' + query : '');
    next();
  };
  return {
    name: 'kimon-about-clean-url',
    configureServer(server) { server.middlewares.use(rewrite); },
    configurePreviewServer(server) { server.middlewares.use(rewrite); },
  };
}

export default defineConfig({
  plugins: [react(), fakeLoginForLocalPreview(), aboutPageCleanUrl()],
  // アプリ（index.html）と、紹介ページ（about.html）の2つを作る
  build: { rollupOptions: { input: { main: 'index.html', about: 'about.html' } } },
  // 画面のテストは、全部まとめて走らせると1件5秒を超えることがある（内容の失敗ではなく、混み合いで）。
  test: { testTimeout: 20000 },
  server: {
    port: 5173,
    open: false,
  },
});
