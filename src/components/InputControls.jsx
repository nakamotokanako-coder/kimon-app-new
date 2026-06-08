import React from 'react';
import { getBoardDate } from '../utils/boardDate';
import { JISHIN_LABELS, getJishinSlotHour } from '../utils/jishinLabels';

const HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
const BOARD_TYPES = ['日', '時'];
const DIRECTIONS = [
  { value: 'north_bottom', label: '北を下' },
  { value: 'south_bottom', label: '南を下' },
];

export default function InputControls({ date, hour, boardType, direction, onChange, onDirectionChange }) {
  const handleNow = () => {
    const now = new Date();
    const slotHour = getJishinSlotHour(now);
    const boardDate = getBoardDate(now);
    const patch = {};
    if (hour !== slotHour) patch.hour = slotHour;
    if (date !== boardDate) patch.date = boardDate;
    if (Object.keys(patch).length > 0) onChange(patch);
  };

  return (
    <div className="input-controls">
      <label className={`ctrl ctrl-date ${boardType === '日' ? 'is-emphasis' : 'is-muted'}`}>
        <span>日付</span>
        <input
          className="lat"
          type="date"
          value={date}
          onChange={(e) => onChange({ date: e.target.value })}
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
