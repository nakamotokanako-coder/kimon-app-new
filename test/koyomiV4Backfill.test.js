import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(dir, '..', 'data', p), 'utf8').replace(/^﻿/, '').replace(/\r/g, '').trimEnd().split('\n');
const parse = (lines) => {
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => { const c = l.split(','); const o = {}; head.forEach((h, i) => (o[h] = c[i] ?? '')); return o; });
};

const v3lines = read('koyomi_v3.csv');
const v4lines = read('koyomi_v4.csv');
const v3 = parse(v3lines);
const v4 = parse(v4lines);
const v3map = Object.fromEntries(v3.map((r) => [r.date, r]));
const inTarget = (d) => d >= '1900-01-01' && d <= '2002-12-31';

describe('koyomi v4 埋め戻し（1900-2002）', () => {
  it('行数・ヘッダ・日付列は v3 と同一（構造不変）', () => {
    expect(v4lines.length).toBe(v3lines.length);
    expect(v4lines[0]).toBe(v3lines[0]);
    for (let i = 0; i < v3.length; i++) expect(v4[i].date).toBe(v3[i].date);
  });

  it('全行が17列を維持', () => {
    for (const line of v4lines.slice(1)) expect(line.split(',').length).toBe(17);
  });

  it('既存の非空セルは一切上書きしない（先生提供データ保護）', () => {
    let overwrites = 0;
    for (const r4 of v4) {
      const r3 = v3map[r4.date];
      for (const k of Object.keys(r4)) {
        if (r3[k] !== '' && r3[k] !== r4[k]) overwrites++;
      }
    }
    expect(overwrites).toBe(0);
  });

  it('1900-2002 の time_kyokusu / sekki24 / inton_youton が完全充足', () => {
    let t = 0, s = 0, i = 0;
    for (const r of v4) {
      if (!inTarget(r.date)) continue;
      if (!r.time_kyokusu) t++;
      if (!r.sekki24) s++;
      if (!r.inton_youton) i++;
    }
    expect({ time_kyokusu: t, sekki24: s, inton_youton: i }).toEqual({ time_kyokusu: 0, sekki24: 0, inton_youton: 0 });
  });

  it('time_kyokusu / inton は整合（陽n局↔陽 は局数の陰陽とは別系統なので、形式のみ検証）', () => {
    for (const r of v4) {
      if (!inTarget(r.date)) continue;
      expect(r.time_kyokusu).toMatch(/^[陽陰][1-9]局$/);
      expect(r.inton_youton).toMatch(/^[陽陰]$/);
      expect(['上元', '中元', '下元']).toContain(r.sangen);
    }
  });

  it('1922-12-22 以降の time_kyokusu は v2 正本と一致', () => {
    const v2 = parse(read('koyomi_v2.csv'));
    const v2map = Object.fromEntries(v2.map((r) => [r.date, r.time_kyokusu]));
    let mismatch = 0;
    for (const r of v4) {
      if (r.date < '1922-12-22' || r.date > '2002-12-31') continue;
      if (v2map[r.date] && v2map[r.date] !== r.time_kyokusu) mismatch++;
    }
    expect(mismatch).toBe(0);
  });

  it('kyusei_day(日家九星)は 2000 年以前を意図的に空欄維持（非標準則・検証不能）', () => {
    // 1900-1999 は空、2000-2002 は既存値が残る
    let pre2000Filled = 0;
    for (const r of v4) {
      if (r.date >= '1900-01-01' && r.date <= '1999-12-31' && r.kyusei_day) pre2000Filled++;
    }
    expect(pre2000Filled).toBe(0);
  });
});
