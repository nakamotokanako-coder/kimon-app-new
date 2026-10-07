import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Ja from '../utils/Ja.jsx';
import { Icon } from './icons/index.js';
import { KAKKYOKU_GUIDE } from '../reverseDirection/kakkyokuGuide.js';
import {
  RARE_TIERS, addDays, countdownLabel, rareOutlook, remainingLabel,
} from '../reverseDirection/rareDays.js';
import { slotClock } from '../reverseDirection/themeSearch.js';

// 稀日（満盤・極盤・双格）の見せ方。
//   RareDayCard  … ホームのいちばん上に出すカード（3日前から当日まで）
//   RareDaySheet … 開いたときの画面（どのくらい珍しいか・格局の案内・地図へ）
// すごさは、実際に数えた回数で伝える。効果は約束しない。金の枠は、このカードだけに使う。
// いつ・何が出るかは rareDays.js。ここでは計算しない。

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 「10/28（水）」 */
export function rareDateLabel(date) {
  const [year, month, day] = String(date).split('-').map(Number);
  return `${month}/${day}（${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}）`;
}

/**
 * 「10/28（水）21:00–23:00」（極盤・双格は日付だけ）。
 * 23-1時の時間帯は、始まるのが前の日の夜なので「10/27（火）23:00–翌1:00」と書く。
 */
export function rareWhenLabel(event) {
  if (event.hour === null) return rareDateLabel(event.date);
  if (event.hour === 0) return `${rareDateLabel(addDays(event.date, -1))} 23:00–翌1:00`;
  return `${rareDateLabel(event.date)} ${slotClock(event.hour)}`;
}

/** 「天遁と神遁」 */
const joinNames = (names) => names.join('と');

/** 一言: 何が起きている日か */
export function rareHeadline(event) {
  if (event.tier === 'soukaku') return `${joinNames(event.names)}が、同じ日に並びます。`;
  if (event.tier === 'kyokuban') return `${joinNames(event.names)}の方位が、日盤で${event.best.score}点になります。`;
  return `${joinNames(event.names)}の方位が、満点の120点になります。`;
}

function Art({ name, size }) {
  const image = KAKKYOKU_GUIDE[name]?.image;
  if (!image) return null;
  return <img className="rare-art" src={`/divination/${image}.webp`} alt="" width={size} height={size} loading="lazy" decoding="async" />;
}

function Seal({ tier }) {
  return (
    <span className="rare-seal" aria-label={`${tier.name}（${tier.reading}）`}>
      <b>{tier.name}</b>
      <small>{tier.reading}</small>
    </span>
  );
}

export function RareDayCard({ event, today, onOpen }) {
  if (!event) return null;
  const tier = RARE_TIERS[event.tier];
  return (
    <section className="rare-card" aria-label={`${tier.name}のお知らせ`}>
      <div className="rare-card-top">
        <Seal tier={tier} />
        <span className="rare-card-count">{countdownLabel(event, today)}</span>
      </div>
      <p className="rare-card-rarity">{tier.rarity}</p>
      <p className="rare-card-remaining">{remainingLabel(event)}</p>
      <p className="rare-card-headline"><Ja>{rareHeadline(event)}</Ja></p>
      <div className="rare-card-spot">
        <span className="rare-card-arts">{event.names.slice(0, 2).map((name) => <Art key={name} name={name} size={52} />)}</span>
        <span className="rare-card-when">
          <small>{rareWhenLabel(event)}</small>
          <strong>{event.best.label}</strong>
        </span>
      </div>
      <button type="button" className="rare-card-cta" onClick={onOpen}>
        くわしく見る <Icon name="arrow-right" size={18} />
      </button>
    </section>
  );
}

export function RareDaySheet({ event, today, onClose, onGoMap, limited = false, onLogin }) {
  useEffect(() => {
    if (!event) return undefined;
    const root = document.documentElement;
    root.classList.add('sheet-scroll-lock');
    const onKeyDown = (keyEvent) => { if (keyEvent.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      root.classList.remove('sheet-scroll-lock');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [event, onClose]);

  const outlook = useMemo(() => (event ? rareOutlook(event, today) : null), [event, today]);
  if (!event) return null;
  const tier = RARE_TIERS[event.tier];
  const hero = event.names.map((name) => KAKKYOKU_GUIDE[name]?.hero).find(Boolean);

  return createPortal(
    <>
      <div className="l3-overlay open" aria-hidden="true" onClick={onClose} />
      <section className="l3-sheet open rare-sheet" role="dialog" aria-modal="true" aria-label={`${tier.name}の詳細`}>
        <div className="l3-top">
          <div className="l3-handle" aria-hidden="true" onClick={onClose} />
          <button type="button" className="l3-close" aria-label="閉じる" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="l3-content rare-sheet-body">
          {hero
            ? <img className="rare-hero" src={`/divination/${hero}.webp`} alt="" decoding="async" />
            : <div className="rare-hero-arts">{event.names.slice(0, 2).map((name) => <Art key={name} name={name} size={120} />)}</div>}

          <div className="rare-sheet-head">
            <Seal tier={tier} />
            <div>
              <p className="rare-sheet-meaning">{tier.meaning}</p>
              <p className="rare-sheet-when">{rareWhenLabel(event)}<span>{countdownLabel(event, today)}</span></p>
            </div>
          </div>
          <p className="rare-sheet-headline"><Ja>{rareHeadline(event)}</Ja></p>

          <ul className="rare-spots">
            {event.spots.map((spot) => (
              <li key={spot.palace}>
                <strong>{spot.label}</strong>
                <span>{[...spot.names, spot.hachimon].filter(Boolean).join('・')}</span>
              </li>
            ))}
          </ul>

          <h3 className="rare-title">どのくらい珍しい？</h3>
          <div className="rare-stats">
            <div>
              <small>出る回数</small>
              <strong>{tier.rarity}</strong>
            </div>
            <div>
              <small>今年のうちに</small>
              <strong>{remainingLabel(event).replace(/^\d+年は、/u, '')}</strong>
            </div>
            <div>
              <small>この次に出るのは</small>
              <strong>{outlook.nextInDays === null ? '当分ありません' : `${outlook.nextInDays}日後`}</strong>
            </div>
          </div>
          <div className="rare-weeks" role="img" aria-label="これから12週間のうち、出る週">
            {outlook.weeks.map((on, index) => <span key={index} className={on ? 'is-on' : ''} />)}
          </div>
          <p className="rare-note"><Ja>{`これから12週間のうち、${tier.name}が出る週です。${tier.desc}`}</Ja></p>

          {event.names.map((name) => {
            const guide = KAKKYOKU_GUIDE[name];
            if (!guide) return null;
            return (
              <div key={name} className="rare-guide">
                <h3 className="rare-title">{`${name}　${guide.day}`}</h3>
                <p className="rare-guide-desc"><Ja>{guide.desc}</Ja></p>
                <ul className="rare-guide-list">
                  {guide.examples.slice(0, 3).map((text) => (
                    <li key={text}><Icon name="check-circle" size={16} />{text}</li>
                  ))}
                </ul>
              </div>
            );
          })}

          <button type="button" className="rare-cta" onClick={() => (limited ? onLogin?.() : onGoMap?.(event))}>
            <Icon name="map" size={18} />{limited ? 'ログインして地図で見る' : 'この方位を地図で見る'} <Icon name="arrow-right" size={18} />
          </button>
        </div>
      </section>
    </>,
    document.body,
  );
}
