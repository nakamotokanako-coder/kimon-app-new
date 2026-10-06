import React, { useMemo, useState } from 'react';
import Ja from '../utils/Ja.jsx';
import { Icon } from '../components/icons/index.js';
import {
  THEMES, themeLabel, bestTimesForTheme, bestDaysForTheme, gradeOf, slotClock,
} from './themeSearch.js';

// 「目的で選ぶ」の画面。目的を選ぶと、いつ・どの方位が一番向くかを出す。この画面はそれだけをする。
//   目的を選ぶ → どんな移動？（近場＝時盤／遠く＝日盤）→ BEST 1 を大きく → 2位・3位は折りたたみ
// 答え（方位・星・日時）を主役にして、点数は出さない（点数は、地図を開いた先の詳しいカードにある）。
// 近場でも遠くでも、同じ形・同じ高さで出す。
// 順位と星の決め方は themeSearch.js。ここでは計算しない。

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const KINDS = [
  { key: 'time', title: '近場へ行く', sub: '散歩・買い物・仕事など', tech: '時盤' },
  { key: 'day', title: '遠くへ行く', sub: '旅行・出張など', tech: '日盤' },
];

const PERIODS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '今週' },
];

// BEST 1 に添える一言。効果は約束しない（「運が上がる」とは書かない）。
const THEME_COPY = {
  goen: 'ご縁を結ぶなら、ここ。',
  shigoto: '仕事を動かすなら、ここ。',
  kinun: 'お金のことを進めるなら、ここ。',
  kenko: '体を整えるなら、ここ。',
  benkyo: '学びを進めるなら、ここ。',
};

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

function Stars({ count }) {
  return (
    <span className="theme-stars" role="img" aria-label={`5つ中${count}つ`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={16} filled={n <= count} className={n <= count ? '' : 'is-off'} />
      ))}
    </span>
  );
}

function whenText(entry, kind, today, liveSlotHour) {
  const day = dayLabel(entry.date, today);
  if (kind === 'day') return day;
  return `${day} ${slotClock(entry.hour)}${entry.date === today && entry.hour === liveSlotHour ? '（いま）' : ''}`;
}

const elementsOf = (item) => [item.palaceData?.hachimon, item.palaceData?.hasshin, item.palaceData?.kyusei].filter(Boolean);

export default function ThemeBestView({
  theme,
  onThemeChange,
  kind = 'time',
  onKindChange,
  today,
  liveSlotHour,
  lateNight = false, // 夜、自然時の補正で「23-1時」に入っている（今日の残りは、今の時間帯だけ）
  onGoTime, // ({ date, hour, palace }) 時盤の地図を、その日時・方位で開く
  onGoDay,  // ({ date, palace }) 日盤の地図を、その日・方位で開く
}) {
  const [period, setPeriod] = useState('week');
  const [expanded, setExpanded] = useState(false);
  const name = themeLabel(theme);
  const periodLabel = PERIODS.find((item) => item.key === period)?.label || '';

  const list = useMemo(() => {
    const dates = period === 'today' ? [today] : Array.from({ length: 7 }, (_, index) => shift(today, index));
    return kind === 'day'
      ? bestDaysForTheme({ theme, dates })
      : bestTimesForTheme({ theme, dates, fromHour: liveSlotHour, onlyNowOnFirstDay: lateNight });
  }, [theme, kind, period, today, liveSlotHour, lateNight]);

  const go = (entry) => (kind === 'day'
    ? onGoDay({ date: entry.date, palace: entry.item.palace })
    : onGoTime({ date: entry.date, hour: entry.hour, palace: entry.item.palace }));

  const best = list[0] || null;
  const others = list.slice(1, 3);
  const bestGrade = best ? gradeOf(best.item) : null;

  return (
    <div className="theme-screen">
      <section className="theme-step" aria-label="目的を選ぶ">
        <h3 className="theme-step-title">目的を選ぶ</h3>
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
      </section>

      <section className="theme-step" aria-label="どんな移動？">
        <h3 className="theme-step-title">どんな移動？</h3>
        <div className="theme-kinds">
          {KINDS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`theme-kind${kind === item.key ? ' is-active' : ''}`}
              aria-pressed={kind === item.key}
              onClick={() => onKindChange(item.key)}
            >
              <strong>{item.title}</strong>
              <span>{item.sub}</span>
              <small>（{item.tech}）</small>
            </button>
          ))}
        </div>
      </section>

      <section className="theme-step" aria-label={`${periodLabel}の、${name}に一番向く方位`}>
        <div className="theme-step-head">
          <h3 className="theme-step-title">{`${periodLabel}のBEST方位`}</h3>
          <div className="theme-periods" role="group" aria-label="期間">
            {PERIODS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={period === item.key ? 'is-active' : ''}
                aria-pressed={period === item.key}
                onClick={() => setPeriod(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {best ? (
          <div className="theme-best-card">
            <p className="theme-best-kicker"><Icon name="crown" size={18} />BEST 1</p>
            <p className="theme-best-dir">{best.item.label}</p>
            <p className="theme-best-grade">
              <Stars count={bestGrade.stars} />
              <b>{bestGrade.label}</b>
            </p>
            <p className="theme-best-when"><Icon name="calendar" size={18} />{whenText(best, kind, today, liveSlotHour)}</p>
            <p className="theme-best-copy"><Ja>{THEME_COPY[theme] || ''}</Ja></p>
            <div className="theme-best-tags">
              {elementsOf(best.item).map((element) => <span key={element}>{element}</span>)}
            </div>
            <button type="button" className="theme-best-cta" onClick={() => go(best)}>
              方位を地図で見る <Icon name="arrow-right" size={18} />
            </button>
          </div>
        ) : (
          <div className="theme-best-card is-empty">
            <p className="theme-best-copy">
              <Ja>{`${period === 'today' ? '今日の残りの時間' : 'この1週間'}には、${name}に向く方位がありません。`}</Ja>
            </p>
            {period === 'today' && (
              <button type="button" className="theme-best-more" onClick={() => setPeriod('week')}>今週から探す</button>
            )}
          </div>
        )}

        {others.length > 0 && (
          <>
            <button type="button" className="theme-best-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
              {expanded ? '2位・3位を閉じる' : '2位・3位を見る'} <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} />
            </button>
            {expanded && others.map((entry, index) => {
              const grade = gradeOf(entry.item);
              return (
                <button key={`${entry.date}-${entry.hour ?? 'day'}`} type="button" className="theme-best-row" onClick={() => go(entry)}>
                  <span className="theme-best-no lat">{index + 2}</span>
                  <span className="theme-best-main">
                    <strong>{entry.item.label}</strong>
                    <span>{whenText(entry, kind, today, liveSlotHour)}</span>
                  </span>
                  <span className="theme-best-rowgrade"><Stars count={grade.stars} /><small>{grade.label}</small></span>
                  <b aria-hidden="true">›</b>
                </button>
              );
            })}
          </>
        )}
      </section>
    </div>
  );
}
