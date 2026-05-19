// 流派データ表記とtest_case表記のゆらぎを正規化する。
// chito CSVは「天冲」、test_caseは「天衝」。出力は test_case 側に合わせる。

const STAR_ALIAS = {
  天冲: '天衝',
};

export function normalizeStar(name) {
  if (name == null) return name;
  return STAR_ALIAS[name] ?? name;
}

// koyomi の kyusei_(year|month|day) は短縮形（例：「七」）。
// kimon_tables.shisei_9pattern は フルネーム（例：「七赤金星」）がキー。
const KYUSEI_FULL = {
  一: '一白水星',
  二: '二黒土星',
  三: '三碧木星',
  四: '四緑木星',
  五: '五黄土星',
  六: '六白金星',
  七: '七赤金星',
  八: '八白土星',
  九: '九紫火星',
};

export function expandKyusei(short) {
  if (short == null) return short;
  // 既にフルネームならそのまま返す
  if (short.length >= 3) return short;
  return KYUSEI_FULL[short] ?? short;
}
