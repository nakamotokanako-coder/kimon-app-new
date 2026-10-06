import React, { useMemo, useState } from 'react';
import Ja from '../utils/Ja.jsx';
import { THEMES, themeLabel, bestTimesForTheme, bestDaysForTheme } from './themeSearch.js';

// 「目的から探す」の答えを出す画面。目的を選ぶと、いつ・どの方位が一番向くかを順位で出す。
//   今日          … これからの時間帯（時盤）の中の上位
//   これから1週間 … 近所なら時間帯（時盤）、遠出なら日（日盤）の中の上位
// 順位の決め方は themeSearch.js（その目的が◎の方位が先、同じなら総合点の高い順）。ここでは計算しない。
// 行を押すと、その日時・方位のまま地図へ進む。

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
  today,
  liveSlotHour,
  onGoTime, // ({ date, hour, palace }) 地図（時盤）へ
  onGoDay,  // ({ date, palace }) 地図（日盤）へ
}) {
  const [weekKind, setWeekKind] = useState('time');
  const name = themeLabel(theme);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => shift(today, index)), [today]);

  const todayBest = useMemo(() => (
    bestTimesForTheme({ theme, dates: [today], fromHour: liveSlotHour })
  ), [theme, today, liveSlotHour]);
  const weekBest = useMemo(() => (
    weekKind === 'day'
      ? bestDaysForTheme({ theme, dates: weekDates })
      : bestTimesForTheme({ theme, dates: weekDates, fromHour: liveSlotHour })
  ), [theme, weekDates, weekKind, liveSlotHour]);

  return (
    <div className="theme-best">
      <div className="reverse-card theme-best-pick">
        <div className="theme-picker" role="group" aria-label="目的を選ぶ">
          <span className="theme-picker-label">目的を選ぶ</span>
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
      </div>

      <section className="reverse-timeline theme-best-section" aria-label={`今日、${name}に向く時間と方位`}>
        <div className="reverse-section-title">
          <h3 className="maru"><Ja>{`今日、${name}に一番向く時間と方位`}</Ja></h3>
        </div>
        {todayBest.length === 0 ? (
          <p className="reverse-status"><Ja>{`今日の残りの時間には、${name}に向く方位がありません。下の1週間から探してください。`}</Ja></p>
        ) : todayBest.map((entry, index) => (
          <Row
            key={`${entry.date}-${entry.hour}`}
            index={index}
            name={name}
            entry={entry}
            when={`${entry.label}${entry.hour === liveSlotHour ? '（いま）' : ''}`}
            onClick={() => onGoTime({ date: entry.date, hour: entry.hour, palace: entry.item.palace })}
          />
        ))}
      </section>

      <section className="reverse-timeline theme-best-section" aria-label={`これから1週間で、${name}に向く日と方位`}>
        <div className="reverse-section-title">
          <h3 className="maru"><Ja>{`これから1週間で、${name}に一番向く日と方位`}</Ja></h3>
        </div>
        <div className="reverse-mode-tabs reverse-mode-tabs--two" aria-label="近所か遠出かを選ぶ">
          <button type="button" className={weekKind === 'time' ? 'is-active' : ''} aria-pressed={weekKind === 'time'} onClick={() => setWeekKind('time')}>
            近所へ（時盤）
          </button>
          <button type="button" className={weekKind === 'day' ? 'is-active' : ''} aria-pressed={weekKind === 'day'} onClick={() => setWeekKind('day')}>
            遠出・旅行（日盤）
          </button>
        </div>
        {weekBest.length === 0 ? (
          <p className="reverse-status"><Ja>{`この1週間には、${name}に向く方位がありません。`}</Ja></p>
        ) : weekBest.map((entry, index) => (
          <Row
            key={`${entry.date}-${entry.hour ?? 'day'}`}
            index={index}
            name={name}
            entry={entry}
            when={weekKind === 'day' ? dayLabel(entry.date, today) : `${dayLabel(entry.date, today)} ${entry.label}`}
            onClick={() => (weekKind === 'day'
              ? onGoDay({ date: entry.date, palace: entry.item.palace })
              : onGoTime({ date: entry.date, hour: entry.hour, palace: entry.item.palace }))}
          />
        ))}
        <p className="theme-best-note">
          <Ja>
            {weekKind === 'day'
              ? '遠出は、50キロ以上はなれた場所へ行くときの見方です。行を押すと、その日の地図が開きます。'
              : '朝5時から夜11時までの時間帯で比べています。行を押すと、その時間の地図が開きます。'}
          </Ja>
        </p>
      </section>
    </div>
  );
}
