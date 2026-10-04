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
      server.middlewares.use('/api/auth/me', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
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
          billing: { available: false, subscribed: false, cancelAtPeriodEnd: false },
        }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), fakeLoginForLocalPreview()],
  server: {
    port: 5173,
    open: false,
  },
});
