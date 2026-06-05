import React from 'react';

export default function NotificationsView({ items, readIds, onRead, onBack }) {
  return (
    <main className="notifications-view">
      <section className="notifications-card">
        <div className="notifications-head">
          <div>
            <span className="notifications-kicker lat">notifications</span>
            <h2 className="maru">お知らせ</h2>
            <p>運営からの更新、先生からのひとこと、通知履歴をまとめます。</p>
          </div>
          <button type="button" className="notifications-back" onClick={onBack}>
            戻る
          </button>
        </div>

        <div className="notifications-list">
          {items.map((item) => {
            const isUnread = !readIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={`notification-row${isUnread ? ' is-unread' : ''}`}
                onClick={() => onRead(item.id)}
              >
                <span className="notification-row-dot" aria-hidden="true" />
                <span className="notification-row-main">
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                </span>
                <span className="notification-row-meta">
                  <time className="lat">{item.date}</time>
                  <em>{item.sender}</em>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
