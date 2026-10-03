/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProseText, proseParagraphs, splitProse, stripBold } from './renderProse.jsx';

afterEach(cleanup);

const TEXT = '**金運は、育てる方位です。**\n\n伏吟の影響で停滞しやすい日です。\n\n**「お金を育てる」ために使いたい方位**です。';

describe('解説文の表示', () => {
  it('空行で段落に分け、** を太字にする（印は画面に出さない）', () => {
    const { container } = render(<ProseText text={TEXT} />);
    expect(container.querySelectorAll('p')).toHaveLength(3);
    expect([...container.querySelectorAll('strong')].map((s) => s.textContent)).toEqual([
      '金運は、育てる方位です。',
      '「お金を育てる」ために使いたい方位',
    ]);
    expect(container.textContent).not.toContain('*');
  });

  it('見出しと本文に分ける', () => {
    expect(splitProse(TEXT).lead).toBe('金運は、育てる方位です。');
    expect(proseParagraphs(splitProse(TEXT).body)).toHaveLength(2);
    expect(stripBold('**a**b')).toBe('ab');
  });

  it('空の文でも落ちない', () => {
    const { container } = render(<ProseText text={null} />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });
});
