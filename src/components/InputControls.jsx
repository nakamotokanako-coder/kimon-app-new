import React from 'react';
import { getBoardDate } from '../utils/boardDate';
import { JISHIN_LABELS, getJishinSlotHour } from '../utils/jishinLabels';

const HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
const BOARD_TYPES = ['日', '時'];
const DIRECTIONS = [
  { value: 'north_bottom', label: '北を下' },
  { value: 'south_bottom', label: '南を下' },
];

// dateLocked: 全機能を使えない人（未ログインなど）は今日の盤だけ（日付を変えられない。lib/accessPolicy.js）。
export default function InputControls({ date, hour, boardType, direction, onChange, onDirectionChange, dateLocked = false }) {
  const handleNow = () => {
    const now = new Date();
    const slotHour = getJishinSlotHour(now);
    const boardDate = getBoardDate(now);
    const patch = {};
    if (boardType === '時' && hour !== slotHour) patch.hour = slotHour;
    if (date !== boardDate) patch.date = boardDate;
    if (Object.keys(patch).length > 0) onChange(patch);
  };

  // 今の盤を見ているのか、日時を指定した盤を見ているのか
  const nowRef = new Date();
  const isNow = date === getBoardDate(nowRef) && (boardType !== '時' || hour === getJishinSlotHour(nowRef));
  const stateText = boardType === '時'
    ? (isNow ? '今の時盤を見ています' : '指定した日時の時盤を見ています')
    : (isNow ? '今日の日盤を見ています' : '指定した日の日盤を見ています');

  return (
    <div className="input-controls">
      <p className={`ctrl-state${isNow ? ' is-now' : ''}`} role="status">
        <span>{stateText}</span>
        {!isNow && !dateLocked && (
          <button type="button" onClick={handleNow}>{boardType === '時' ? '今に戻す' : '今日に戻す'}</button>
        )}
      </p>
      <label className={`ctrl ctrl-date ${boardType === '日' ? 'is-emphasis' : 'is-muted'}`}>
        <span>日付</span>
        <input
          className="lat"
          type="date"
          value={date}
          onChange={(e) => onChange({ date: e.target.value })}
          disabled={dateLocked}
          title={dateLocked ? '日付の変更はログイン後に使えます' : undefined}
        />
      </label>

      <label className={`ctrl ctrl-hour ${boardType === '時' ? 'is-emphasis' : 'is-muted'}`}>
        <span>時刻</span>
        <div className="ctrl-hour-row">
          <select
            className="lat"
            value={hour}
            onChange={(e) => onChange({ hour: Number(e.target.value) })}
            disabled={boardType !== '時'}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>{JISHIN_LABELS[h]}</option>
            ))}
          </select>
          <button
            type="button"
            className="ctrl-now-btn"
            onClick={handleNow}
            disabled={boardType !== '時'}
            aria-label="現在の時辰と今日に合わせる"
            title="現在の時辰と今日に合わせる"
          >
            いま
          </button>
        </div>
      </label>

      <div className="board-segment-row">
        <fieldset className={`ctrl board-type board-segment ${boardType === '時' ? 'is-second' : 'is-first'}`}>
          <legend>盤種</legend>
          <div className="board-segment-options">
            {BOARD_TYPES.map((bt) => (
              <label key={bt}>
                <input
                  type="radio"
                  name="boardType"
                  value={bt}
                  checked={boardType === bt}
                  onChange={() => onChange({ boardType: bt })}
                />
                {bt}盤
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={`ctrl board-direction board-segment ${direction === 'south_bottom' ? 'is-second' : 'is-first'}`}>
          <legend>方位</legend>
          <div className="board-segment-options">
            {DIRECTIONS.map((item) => (
              <label key={item.value}>
                <input
                  type="radio"
                  name="direction"
                  value={item.value}
                  checked={direction === item.value}
                  onChange={() => onDirectionChange(item.value)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}
