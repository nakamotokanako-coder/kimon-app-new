import React from 'react';
import Ja from '../utils/Ja.jsx';
import NotificationBell from './NotificationBell.jsx';
import { DIRECTION_ICONS } from '../reverseDirection/directionIcons.generated.js';

// 「探す」の入口。4つの検索を同じ強さで並べず、優先順位で分ける。
//   NOW      今から吉方位へ（いちばんよく使う。上に大きく）
//   PLAN     予定から探す（行く日が決まっている／行く方位が決まっている）。2枚は対になる言い方にする
//   こだわって探す（条件から／吉を3回つなぐ）
// 番号は付けない（1→2→3→4 と進む手順ではなく、探し方を選ぶ画面のため）。
// 専門の名前は小さく添える。行き先は今ある画面（ReverseDirectionView の各モード）。
// カードの絵は、画像（public/hub/<key>.webp）があればそれを、なければ線画を出す。

export const NOW_ENTRY = {
  key: 'time',
  target: 'map',
  title: '今から吉方位へ',
  lines: ['今日の時間帯から', '今行ける方位を見る'],
  cta: '今から探す',
};

export const SEARCH_ENTRIES = [
  {
    key: 'day',
    target: 'map',
    group: 'plan',
    icon: 'calendar',
    title: '行く日が決まっている',
    question: 'この日、どっちへ行く？',
    desc: '日を選ぶと、良い方位がわかります',
    tech: '日盤・遠出',
  },
  {
    key: 'ranking',
    target: 'search',
    group: 'plan',
    icon: 'compass',
    title: '行く方位が決まっている',
    question: 'この方位、いつ行く？',
    desc: '方位を選ぶと、良い日がわかります',
    tech: '日盤ランキング',
  },
  {
    key: 'kakkyoku',
    target: 'search',
    group: 'detail',
    icon: 'spark',
    title: '条件から探す',
    question: 'この条件が出るのはいつ？',
    desc: '格局が出る日時を探します',
    tech: '格局検索',
  },
  {
    key: 'range',
    target: 'search',
    group: 'detail',
    icon: 'route',
    title: '吉を3回つなぐ',
    question: '1日で、吉方位を3回',
    desc: '吉方位が3回続く日を探します',
    tech: '奇門三盤ルート',
  },
];

export const HUB_GROUPS = [
  { key: 'plan', title: '予定から探す', divider: '/hub/divider-plan.webp' },
  { key: 'detail', title: 'こだわって探す', divider: '/hub/divider-detail.webp' },
];

// 絵の画像（public/hub/。無いカードは線画を出す）
export const HUB_IMAGES = {
  time: '/hub/now.webp',
  day: '/hub/day.webp',
  ranking: '/hub/ranking.webp',
  kakkyoku: '/hub/kakkyoku.webp',
  range: '/hub/range.webp',
};

function LineIcon({ name }) {
  return <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: DIRECTION_ICONS[name] || '' }} />;
}

function HubIcon({ name }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (name === 'calendar') {
    return <svg {...common}><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" /><path d="M8 3.5v4M16 3.5v4M4 10.5h16M8 14h2M14 14h2M8 17h2" /></svg>;
  }
  if (name === 'compass') return <LineIcon name="compass-rose" />;
  if (name === 'spark') return <LineIcon name="theme-general" />;
  return <svg {...common}><circle cx="5.5" cy="18" r="2" /><circle cx="12" cy="11" r="2" /><circle cx="18.5" cy="5" r="2" /><path d="M7 16.5l3.5-4M13.6 9.6l3.4-3.2" /></svg>;
}

function HubCard({ entry, onSelect }) {
  const image = HUB_IMAGES[entry.key];
  return (
    <button type="button" className={`hub-tile is-${entry.icon}`} onClick={() => onSelect(entry)}>
      <span className="hub-tile-art" aria-hidden="true">
        {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <HubIcon name={entry.icon} />}
      </span>
      <strong><Ja tail={3}>{entry.title}</Ja></strong>
      <em><Ja tail={3}>{entry.question}</Ja></em>
      <span className="hub-tile-desc"><Ja tail={4}>{entry.desc}</Ja></span>
      <span className="hub-tile-foot">
        <small>{entry.tech}</small>
        <b aria-hidden="true">›</b>
      </span>
    </button>
  );
}

export default function SearchHub({ unreadNotificationCount = 0, onOpenNotifications, onSelect, onOpenGuide }) {
  return (
    <main className="search-hub" aria-label="探す">
      <header className="hub-header">
        <div>
          <h2 className="hub-title">探す</h2>
          <p className="hub-lead">どんな探し方をしますか？</p>
          <p className="hub-sub">今から行くか、予定の日から探すかを選べます。</p>
        </div>
        <NotificationBell unreadCount={unreadNotificationCount} onClick={onOpenNotifications} />
      </header>

      {/* NOW: いちばんよく使う「今から」を、上に大きく */}
      <section className="hub-now" aria-label={NOW_ENTRY.title}>
        <span className="hub-now-art" aria-hidden="true">
          {HUB_IMAGES.time ? <img src={HUB_IMAGES.time} alt="" /> : <LineIcon name="sun" />}
        </span>
        <h3>{NOW_ENTRY.title}</h3>
        <p>{NOW_ENTRY.lines.map((line) => <span key={line}>{line}</span>)}</p>
        <button type="button" className="hub-now-cta" onClick={() => onSelect(NOW_ENTRY)}>
          {NOW_ENTRY.cta} <span aria-hidden="true">→</span>
        </button>
        <button type="button" className="hub-now-link" onClick={() => onSelect({ key: 'timeRanking', target: 'search' })}>
          今日の時間帯を一覧で見る <span aria-hidden="true">›</span>
        </button>
      </section>

      {HUB_GROUPS.map((group) => (
        <section key={group.key} className={`hub-group is-${group.key}`} aria-label={group.title}>
          <h3 className="hub-group-title"><span>{group.title}</span></h3>
          <img className="hub-divider" src={group.divider} alt="" aria-hidden="true" loading="lazy" decoding="async" />
          <div className="hub-tiles">
            {SEARCH_ENTRIES.filter((entry) => entry.group === group.key).map((entry) => (
              <HubCard key={entry.key} entry={entry} onSelect={onSelect} />
            ))}
          </div>
        </section>
      ))}

      <button type="button" className="home-row hub-row hub-guide" onClick={onOpenGuide}>
        <img src="/hub/guide.webp" alt="" aria-hidden="true" loading="lazy" decoding="async" />
        <span>
          <strong>使い方ガイド</strong>
          <small>初めての方は、まずこちらをご覧ください</small>
        </span>
        <b aria-hidden="true">›</b>
      </button>

      <div className="hub-footer" aria-hidden="true">
        <img className="hub-footer-mountains" src="/hub/footer-mountains.webp" alt="" loading="lazy" decoding="async" />
        <img className="hub-footer-lotus" src="/hub/footer-lotus.webp" alt="" loading="lazy" decoding="async" />
      </div>
    </main>
  );
}
