/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BasePointBar from './BasePointBar.jsx';
import { MAP_SEARCH_STORAGE_KEY } from '../../reverseDirection/mapSearch.js';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('BasePointBar', () => {
  it('地点名・自然時補正・経度を表示する', () => {
    render(<BasePointBar center={[139.7671, 35.6812]} baseName="東京" onCenterChange={() => {}} />);

    expect(screen.getByText('東京')).toBeTruthy();
    expect(screen.getByText('+19分')).toBeTruthy();
    expect(screen.getByText('経度139.77')).toBeTruthy();
  });

  it('変更ボタンでシートを開き、閉じられる', () => {
    render(<BasePointBar center={[139.7671, 35.6812]} baseName="東京" onCenterChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '変更▾' }));

    expect(screen.getByRole('dialog', { name: '基準点を変更' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '基準点変更を閉じる' }));

    expect(screen.queryByRole('dialog', { name: '基準点を変更' })).toBe(null);
  });

  it('localStorage のお気に入りをシートに表示する', () => {
    window.localStorage.setItem(MAP_SEARCH_STORAGE_KEY, JSON.stringify([
      { name: '自宅', label: 'My Home', latitude: 35.7, longitude: 139.7 },
    ]));
    render(<BasePointBar center={[139.7671, 35.6812]} baseName="東京" onCenterChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '変更▾' }));

    expect(screen.getByRole('button', { name: 'My Home' })).toBeTruthy();
  });
});
