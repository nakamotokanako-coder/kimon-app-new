import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Papa from 'papaparse';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../data');

function parseCsv(path) {
  const csv = readFileSync(path, 'utf8');
  const { data, errors } = Papa.parse(csv, { header: true, skipEmptyLines: true });
  if (errors.length) {
    const fatal = errors.filter((e) => e.type !== 'FieldMismatch');
    if (fatal.length) throw new Error(`CSV parse error in ${path}: ${JSON.stringify(fatal)}`);
  }
  return data;
}

let _koyomi = null;
let _banTable = null;
let _kimonTables = null;

export function loadKoyomi() {
  if (_koyomi) return _koyomi;
  const rows = parseCsv(resolve(dataDir, 'koyomi.csv'));
  _koyomi = Object.fromEntries(rows.map((r) => [r.date, r]));
  return _koyomi;
}

export function loadBanTable() {
  if (_banTable) return _banTable;
  const rows = parseCsv(resolve(dataDir, 'chito_ase_to_namida.csv'));
  _banTable = Object.fromEntries(rows.map((r) => [r.key, r]));
  return _banTable;
}

export function loadKimonTables() {
  if (_kimonTables) return _kimonTables;
  const json = readFileSync(resolve(dataDir, 'kimon_tables.json'), 'utf8');
  _kimonTables = JSON.parse(json);
  return _kimonTables;
}
