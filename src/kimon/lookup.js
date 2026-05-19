import { loadKoyomi, loadBanTable } from './loadData_old.js';

export function lookupKoyomi(date) {
  const k = loadKoyomi()[date];
  if (!k) throw new Error(`koyomi: date not found: ${date}`);
  return k;
}

export function lookupBan(kyokusu, eto) {
  const key = `${kyokusu}${eto}`;
  const row = loadBanTable()[key];
  if (!row) throw new Error(`banTable: key not found: ${key}`);
  return row;
}
