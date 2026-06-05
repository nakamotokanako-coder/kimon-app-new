import React from 'react';

export default function NotificationBell({ unreadCount, onClick }) {
  const hasUnread = unreadCount > 0;
  return (
    <button
      type="button"
      className="notification-bell"
      onClick={onClick}
      aria-label={hasUnread ? `お知らせ ${unreadCount}件の未読` : 'お知らせ'}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 9.5a6 6 0 0 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5Z" />
        <path d="M9.75 20a2.5 2.5 0 0 0 4.5 0" />
      </svg>
      {hasUnread && <span className="notification-badge" aria-hidden="true" />}
    </button>
  );
}
