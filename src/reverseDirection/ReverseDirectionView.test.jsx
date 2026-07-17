/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ReverseDirectionView from './ReverseDirectionView.jsx';

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
