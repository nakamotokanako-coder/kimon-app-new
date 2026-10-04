/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ReverseDirectionView, { shiftDate } from './ReverseDirectionView.jsx';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('ReverseDirectionView 日盤遠出（PR-D1: 骨格掃除）', () => {
  it('日盤遠出タブでは「はじめての方へ」帯・「② 行き先を探す」ラベルを表示しない', () => {
    render(
      <ReverseDirectionView
        isActive
        onOpenBoard={() => {}}
        onOpenNotifications={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '日盤 遠出' }));

    expect(screen.queryByText(/はじめての方へ/)).toBe(null);
    expect(screen.queryByText('② 行き先を探す')).toBe(null);
    expect(screen.queryByText('まず①で出発点を決めてください')).toBe(null);
    expect(document.querySelector('.reverse-go-guide')).toBe(null);
    expect(document.querySelector('.reverse-step-title')).toBe(null);
  });
});

describe('ReverseDirectionView 日盤遠出のGOゾーン統合（PR-D2）', () => {
  it('日盤遠出には「地図で探す/お気に入り」タブスイッチャーが存在しない（地図常時表示）', () => {
    render(
      <ReverseDirectionView
        isActive
        onOpenBoard={() => {}}
        onOpenNotifications={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '日盤 遠出' }));

    expect(screen.queryByText('地図で探す')).toBe(null);
    expect(screen.queryByRole('button', { name: 'お気に入り' })).toBe(null);
    expect(document.querySelector('.reverse-go-tabs')).toBe(null);
    expect(screen.queryByText(/気になる場所のピンをタップすると/)).toBe(null);
    expect(document.querySelector('.direction-map')).toBeTruthy();
  });

  it('日盤遠出でFavoritesStrip（お気に入りストリップ）が表示される', () => {
    render(
      <ReverseDirectionView
        isActive
        onOpenBoard={() => {}}
        onOpenNotifications={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '日盤 遠出' }));

    expect(document.querySelector('.fav-strip')).toBeTruthy();
    expect(screen.getByText(/お気に入り（/)).toBeTruthy();
  });

  it('日盤遠出で50kmキャプション・距離レジェンドが残っている（退行防止）', () => {
    render(
      <ReverseDirectionView
        isActive
        onOpenBoard={() => {}}
        onOpenNotifications={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '日盤 遠出' }));

    expect(document.querySelector('.direction-map-caption')).toBeTruthy();
    expect(document.body.textContent).toContain('50km以上＋3時間滞在で効果');
    expect(document.querySelector('.direction-scale-card')).toBeTruthy();
    expect(document.body.textContent).toContain('日盤の距離：内が薄い → 外が濃い');
  });
});

describe('時盤の日付を選ぶ（明日の何時はどうか、を見る）', () => {
  const setupTime = () => render(<ReverseDirectionView isActive variant="map" mode="time" onModeChange={() => {}} onOpenBoard={() => {}} />);
  const dateGroup = () => within(screen.getByRole('group', { name: '日付を選ぶ' }));

  it('最初は今日。今の時間帯に「いま」が付く', () => {
    setupTime();
    expect(dateGroup().getByRole('button', { name: '今日' }).getAttribute('aria-pressed')).toBe('true');
    expect(dateGroup().getByRole('button', { name: '明日' }).getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelectorAll('.reverse-slot-chip.is-now')).toHaveLength(1);
    expect(document.querySelector('.reverse-picked-note')).toBe(null);
  });

  it('明日を選ぶと、明日の12の時間帯になり、「いま」の印は消える。地図のパネルの条件にも日付が出る', () => {
    setupTime();
    const today = screen.getByLabelText('時盤の日付').value;
    const before = [...document.querySelectorAll('.reverse-slot-chip small')].map((el) => el.textContent.replace('いま・', ''));
    fireEvent.click(dateGroup().getByRole('button', { name: '明日' }));
    const tomorrow = shiftDate(today, 1);
    expect(screen.getByLabelText('時盤の日付').value).toBe(tomorrow);
    expect(document.querySelectorAll('.reverse-slot-chip')).toHaveLength(12);
    expect(document.querySelectorAll('.reverse-slot-chip.is-now')).toHaveLength(0);
    const after = [...document.querySelectorAll('.reverse-slot-chip small')].map((el) => el.textContent);
    expect(after.join()).not.toContain('いま');
    expect(after).not.toEqual(before); // 別の日の盤になっている
    expect(document.querySelector('.reverse-picked-note').textContent).toContain(tomorrow.replaceAll('-', '/'));

    // 「今の時間に戻す」で今日・今に戻る
    fireEvent.click(screen.getByRole('button', { name: '今の時間に戻す' }));
    expect(screen.getByLabelText('時盤の日付').value).toBe(today);
    expect(document.querySelectorAll('.reverse-slot-chip.is-now')).toHaveLength(1);
  });

  it('好きな日付を入れられる', () => {
    setupTime();
    fireEvent.change(screen.getByLabelText('時盤の日付'), { target: { value: '2026-12-24' } });
    expect(document.querySelector('.reverse-picked-note').textContent).toContain('2026/12/24');
    expect(dateGroup().getByRole('button', { name: '今日' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('日付をずらす計算は、月や年をまたいでも正しい', () => {
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });
});
