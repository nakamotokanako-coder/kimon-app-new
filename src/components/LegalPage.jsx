import React, { useEffect } from 'react';
import { LEGAL_DOCS, LEGAL_UPDATED } from '../legal/documents.js';

// 利用規約・プライバシーポリシーのページ（本文は src/legal/documents.js）。
//   設定 →「このアプリについて」、ログイン画面の下の案内、アドレスの ?terms / ?privacy から開ける。
export default function LegalPage({ docKey, onClose }) {
  const doc = LEGAL_DOCS[docKey];

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('sheet-scroll-lock');
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      root.classList.remove('sheet-scroll-lock');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  if (!doc) return null;

  return (
    <div className="intro-page legal-page" role="dialog" aria-modal="true" aria-label={doc.title}>
      <button type="button" className="intro-close" aria-label="閉じる" onClick={onClose}>
        <span aria-hidden="true">×</span>
      </button>
      <div className="intro-inner">
        <header className="legal-head">
          <h2>{doc.title}</h2>
          <p>{doc.lead}</p>
        </header>
        {doc.sections.map((section) => (
          <section key={section.heading} className="legal-section">
            <h3>{section.heading}</h3>
            {(section.body || []).map((text) => <p key={text}>{text}</p>)}
            {section.list && (
              <ul>
                {section.list.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
            {(section.after || []).map((text) => <p key={text}>{text}</p>)}
          </section>
        ))}
        <p className="legal-updated">制定日 {LEGAL_UPDATED}</p>
        <div className="intro-actions">
          <button type="button" className="account-btn account-btn-ghost" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
