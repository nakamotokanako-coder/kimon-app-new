import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { Analytics } from '@vercel/analytics/react';
import { isNativeApp } from './native/platform.js';
import { installNativeApiFetch } from './native/apiFetch.js';
import './styles.css';

installNativeApiFetch();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
    {/* アクセス解析は Web だけ。iPhone アプリの中には Vercel の計測スクリプトが無い。 */}
    {!isNativeApp() && <Analytics />}
  </React.StrictMode>,
);
