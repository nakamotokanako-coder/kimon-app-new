import React from 'react';
import Ja from '../utils/Ja.jsx';
import NotificationBell from './NotificationBell.jsx';

// 「探す」の入口。機能の名前（日盤ランキング・格局検索・三盤ルート）ではなく、
// 利用者の質問（この日どちらへ？ この方位ならいつ？）から選べるようにする。
// 専門の名前は小さく添える。行き先は今ある画面（ReverseDirectionView の各モード）。

export const SEARCH_ENTRIES = [
  {
    key: 'day',
    target: 'map',
    icon: 'calendar',
    title: '日付から探す',
    question: 'この日、どちらへ行く？',
    desc: '休みの日を選んで、その日の8方位を比較。一番良い方位から旅先を探せます。',
    tech: '日盤・遠出',
  },
  {
    key: 'ranking',
    target: 'search',
    icon: 'compass',
    title: '方位から探す',
    question: 'この方位なら、いつ行く？',
    desc: '行きたい方位と期間を指定して、条件の良い日を探します。',
    tech: '日盤ランキング',
  },
  {
    key: 'kakkyoku',
    target: 'search',
    icon: 'spark',
    title: '条件から探す',
    question: 'この条件が出るのはいつ？',
    desc: '特定の格局が成立する日時を検索します。',
    tech: '格局検索',
  },
  {
    key: 'range',
    target: 'search',
    icon: 'route',
    title: '吉を3回つなぐ',
    question: '1日で、吉方位を連続で取る',
    desc: '同じ日に、吉方位が3回続くルートを探します。',
    tech: '奇門三盤ルート',
  },
];

function HubIcon({ name }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (name === 'calendar') {
    return <svg {...common}><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" /><path d="M8 3.5v4M16 3.5v4M4 10.5h16" /></svg>;
  }
  if (name === 'compass') {
    return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>;
  }
  if (name === 'spark') {
    return <svg {...common}><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" /></svg>;
  }
  return <svg {...common}><circle cx="6" cy="17.5" r="2.5" /><circle cx="18" cy="6.5" r="2.5" /><path d="M8 16l8-8" /></svg>;
}

export default function SearchHub({ unreadNotificationCount = 0, onOpenNotifications, onSelect, onOpenGuide }) {
  return (
    <main className="search-hub" aria-label="探す">
      <header className="hub-header">
        <div>
          <h2 className="hub-title">探す</h2>
          <p className="hub-lead">何から探しますか？</p>
        </div>
        <NotificationBell unreadCount={unreadNotificationCount} onClick={onOpenNotifications} />
      </header>

      <ol className="hub-list">
        {SEARCH_ENTRIES.map((entry, i) => (
          <li key={entry.key}>
            <button type="button" className={`hub-card is-${entry.icon}`} onClick={() => onSelect(entry)}>
              <span className="hub-no lat" aria-hidden="true">{i + 1}</span>
              <span className="hub-icon"><HubIcon name={entry.icon} /></span>
              <span className="hub-body">
                <strong>{entry.title}</strong>
                <em><Ja>{entry.question}</Ja></em>
                <span><Ja>{entry.desc}</Ja></span>
                <small>{entry.tech}</small>
              </span>
              <b aria-hidden="true">›</b>
            </button>
          </li>
        ))}
      </ol>

      <button type="button" className="home-row hub-row" onClick={() => onSelect({ key: 'timeRanking', target: 'search' })}>
        <span>
          <strong>今日の時間帯から探す</strong>
          <small><Ja>今日のどの時間帯が良いかを一覧で見る（時盤ランキング）</Ja></small>
        </span>
        <b aria-hidden="true">›</b>
      </button>
      <button type="button" className="home-row hub-row" onClick={onOpenGuide}>
        <span>
          <strong>使い方ガイド</strong>
          <small>初めての方は、まずこちらをご覧ください</small>
        </span>
        <b aria-hidden="true">›</b>
      </button>
    </main>
  );
}
