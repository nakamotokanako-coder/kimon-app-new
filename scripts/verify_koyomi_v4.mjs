// 検証ハーネス: エンジンを充足済みデータ(2003-2019 + 2000-2002)で答え合わせ。
import fs from 'node:fs';
import {
  simulateKyuseiInton, reconstructSekkiFromKyokusu, reconstructSekkiFromAstro,
  kyokusuOf, solarTermsForYear, SEKKI_ORDER,
} from './lib/koyomi_engine.mjs';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
const parse = (txt) => { const L = txt.trim().split(/\r?\n/); const h = L[0].split(','); return L.slice(1).map((l) => { const c = l.split(','); const o = {}; h.forEach((k, i) => (o[k] = c[i] ?? '')); return o; }); };
const v3 = parse(read('data/koyomi_v3.csv'));

const termsByYear = new Map();
for (let y = 1899; y <= 2045; y++) termsByYear.set(y, solarTermsForYear(y));
const astroSekkiAt = (date) => {
  const all = [];
  for (const [, t] of termsByYear) for (const x of t) all.push(x);
  all.sort((a, b) => (a.date < b.date ? -1 : 1));
  let cur = null; for (const t of all) { if (t.date <= date) cur = t.name; else break; } return cur;
};

function rangeRows(lo, hi) { return v3.filter((r) => r.date >= lo && r.date <= hi); }

// ---- 1. 日家九星 + inton (2000-2019 充足) ----
{
  const dates = v3.map((r) => r.date);
  const sim = simulateKyuseiInton(dates);
  let nK = 0, mK = 0, nI = 0, mI = 0; const exK = [], exI = [];
  for (const r of v3) {
    if (r.date < '2000-01-08' || r.date > '2019-12-31') continue;
    const s = sim.get(r.date); if (!s) continue;
    if (r.kyusei_day) { nK++; if (s.kyusei_day !== r.kyusei_day) { mK++; if (exK.length < 8) exK.push(`${r.date} sim=${s.kyusei_day} real=${r.kyusei_day}`); } }
    if (r.inton_youton) { nI++; if (s.inton_youton !== r.inton_youton) { mI++; if (exI.length < 8) exI.push(`${r.date} sim=${s.inton_youton} real=${r.inton_youton}`); } }
  }
  console.log(`[1] 日家九星: n=${nK} mismatch=${mK}`, exK);
  console.log(`    inton    : n=${nI} mismatch=${mI}`, exI);
}

// ---- 2. sekki24 復元 from time_kyokusu (2003-2019 充足) ----
{
  const rows = rangeRows('2003-01-01', '2019-12-31').map((r) => ({ date: r.date, sangen: r.sangen, time_kyokusu: r.time_kyokusu }));
  const { map, issues } = reconstructSekkiFromKyokusu(rows, astroSekkiAt);
  let n = 0, m = 0; const ex = [];
  for (const r of rangeRows('2003-01-01', '2019-12-31')) {
    if (!r.sekki24) continue; n++;
    const got = map.get(r.date);
    if (got !== r.sekki24) { m++; if (ex.length < 12) ex.push(`${r.date} got=${got} real=${r.sekki24} kyok=${r.time_kyokusu} sangen=${r.sangen}`); }
  }
  console.log(`[2] sekki24(from kyokusu): n=${n} mismatch=${m} issues=${issues.length}`, ex);
  if (issues.length) console.log('    issues:', issues.slice(0, 6));
}

// ---- 3. time_kyokusu = tableB(sekki24, sangen) 整合（2003-2019 実sekki使用）----
{
  let n = 0, m = 0; const ex = [];
  for (const r of rangeRows('2003-01-01', '2019-12-31')) {
    if (!r.sekki24 || !r.sangen || !r.time_kyokusu) continue; n++;
    const k = kyokusuOf(r.sekki24, r.sangen);
    if (k !== r.time_kyokusu) { m++; if (ex.length < 8) ex.push(`${r.date} tbl=${k} real=${r.time_kyokusu} (${r.sekki24}/${r.sangen})`); }
  }
  console.log(`[3] tableB(sekki,sangen)->time: n=${n} mismatch=${m}`, ex);
}

// ---- 4. sekki24 復元 from astro+sangen (time_kyokusu無し想定) を 2003-2019 で答え合わせ ----
{
  const rows = rangeRows('2003-01-01', '2019-12-31').map((r) => ({ date: r.date, sangen: r.sangen }));
  const { map } = reconstructSekkiFromAstro(rows, termsByYear);
  let n = 0, m = 0; const ex = [];
  for (const r of rangeRows('2003-01-01', '2019-12-31')) {
    if (!r.sekki24) continue; n++;
    const got = map.get(r.date);
    if (got !== r.sekki24) { m++; if (ex.length < 12) ex.push(`${r.date} got=${got} real=${r.sekki24} sangen=${r.sangen}`); }
  }
  console.log(`[4] sekki24(from astro+sangen): n=${n} mismatch=${m}`, ex);
}
