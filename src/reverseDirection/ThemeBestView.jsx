import React, { useMemo, useState } from 'react';
import Ja from '../utils/Ja.jsx';
import { THEMES, themeLabel, bestTimesForTheme, bestDaysForTheme } from './themeSearch.js';

// 「目的で選ぶ」の画面。目的を選ぶと、いつ・どの方位が一番向くかを順位で出す。この画面はそれだけをする。
//   近所へ（kind='time'・時盤）   … 今日のこれからの時間帯と、これから1週間の時間帯
//   遠出・旅行（kind='day'・日盤）… これから1週間の日
// はじめは1位だけ。「2位・3位も見る」で3位まで開く。行を押すと、その日時・方位の地図が開く。
// 順位の決め方は themeSearch.js（その目的が◎の方位が先、同じなら総合点の高い順）。ここでは計算しない。

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const scoreText = (score) => `${score > 0 ? '+' : ''}${score}`;

function shift(date, days) {
  const [year, month, day] = String(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** 「今日」「明日」「10/8（木）」 */
export function dayLabel(date, today) {
  if (date === today) return '今日';
  if (date === shift(today, 1)) return '明日';
  const [year, month, day] = date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}/${day}（${weekday}）`;
}

function Row({ index, when, entry, name, onClick }) {
  const { item } = entry;
  const elements = [item.palaceData?.hachimon, item.palaceData?.hasshin].filter(Boolean).join('・');
  return (
    <button type="button" className={`theme-best-row${index === 0 ? ' is-top' : ''}`} onClick={onClick}>
      <span className="theme-best-no lat">{index + 1}</span>
      <span className="theme-best-main">
        <span className="theme-best-when">{when}</span>
        <strong>{item.label}</strong>
        <span className="theme-best-why">{`${name}${item.themeRank}${elements ? `・${elements}` : ''}`}</span>
      </span>
      <span className="theme-best-score lat">{scoreText(item.score)}</span>
      <b aria-hidden="true">›</b>
    </button>
  );
}

export default function ThemeBestView({
  theme,
  onThemeChange,
  kind = 'time',
  onKindChange,
  today,
  liveSlotHour,
  onGoTime, // ({ date, hour, palace }) 時盤の地図を、その日時・方位で開く
  onGoDay,  // ({ date, palace }) 日盤の地図を、その日・方位で開く
}) {
  const [expanded, setExpanded] = useState(false);
  const name = themeLabel(theme);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => shift(today, index)), [today]);

  const groups = useMemo(() => {
    if (!theme) return [];
    if (kind === 'day') {
      return [{
        key: 'week',
        label: 'これから1週間',
        empty: `この1週間には、${name}に向く方位がありません。`,
        list: bestDaysForTheme({ theme, dates: weekDates }),
      }];
    }
    return [
      {
        key: 'today',
        label: '今日',
        empty: `今日の残りの時間には、${name}に向く方位がありません。`,
        list: bestTimesForTheme({ theme, dates: [today], fromHour: liveSlotHour }),
      },
      {
        key: 'week',
        label: 'これから1週間',
        empty: `この1週間には、${name}に向く方位がありません。`,
        list: bestTimesForTheme({ theme, dates: weekDates, fromHour: liveSlotHour }),
      },
    ];
  }, [theme, kind, name, today, weekDates, liveSlotHour]);

  if (!theme) return null;
  const hasMore = groups.some((group) => group.list.length > 1);

  return (
    <div className="theme-screen">
      <div className="theme-picker" role="group" aria-label="目的で選ぶ">
        <div className="theme-picker-chips">
          {THEMES.map((item) => (
            <button
              key={item.key}
              type="button"
              className={theme === item.key ? 'is-active' : ''}
              aria-pressed={theme === item.key}
              onClick={() => onThemeChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="reverse-mode-tabs reverse-mode-tabs--two" aria-label="近所か遠出かを選ぶ">
        <button type="button" className={kind === 'time' ? 'is-active' : ''} aria-pressed={kind === 'time'} onClick={() => onKindChange('time')}>
          近所へ（時盤）
        </button>
        <button type="button" className={kind === 'day' ? 'is-active' : ''} aria-pressed={kind === 'day'} onClick={() => onKindChange('day')}>
          遠出・旅行（日盤）
        </button>
      </div>
    <section className="theme-best" aria-label={`${name}に一番向く${kind === 'day' ? '日' : '時間'}と方位`}>
      <h3 className="theme-best-title"><Ja>{`${name}に一番向くのは`}</Ja></h3>
      {groups.map((group) => (
        <div key={group.key} className="theme-best-group">
          <p className="theme-best-group-label">{group.label}</p>
          {group.list.length === 0 ? (
            <p className="theme-best-empty"><Ja>{group.empty}</Ja></p>
          ) : group.list.slice(0, expanded ? 3 : 1).map((entry, index) => (
            <Row
              key={`${entry.date}-${entry.hour ?? 'day'}`}
              index={index}
              name={name}
              entry={entry}
              when={kind === 'day'
                ? dayLabel(entry.date, today)
                : `${group.key === 'today' ? '' : `${dayLabel(entry.date, today)} `}${entry.label}${entry.date === today && entry.hour === liveSlotHour ? '（いま）' : ''}`}
              onClick={() => (kind === 'day'
                ? onGoDay({ date: entry.date, palace: entry.item.palace })
                : onGoTime({ date: entry.date, hour: entry.hour, palace: entry.item.palace }))}
            />
          ))}
        </div>
      ))}
      {hasMore && (
        <button type="button" className="theme-best-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? '1位だけにする' : '2位・3位も見る'}
        </button>
      )}
      <p className="theme-best-note">
        <Ja>
          {kind === 'day'
            ? '押すと、その日の地図が開きます。遠出は、50キロ以上はなれた場所へ行くときの見方です。'
            : '押すと、その時間の地図が開きます。朝5時から夜11時までの時間帯で比べています。'}
        </Ja>
      </p>
    </section>
    </div>
  );
}
