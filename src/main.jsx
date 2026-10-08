import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { Analytics } from '@vercel/analytics/react';
import { Capacitor } from '@capacitor/core';
import './styles.css';

// アクセス解析は Web だけ。iPhone アプリの中には Vercel の計測スクリプトが無い。
const isNativeApp = Capacitor.isNativePlatform();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
    {!isNativeApp && <Analytics />}
  </React.StrictMode>,
);
