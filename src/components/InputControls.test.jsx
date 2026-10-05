/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InputControls from './InputControls.jsx';
import { getBoardDate } from '../utils/boardDate';
import { getJishinSlotHour } from '../utils/jishinLabels';
import { modeHintFor } from '../reverseDirection/DirectionMap.jsx';

afterEach(cleanup);

const base = { direction: 'north_bottom', onDirectionChange: () => {} };

describe('盤: 今の盤か、指定した日時の盤か', () => {
  it('今の盤を見ているときは、そう書く（戻すボタンは出さない）', () => {
    const now = new Date();
    render(<InputControls {...base} date={getBoardDate(now)} hour={getJishinSlotHour(now)} boardType="時" onChange={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('今の時盤を見ています');
  });

  it('日時を指定しているときは、そう書いて「戻す」を出す。日盤でも戻せる', () => {
    const onChange = vi.fn();
    render(<InputControls {...base} date="2020-01-01" hour={0} boardType="日" onChange={onChange} />);
    expect(screen.getByRole('status').textContent).toContain('指定した日の日盤を見ています');
    fireEvent.click(screen.getByRole('button', { name: '今日に戻す' }));
    expect(onChange).toHaveBeenCalledWith({ date: getBoardDate(new Date()) });
  });

  it('日付を変えられない人には、戻すボタンを出さない', () => {
    render(<InputControls {...base} date="2020-01-01" hour={0} boardType="日" onChange={() => {}} dateLocked />);
    expect(screen.queryByRole('button', { name: '今日に戻す' })).toBe(null);
  });
});

describe('地図: 距離が今の盤の目安と合わないときの案内', () => {
  it('時盤で50km以上なら日盤を、日盤で50km未満なら時盤をすすめる', () => {
    expect(modeHintFor('jiban', 49999)).toBe(null);
    expect(modeHintFor('jiban', 50000).cta).toBe('日盤で見る');
    expect(modeHintFor('nichiban', 50000)).toBe(null);
    expect(modeHintFor('nichiban', 3000).cta).toBe('時盤で見る');
    expect(modeHintFor('jiban', undefined)).toBe(null);
  });
});
