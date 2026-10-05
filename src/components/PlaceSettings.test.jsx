/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlaceSettings from './PlaceSettings.jsx';
import { MAP_SEARCH_STORAGE_KEY } from '../reverseDirection/mapSearch.js';
import { BASE_POINT_STORAGE_KEY, FAVORITES_CHANGED_EVENT } from '../sync/userDataSync.js';
import { readSavedDistance, DISTANCE_STORAGE_PREFIX } from '../reverseDirection/DirectionMap.jsx';

const FAVORITES = [
  { name: '東京タワー', latitude: 35.6586, longitude: 139.7454, kind: 'spot' },
  { name: '自宅', label: 'うち', latitude: 35.7, longitude: 139.7, kind: 'home' },
];

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(MAP_SEARCH_STORAGE_KEY, JSON.stringify(FAVORITES));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('設定の「場所」', () => {
  it('今の基準点の名前を出す。無ければ東京。変えるときは地図へ', () => {
    const onChangeBasePoint = vi.fn();
    render(<PlaceSettings onChangeBasePoint={onChangeBasePoint} />);
    expect(screen.getByText(/今は「東京」です/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '地図で変える' }));
    expect(onChangeBasePoint).toHaveBeenCalledTimes(1);
    cleanup();
    window.localStorage.setItem(BASE_POINT_STORAGE_KEY, JSON.stringify({ mode: 'search', location: { name: '大阪駅', latitude: 34.7, longitude: 135.5 } }));
    render(<PlaceSettings onChangeBasePoint={() => {}} />);
    expect(screen.getByText(/今は「大阪駅」です/)).toBeTruthy();
  });

  it('お気に入りを一覧で見て、確かめてから1件ずつ消せる（地図にも伝える）', () => {
    const heard = vi.fn();
    window.addEventListener(FAVORITES_CHANGED_EVENT, heard);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<PlaceSettings onChangeBasePoint={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /お気に入りの場所（2件）/ }));
    expect(screen.getByText('うち')).toBeTruthy(); // 付けた名前を出す
    fireEvent.click(screen.getByRole('button', { name: '東京タワーを消す' }));
    expect(JSON.parse(window.localStorage.getItem(MAP_SEARCH_STORAGE_KEY))).toHaveLength(2); // 「いいえ」なら消さない
    fireEvent.click(screen.getByRole('button', { name: '東京タワーを消す' }));
    expect(JSON.parse(window.localStorage.getItem(MAP_SEARCH_STORAGE_KEY)).map((f) => f.name)).toEqual(['自宅']);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /お気に入りの場所（1件）/ })).toBeTruthy();
    window.removeEventListener(FAVORITES_CHANGED_EVENT, heard);
  });

  it('「すべて消す」は、確かめたときだけ消す', () => {
    window.localStorage.setItem(BASE_POINT_STORAGE_KEY, JSON.stringify({ mode: 'search', location: { name: '大阪駅', latitude: 34.7, longitude: 135.5 } }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PlaceSettings onChangeBasePoint={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /保存した場所をすべて消す/ }));
    expect(confirm.mock.calls[0][0]).toContain('元に戻せません');
    expect(window.localStorage.getItem(BASE_POINT_STORAGE_KEY)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(MAP_SEARCH_STORAGE_KEY))).toHaveLength(2);
  });
});

describe('地図: 選んだ距離を覚える', () => {
  it('その盤の選択肢にある距離だけを読む', () => {
    expect(readSavedDistance('jiban')).toBe(null);
    window.localStorage.setItem(`${DISTANCE_STORAGE_PREFIX}jiban`, '5');
    window.localStorage.setItem(`${DISTANCE_STORAGE_PREFIX}nichiban`, '7');
    expect(readSavedDistance('jiban')).toBe(5);
    expect(readSavedDistance('nichiban')).toBe(null);
  });
});
