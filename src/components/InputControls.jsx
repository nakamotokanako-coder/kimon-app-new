import React from 'react';
import { JISHIN_LABELS, getJishinSlotHour, getTodayJst } from '../utils/jishinLabels';

const HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
const BOARD_TYPES = ['日', '時'];

export default function InputControls({ date, hour, boardType, onChange }) {
  const handleNow = () => {
    const slotHour = getJishinSlotHour(new Date());
    const todayJst = getTodayJst();
    const patch = {};
    if (hour !== slotHour) patch.hour = slotHour;
    if (date !== todayJst) patch.date = todayJst;
    if (Object.keys(patch).length > 0) onChange(patch);
  };

  return (
    <div className="input-controls">
      <label className="ctrl">
        <span>日付</span>
        <input
          type="date"
          value={date}
          onChange={(e) => onChange({ date: e.target.value })}
        />
      </label>

      <label className="ctrl ctrl-hour">
        <span>時刻</span>
        <div className="ctrl-hour-row">
          <select
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

      <fieldset className="ctrl board-type">
        <legend>盤種</legend>
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
      </fieldset>
    </div>
  );
}
