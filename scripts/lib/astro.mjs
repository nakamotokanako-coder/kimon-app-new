// 太陽黄経にもとづく二十四節気の計算（Jean Meeus「天文計算」簡易版）。
// 精度: 視黄経 ~0.01度、節入時刻 ~分オーダー。JST(UTC+9)で日付を返す。
// 用途: (1) 超神接神アンカー用の冬至/夏至、(2) 1900-1921のsekki24補完、(3) 境界±1日フラグ。

const RAD = Math.PI / 180;

// ユリウス日（UT）
function toJD(year, month, day, hourUT = 0) {
  let y = year, m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day + hourUT / 24 + B - 1524.5
  );
}

// 太陽の視黄経（度, 0..360）。t = ユリウス世紀(J2000基準, TT)。
function sunApparentLongitude(jd) {
  // jd は UT。TT ≈ UT + ΔT。1900-2044 の ΔT は数十秒〜2分程度で節気判定に十分小さい範囲だが、
  // 近似式で補正しておく。
  const T = (jd - 2451545.0) / 36525.0;
  const dt = deltaTseconds(jd) / 86400.0;
  const Tt = ((jd + dt) - 2451545.0) / 36525.0;
  const L0 = 280.46646 + 36000.76983 * Tt + 0.0003032 * Tt * Tt;
  const M = 357.52911 + 35999.05029 * Tt - 0.0001537 * Tt * Tt;
  const Mr = M * RAD;
  const C =
    (1.914602 - 0.004817 * Tt - 0.000014 * Tt * Tt) * Math.sin(Mr) +
    (0.019993 - 0.000101 * Tt) * Math.sin(2 * Mr) +
    0.000289 * Math.sin(3 * Mr);
  const trueLong = L0 + C;
  // 章動・光行差の簡易補正
  const omega = 125.04 - 1934.136 * Tt;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  return ((lambda % 360) + 360) % 360;
}

// ΔT 近似（秒）。1900-2050 用の簡易多項式（NASA/Espenak-Meeus）。
function deltaTseconds(jd) {
  const year = 2000 + (jd - 2451545.0) / 365.25;
  if (year >= 1900 && year < 1920) {
    const t = year - 1900;
    return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t * t * t - 0.000197 * t * t * t * t;
  }
  if (year >= 1920 && year < 1941) {
    const t = year - 1920;
    return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t * t * t;
  }
  if (year >= 1941 && year < 1961) {
    const t = year - 1950;
    return 29.07 + 0.407 * t - t * t / 233 + t * t * t / 2547;
  }
  if (year >= 1961 && year < 1986) {
    const t = year - 1975;
    return 45.45 + 1.067 * t - t * t / 260 - t * t * t / 718;
  }
  if (year >= 1986 && year < 2005) {
    const t = year - 2000;
    return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t * t * t + 0.000651814 * t * t * t * t + 0.00002373599 * t * t * t * t * t;
  }
  if (year >= 2005 && year < 2050) {
    const t = year - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t * t;
  }
  return 64; // フォールバック
}

// 指定の太陽黄経(度)に到達する瞬間のJD(UT)を二分法で求める。guessJD周辺を探索。
function solveLongitude(targetDeg, guessJD) {
  // 目標との差を -180..180 に正規化した関数の零点を探す
  const f = (jd) => {
    let d = sunApparentLongitude(jd) - targetDeg;
    d = ((d + 180) % 360 + 360) % 360 - 180;
    return d;
  };
  let lo = guessJD - 5, hi = guessJD + 5;
  let flo = f(lo), fhi = f(hi);
  // 区間に零点が無ければ広げる
  let tries = 0;
  while (flo * fhi > 0 && tries < 8) { lo -= 5; hi += 5; flo = f(lo); fhi = f(hi); tries++; }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

// 24節気の黄経（度）と名称。雨水(330)起点ではなく、ここでは黄経で対応付け。
// 春分=0,清明=15,... の順。名称は流派表記（啓蟄）に合わせる。
export const SOLAR_TERMS = [
  ['春分', 0], ['清明', 15], ['穀雨', 30], ['立夏', 45], ['小満', 60], ['芒種', 75],
  ['夏至', 90], ['小暑', 105], ['大暑', 120], ['立秋', 135], ['処暑', 150], ['白露', 165],
  ['秋分', 180], ['寒露', 195], ['霜降', 210], ['立冬', 225], ['小雪', 240], ['大雪', 255],
  ['冬至', 270], ['小寒', 285], ['大寒', 300], ['立春', 315], ['雨水', 330], ['啓蟄', 345],
];

// JST日付文字列(YYYY-MM-DD)とJD(UT)を返す。
function jdToJstDate(jd) {
  const jstJD = jd + 9 / 24; // UT->JST
  // JDからグレゴリオ暦
  const z = Math.floor(jstJD + 0.5);
  const f = jstJD + 0.5 - z;
  let A = z;
  if (z >= 2299161) { const alpha = Math.floor((z - 1867216.25) / 36524.25); A = z + 1 + alpha - Math.floor(alpha / 4); }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E) + f;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  const di = Math.floor(day);
  const frac = day - di;
  const hour = frac * 24;
  return { date: `${year}-${String(month).padStart(2, '0')}-${String(di).padStart(2, '0')}`, hourJst: hour, jd };
}

/**
 * 指定年の全24節気の節入を計算して返す。
 * @returns Array<{name, deg, date:'YYYY-MM-DD', hourJst, jd}>  date順
 */
export function solarTermsForYear(year) {
  const out = [];
  for (const [name, deg] of SOLAR_TERMS) {
    // その節気がだいたい起きる日を初期推定（春分3/20付近=黄経0）
    const approxDayOfYear = 79 + deg * 365.2422 / 360; // 春分≈3/20(79日目)
    const guess = toJD(year, 1, 1) + approxDayOfYear;
    const jd = solveLongitude(deg, guess);
    out.push({ name, deg, ...jdToJstDate(jd) });
  }
  // JST日付で並べ替え
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/** 冬至/夏至のJST日付を返す。 */
export function solstice(year, which /* '冬至'|'夏至' */) {
  const deg = which === '冬至' ? 270 : 90;
  const approxDayOfYear = 79 + deg * 365.2422 / 360;
  const guess = toJD(year, 1, 1) + approxDayOfYear;
  return jdToJstDate(solveLongitude(deg, guess));
}
