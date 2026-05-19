import Papa from 'papaparse';
import csv from '../../data/shoui_64ka.csv?raw';

let _cache = null;

export function loadShoui() {
  if (_cache) return _cache;
  const { data, errors } = Papa.parse(csv, { header: true, skipEmptyLines: true });
  if (errors.length) {
    const fatal = errors.filter((e) => e.type !== 'FieldMismatch');
    if (fatal.length) throw new Error(`shoui_64ka.csv parse error: ${JSON.stringify(fatal)}`);
  }
  _cache = Object.fromEntries(data.map((r) => [r.pair, r]));
  return _cache;
}

export function lookupShoui(pair) {
  const shoui = loadShoui();
  return shoui[pair] || null;
}
