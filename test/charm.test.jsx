/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARM_CATEGORIES, CHARM_LIBRARY, GATE_PREFERENCE, getCharm, orderCharms } from '../src/kimon/charm.js';
import CharmCard from '../src/components/CharmCard.jsx';
import { OMAMORI_OPENED_KEY } from '../src/notifications/dynamicNotices.js';
import { buildDayReverseBoard, buildReverseBoard, PALACE_DIRECTIONS } from '../src/reverseDirection/reverseDirection.js';
import { FORBIDDEN_EXPRESSIONS } from '../src/kaisetsu/composeProse.js';
import { CHARM_IMAGE_IDS } from '../src/kimon/charmImages.js';
import Ja, { MIN_TAIL, jaPhrases, keepTail } from '../src/utils/Ja.jsx';
import { existsSync } from 'node:fs';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const ranking = (palace, score, hachimon = '生門') => ({
  palace,
  label: PALACE_DIRECTIONS.find((d) => d.palace === palace).label,
  score,
  palaceData: { hachimon, hasshin: '六合', kyusei: '天輔' },
});

describe('お守りの中身（象意の一覧）', () => {
  const all = Object.values(CHARM_LIBRARY).flatMap((entry) => entry.charms);

  it('8方位すべてに、象意4語と候補6つがあり、種類は決めた5つのどれか', () => {
    expect(Object.keys(CHARM_LIBRARY).sort()).toEqual(PALACE_DIRECTIONS.map((d) => d.palace).sort());
    for (const entry of Object.values(CHARM_LIBRARY)) {
      expect(entry.symbols).toHaveLength(4);
      expect(entry.charms).toHaveLength(6);
      for (const charm of entry.charms) {
        expect(CHARM_CATEGORIES).toContain(charm.category);
        expect(charm.name && charm.how && charm.link).toBeTruthy();
        expect(charm.how).toMatch(/(ください|構いません)。$/u);
      }
    }
  });

  it('どの門でも主のお守りが決まるよう、門が先に勧める種類は全方位にある', () => {
    for (const [gate, pref] of Object.entries(GATE_PREFERENCE)) {
      for (const [palace, entry] of Object.entries(CHARM_LIBRARY)) {
        expect(entry.charms.some((c) => c.category === pref.order[0]), `${gate} ${palace}`).toBe(true);
      }
    }
  });

  it('効果を言い切らない（凶を消す・無効にする・必ず 等を書かない）', () => {
    const texts = [...all.flatMap((c) => [c.name, c.how, c.link]), ...Object.values(GATE_PREFERENCE).map((p) => p.reason)];
    const banned = [...FORBIDDEN_EXPRESSIONS, '必ず', '絶対', '無効', '消す', '防ぐ', '治る', '運が上が', '開運フード', 'ラッキー'];
    expect(texts.filter((t) => banned.some((w) => t.includes(w)))).toEqual([]);
  });
});

describe('お守りの決め方（盤 → 吉方位 → 象意と門 → 取り入れるもの）', () => {
  it('一番点数の高い吉方位から決める。門によって勧める種類が変わる', () => {
    const rest = [ranking('kan', 10), ranking('ri', -20)];
    expect(getCharm({ rankings: [ranking('son', 60, '生門'), ...rest], sourceType: 'day' }).charm.name).toBe('そば・うどん');
    expect(getCharm({ rankings: [ranking('son', 60, '開門'), ...rest], sourceType: 'day' }).charm.name).toBe('手紙・便箋');
    expect(getCharm({ rankings: [ranking('son', 60, '景門'), ...rest], sourceType: 'day' }).charm.name).toBe('緑・オレンジのもの');
    expect(getCharm({ rankings: [ranking('son', 60, '杜門'), ...rest], sourceType: 'day' }).charm.name).toBe('ストール・スカーフ');
  });

  it('根拠（方位・門・神・星・象意・選んだ理由）と、種類の違う「ほかの取り入れ方」2つを返す', () => {
    const c = getCharm({ rankings: [ranking('son', 60, '生門')], sourceType: 'hour', validTime: '13-15時' });
    expect(c).toMatchObject({
      sourceType: 'hour',
      validTime: '13-15時',
      sourceDirection: '南東',
      sourcePalace: 'son',
      score: 60,
      elements: { gate: '生門', deity: '六合', star: '天輔' },
      symbols: ['風', '移動', '人との縁', '整う'],
    });
    expect(c.reason).toContain('生門');
    expect(c.alternatives).toHaveLength(2);
    const categories = [c.charm.category, ...c.alternatives.map((a) => a.category)];
    expect(new Set(categories).size).toBe(3);
  });

  it('吉の方位が無い盤では出さない（凶方位の象意からは作らない）', () => {
    expect(getCharm({ rankings: [ranking('son', 0), ranking('kan', -30)], sourceType: 'day' })).toBe(null);
    expect(getCharm({ rankings: [], sourceType: 'day' })).toBe(null);
  });

  it('同じ盤なら何度でも同じ結果（ランダムではない）', () => {
    const { rankings } = buildDayReverseBoard({ date: '2026-10-04' });
    expect(getCharm({ rankings, sourceType: 'day' })).toEqual(getCharm({ rankings, sourceType: 'day' }));
    expect(orderCharms('son', '生門')).toEqual(orderCharms('son', '生門'));
  });

  it('実際の盤（日盤1か月・時盤12の時辰）で、吉方位があれば必ずお守りが決まる', () => {
    for (let i = 0; i < 31; i += 1) {
      const date = new Date(Date.UTC(2026, 9, 4 + i)).toISOString().slice(0, 10);
      const { rankings } = buildDayReverseBoard({ date });
      const charm = getCharm({ rankings, sourceType: 'day' });
      expect(Boolean(charm)).toBe(rankings[0].score > 0);
      if (charm) expect(charm.sourceDirection).toBe(rankings[0].label);
    }
    for (let hour = 0; hour < 24; hour += 2) {
      const { rankings } = buildReverseBoard({ date: '2026-10-04', hour });
      expect(Boolean(getCharm({ rankings, sourceType: 'hour' }))).toBe(rankings[0].score > 0);
    }
  });
});

describe('お守りの画像と改行', () => {
  it('48個すべてに重複しない ID が付く（方位-番号。画像のファイル名になる）', () => {
    const ids = Object.keys(CHARM_LIBRARY).flatMap((palace) => orderCharms(palace, '生門').map((c) => c.id));
    expect(ids).toHaveLength(48);
    expect(new Set(ids).size).toBe(48);
    expect(ids.every((id) => /^(kan|gon|shin|son|ri|kun|da|ken)-[1-6]$/.test(id))).toBe(true);
    expect(orderCharms('son', '杜門')[0]).toMatchObject({ id: 'son-1', name: 'ストール・スカーフ' });
  });

  it('画像は、用意されたお守りにだけ出る（無いものは文字だけで、壊れた画像を出さない）', () => {
    const charm = getCharm({ rankings: [ranking('son', 60, '生門')], sourceType: 'day' });
    const { container } = render(<CharmCard charm={charm} sourceType="day" defaultOpen />);
    const expected = [charm.charm, ...charm.alternatives].filter((c) => CHARM_IMAGE_IDS.has(c.id)).length;
    expect(container.querySelectorAll('img.charm-image')).toHaveLength(expected);
    for (const id of CHARM_IMAGE_IDS) expect(existsSync(`public/charms/${id}.webp`), id).toBe(true);
  });

  it('文は文節の切れ目でだけ折り返す（言葉の途中で改行しない）', () => {
    expect(jaPhrases('吉方位へ行けない日の、小さな開運法。')).toEqual(['吉方位へ', '行けない', '日の、', '小さな開運法。']);
    const { container } = render(<p><Ja>長いもの（麺類）を、食事に選んでください。</Ja></p>);
    expect(container.textContent).toBe('長いもの（麺類）を、食事に選んでください。');
    expect(container.querySelectorAll('wbr').length).toBeGreaterThan(1);
    expect(container.querySelector('.ja')).toBeTruthy();
  });
});

describe('最後の行に数文字だけ残さない', () => {
  it('終わりの文節は、7文字以上になるまでつなげて、そこでは折り返さない', () => {
    expect(keepTail(['金運は、', '一気に', '稼ぐより', '育てる', '方位です。'])).toEqual(['金運は、', '一気に', '稼ぐより', '育てる方位です。']);
    expect(keepTail(['行きたい', '方位の', 'ベストな', '日'])).toEqual(['行きたい', '方位のベストな日']);
    expect(keepTail(['短い', '文'])).toEqual(['短い文']);
    expect(keepTail(['これで十分な長さです。'])).toEqual(['これで十分な長さです。']);
  });

  it('アプリの文（お守り48個の説明・見出し）は、どれも最後のまとまりが7文字以上', () => {
    const texts = [
      ...Object.values(CHARM_LIBRARY).flatMap((e) => e.charms.map((c) => c.how)),
      ...Object.values(GATE_PREFERENCE).map((p) => p.reason),
      '吉方位へ行けない日の、小さな開運法。',
      '今日一日、吉のエッセンスとして取り入れてみてください。',
      '次の休み、どこへ行く？',
      '行きたい方位のベストな日',
    ];
    for (const text of texts) {
      const phrases = jaPhrases(text);
      const tail = [...phrases[phrases.length - 1]].length;
      expect(tail >= Math.min(MIN_TAIL, [...text].length), text).toBe(true);
    }
  });
});

describe('お守りの表示', () => {
  const charm = getCharm({ rankings: [ranking('son', 60, '生門')], sourceType: 'day' });

  it('閉じた状態は「今日のお守りを見る」（引く・ガチャの言葉を使わない）。開くと記録する', () => {
    const { container } = render(<CharmCard charm={charm} sourceType="day" />);
    expect(screen.getByRole('button', { name: /今日のお守り/ }).textContent).toContain('今日のお守りを見る');
    expect(container.textContent).not.toMatch(/引く|ガチャ|当たり/u);
    expect(window.localStorage.getItem(OMAMORI_OPENED_KEY)).toBe(null);
    fireEvent.click(screen.getByRole('button', { name: /今日のお守り/ }));
    expect(window.localStorage.getItem(OMAMORI_OPENED_KEY)).toBeTruthy();
    expect(screen.getByText('そば・うどん')).toBeTruthy();
    expect(screen.getByText('今日取り入れるもの')).toBeTruthy();
  });

  it('専門の根拠は「なぜこれがお守りになる？」を開いたときだけ出す', () => {
    render(<CharmCard charm={charm} sourceType="day" defaultOpen />);
    expect(screen.queryByText('六合')).toBe(null);
    fireEvent.click(screen.getByRole('button', { name: /なぜこれがお守りになる/ }));
    expect(screen.getByText('六合')).toBeTruthy();
    expect(screen.getByText('今日の吉方位')).toBeTruthy();
    expect(screen.getByText(/南東は「風・移動・人との縁・整う」を表す方位です/)).toBeTruthy();
  });

  it('時盤は「この時間のお守り」として出し、時間帯を添える', () => {
    const onSee = vi.fn();
    render(<CharmCard charm={{ ...charm, sourceType: 'hour' }} sourceType="hour" validTime="13-15時" defaultOpen onSeeDirection={onSee} />);
    expect(screen.getByText('この時間に取り入れるもの')).toBeTruthy();
    expect(screen.getByText('13-15時')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /この時間の吉方位を詳しく見る/ }));
    expect(onSee).toHaveBeenCalledTimes(1);
  });

  it('吉の方位が無いときは、その旨だけを出す', () => {
    render(<CharmCard charm={null} sourceType="day" defaultOpen />);
    expect(screen.getByText(/今日の日盤には、吉の方位がありません/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /なぜこれがお守りになる/ })).toBe(null);
  });

  it('効果を言い切る表現を出さない', () => {
    const { container } = render(<CharmCard charm={charm} sourceType="day" defaultOpen />);
    fireEvent.click(screen.getByRole('button', { name: /なぜこれがお守りになる/ }));
    expect(container.textContent).not.toMatch(/無効|凶を消|完全に|必ず|絶対|和らげます|防ぎます/u);
    expect(container.textContent).toContain('補助的な取り入れ方');
  });
});
