import Papa from 'papaparse';
import csv from '../../data/day_kyokusu.csv?raw';

// 日盤の局数（節気＋上中下元で決定）の最終版 lookup 表。
// 出典: 講座まとめ第2章 p29「日盤局数」の正統実装を lookup 表化したもの。
// 期間: 2026-01-01 〜 2044-01-31（最終版・続きなし）。
// loadKoyomi.js / loadChito.js と同じ流儀。

let _cache = null;
let _range = null;

export function loadDayKyokusu() {
  if (_cache) return _cache;
  // UTF-8 BOM 付きのため先頭の ﻿ を除去（ヘッダ名が "﻿date" になるのを防ぐ）
  const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const { data, errors } = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (errors.length) {
    const fatal = errors.filter((e) => e.type !== 'FieldMismatch');
    if (fatal.length) throw new Error(`day_kyokusu.csv parse error: ${JSON.stringify(fatal)}`);
  }
  _cache = Object.fromEntries(data.map((r) => [r.date, r.day_kyokusu]));

  // 対応期間（CSV の最小/最大日付）。ISO 日付は辞書順 = 時系列順。
  const dates = Object.keys(_cache);
  let min = dates[0];
  let max = dates[0];
  for (const d of dates) {
    if (d < min) min = d;
    if (d > max) max = d;
  }
  _range = { min, max };
  return _cache;
}

/** 対応期間 { min, max } を返す */
export function dayKyokusuRange() {
  loadDayKyokusu();
  return _range;
}

/**
 * 指定日の日局数を返す。範囲外・未提供日は明示的にエラー。
 * @param {string} date - YYYY-MM-DD
 * @returns {string} 例: "陽3局" / "陰7局"
 */
export function lookupDayKyokusu(date) {
  const map = loadDayKyokusu();
  const kyokusu = map[date];
  if (!kyokusu) {
    const { min, max } = _range;
    throw new Error(
      `日盤は${min}〜${max}の期間のみ鑑定できます（指定日: ${date}）`
    );
  }
  return kyokusu;
}
