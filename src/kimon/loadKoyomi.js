import Papa from 'papaparse';
import csv from '../../data/koyomi_v4.csv?raw';

let _cache = null;

export function loadKoyomi() {
  if (_cache) return _cache;
  const { data, errors } = Papa.parse(csv, { header: true, skipEmptyLines: true });
  if (errors.length) {
    const fatal = errors.filter((e) => e.type !== 'FieldMismatch');
    if (fatal.length) throw new Error(`koyomi_v4.csv parse error: ${JSON.stringify(fatal)}`);
  }
  _cache = Object.fromEntries(data.map((r) => [r.date, r]));
  return _cache;
}

export function lookupKoyomi(date) {
  const koyomi = loadKoyomi();
  const row = koyomi[date];
  if (!row) throw new Error(`koyomi_v4.csv: date not found: ${date}`);
  return row;
}
