import React, { useEffect, useMemo, useState } from 'react';
import Ja from '../utils/Ja.jsx';
import NotificationBell from './NotificationBell.jsx';
import { getBoardDate } from '../utils/boardDate.js';
import CharmCard from './CharmCard.jsx';
import { getCharm } from '../kimon/charm.js';
import {
  applyNaturalTime,
  buildDayReverseBoard,
  buildReverseBoard,
  getLongitudeCorrectionMinutes,
  getMiniBoardToneClass,
  getTimeSlotHour,
  getTimeSlotLabel,
} from '../reverseDirection/reverseDirection.js';
import { BADGE_LABEL } from '../reverseDirection/FusionCard.jsx';
import { GATE_ICONS, THEME_MARKS } from '../reverseDirection/CompassWheel.jsx';
import { DEFAULT_LOCATIONS } from '../reverseDirection/locations.js';
import { lockedMessage } from '../../lib/accessPolicy.js';
import { THEMES } from '../reverseDirection/themeSearch.js';

// ホーム画面。役割は「今日の私に必要なことを、ひと目で伝える」。
//   上: 今から使える吉方位（今の時盤の最高方位。基準点の経度で自然時補正）→ 地図へ
//   中: 今日のお守り（細い帯）
//   下: 「今日、どうする？」の3つの入口（今から／次の休み／この方位はいつ）
// 条件から探す・盤を指定して見る は置かない（「探す」タブと「盤」タブの役割）。
// 点数・吉凶の判定は吉方位タブと同じ関数（buildReverseBoard / getMiniBoardToneClass）を使う。

const BASE_POINT_KEY = 'kimon_go_base_point_v1';
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function readBaseLocation() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(BASE_POINT_KEY) || 'null');
    const lat = Number(saved?.location?.latitude);
    const lng = Number(saved?.location?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { name: saved.location.name || DEFAULT_LOCATIONS[0].name, latitude: lat, longitude: lng };
    }
  } catch {
    // 読めないときは標準の基準点
  }
  return DEFAULT_LOCATIONS[0];
}

/** 今の時盤で一番点数の高い方位（基準点の経度で自然時補正した時辰） */
export function computeNowBest(now, longitude) {
  const natural = applyNaturalTime(now, getLongitudeCorrectionMinutes(longitude));
  const slotHour = getTimeSlotHour(natural);
  const { rankings } = buildReverseBoard({ date: getBoardDate(), hour: slotHour });
  return { slotHour, best: rankings[0] || null };
}

const scoreText = (score) => `${score > 0 ? '+' : ''}${score}`;

// 3つの入口。絵は public/hub/ のもの。
export const ENTRIES = [
  {
    key: 'time',
    tone: 'gold',
    image: '/hub/sun.webp',
    title: '今から、どこ行く？',
    lines: ['散歩・カフェ・買い物', '近場の吉を探す'],
  },
  {
    key: 'day',
    tone: 'pink',
    image: '/hub/day.webp',
    title: '次の休み、どこ行く？',
    lines: ['日付を選んで', '遠出の吉方位を探す'],
  },
  {
    key: 'ranking',
    tone: 'blue',
    wide: true,
    image: '/hub/ranking.webp',
    title: 'この方位、いつ行く？',
    lines: ['行きたい方位から', 'ベストな日を探す'],
  },
];

/** その方位に入っている門と、そのテーマ（例: 開門｜仕事のテーマ）。効果は書かない */
export function gateLine(item) {
  const gate = item?.palaceData?.hachimon;
  if (!gate) return '';
  const theme = THEME_MARKS[GATE_ICONS[gate]];
  return theme ? `${gate}｜${theme.label}のテーマ` : gate;
}

export function HomeIcon({ name }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (name === 'walk') {
    return <svg {...common}><circle cx="13" cy="4.5" r="1.8" /><path d="M9 21l2.2-6.2L8.8 12l1.4-4.6L14 9l2 2.8 2.6.9M11.2 14.8l3 2.2 1 4" /></svg>;
  }
  if (name === 'trip') {
    return <svg {...common}><rect x="5" y="8" width="14" height="12" rx="2" /><path d="M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M9.5 12v4M14.5 12v4" /></svg>;
  }
  if (name === 'compass') {
    return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>;
  }
  if (name === 'spark') {
    return <svg {...common}><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" /><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></svg>;
  }
  if (name === 'pin') {
    return <svg {...common}><path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 12 3.5 6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>;
  }
  return null;
}

export default function HomeView({
  isActive,
  limited,
  unreadNotificationCount = 0,
  onOpenNotifications,
  onGoMap,
  onGoSearch,
  onGoTheme,
  onOpenBoard,
  onOpenGuide,
  onLogin,
}) {
  const [now, setNow] = useState(() => new Date());
  // 表示するたびに今の時刻で計算し直す（時辰が変わっていたら吉方位も変わる）。
  useEffect(() => {
    if (isActive) setNow(new Date());
  }, [isActive]);

  const base = useMemo(() => readBaseLocation(), [now]);
  const { slotHour, best } = useMemo(() => computeNowBest(now, base.longitude), [now, base.longitude]);
  const good = best && best.score > 0;
  // 今日のお守り: 今日の日盤から決める（1日の中で変わらない）。
  const today = getBoardDate();
  const dayCharm = useMemo(() => {
    try {
      return getCharm({ rankings: buildDayReverseBoard({ date: today }).rankings, sourceType: 'day' });
    } catch {
      return null;
    }
  }, [today]);
  const badge = best ? BADGE_LABEL[getMiniBoardToneClass(best.score, best.palaceScore)] : '';
  const vetoes = best?.vetoes || [];
  const dateText = `${now.getMonth() + 1}月${now.getDate()}日（${WEEKDAYS[now.getDay()]}） ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const handleEntry = (key) => {
    if (key === 'time' || key === 'day') onGoMap(key);
    else onGoSearch(key);
  };

  return (
    <main className="home-view" aria-label="ホーム">
      <header className="home-hero">
        <div className="home-hero-top">
          <div className="home-brand">
            <span className="brand-mark" aria-hidden="true">遁</span>
            <div>
              <h1 className="home-title">奇門遁甲Z</h1>
              <p className="home-kicker lat">KIMON TONKO Z</p>
            </div>
          </div>
          <NotificationBell unreadCount={unreadNotificationCount} onClick={onOpenNotifications} />
        </div>
        <p className="home-now">
          <span>{dateText}</span>
          <span className="home-base"><HomeIcon name="pin" />{base.name}</span>
        </p>

        <section className="home-today" aria-label="今から使える吉方位">
          <img className="home-today-art" src="/hub/now.webp" alt="" aria-hidden="true" decoding="async" />
          <p className="home-today-label">今から使える吉方位</p>
          {good ? (
            <>
              <p className="home-today-main">
                <strong>{best.label}</strong>
                <span className="home-today-score lat">{scoreText(best.score)}<small>点</small></span>
                {badge && <span className="home-today-badge">{badge}</span>}
              </p>
              <p className="home-today-until">{getTimeSlotLabel(slotHour)}まで</p>
              {gateLine(best) && <p className="home-today-sub">{gateLine(best)}</p>}
              {vetoes.length > 0 && (
                <p className="home-today-warn"><Ja>{`注意条件あり（${vetoes.join('・')}）。点数だけで決めず、盤で確かめてください。`}</Ja></p>
              )}
            </>
          ) : (
            <>
              <p className="home-today-main"><strong>なし</strong></p>
              <p className="home-today-sub"><Ja>{`${getTimeSlotLabel(slotHour)} の時盤には、吉の方位がありません。次の時間帯か、日盤で探せます。`}</Ja></p>
            </>
          )}
          <div className="home-today-actions">
            <button type="button" className="home-cta" onClick={() => (limited ? onLogin() : onGoMap('time'))}>
              <span>{limited ? 'ログインして地図で探す' : good ? 'この方位へ行く' : '地図で探す'}</span>
              <b aria-hidden="true">→</b>
            </button>
            <button type="button" className="home-sub-cta" onClick={() => onOpenBoard({ date: getBoardDate(), hour: slotHour, boardType: '時' })}>
              盤を見る
            </button>
          </div>
        </section>
      </header>

      <div className="home-charm">
        <CharmCard
          compact
          charm={dayCharm}
          sourceType="day"
          onSeeDirection={() => (limited ? onOpenBoard({ date: today, boardType: '日' }) : onGoMap('day'))}
        />
      </div>

      <section className="home-section" aria-label="今日、どうする？">
        <h2 className="home-section-title">今日、どうする？</h2>
        <div className="home-picks">
          {ENTRIES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={`home-pick is-${entry.tone}${entry.wide ? ' is-wide' : ''}`}
              onClick={() => (limited ? onLogin() : handleEntry(entry.key))}
            >
              <img className="home-pick-art" src={entry.image} alt="" aria-hidden="true" loading="lazy" decoding="async" />
              <strong><Ja tail={3}>{entry.title}</Ja></strong>
              <span className="home-pick-lines">{entry.lines.map((line) => <span key={line}>{line}</span>)}</span>
              <b aria-hidden="true">→</b>
            </button>
          ))}
        </div>
        <div className="home-theme">
          <p className="home-theme-title">目的から探す</p>
          <div className="theme-picker-chips">
            {THEMES.map((item) => (
              <button key={item.key} type="button" onClick={() => (limited ? onLogin() : onGoTheme?.(item.key))}>{item.label}</button>
            ))}
          </div>
        </div>
        <div className="home-more">
          <button type="button" onClick={onOpenGuide}>使い方ガイド <span aria-hidden="true">›</span></button>
          <button type="button" onClick={() => (limited ? onLogin() : onGoSearch(null))}>詳しく探す（条件・ルートなど） <span aria-hidden="true">→</span></button>
        </div>
        {limited && (
          <p className="home-locked-note">
            <Ja>{`地図と検索はログインすると使えます。${lockedMessage()}`}</Ja>
          </p>
        )}
      </section>
    </main>
  );
}
