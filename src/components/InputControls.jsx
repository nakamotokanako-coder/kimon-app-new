import React from 'react';

const HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
const BOARD_TYPES = ['日', '時'];

export default function InputControls({ date, hour, boardType, onChange }) {
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

      <label className="ctrl">
        <span>時刻</span>
        <select
          value={hour}
          onChange={(e) => onChange({ hour: Number(e.target.value) })}
          disabled={boardType !== '時'}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
          ))}
        </select>
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
