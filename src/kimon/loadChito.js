import Papa from 'papaparse';
import csv from '../../data/chito_v2_with_kakkyoku.csv?raw';

let _cache = null;

export function loadChito() {
  if (_cache) return _cache;
  const { data, errors } = Papa.parse(csv, { header: true, skipEmptyLines: true });
  if (errors.length) {
    const fatal = errors.filter((e) => e.type !== 'FieldMismatch');
    if (fatal.length) throw new Error(`chito_v2_with_kakkyoku.csv parse error: ${JSON.stringify(fatal)}`);
  }
  _cache = Object.fromEntries(data.map((r) => [r.key, r]));
  return _cache;
}

export function lookupChito(key) {
  const chito = loadChito();
  const row = chito[key];
  if (!row) throw new Error(`chito_v2_with_kakkyoku.csv: key not found: ${key}`);
  return row;
}
