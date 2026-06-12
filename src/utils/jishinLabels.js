// 時辰ラベルと現在時辰判定。
//
// 既存ロジック（src/reverseDirection/reverseDirection.js）の TIME_SLOTS /
// getTimeSlotHour と同じ規約：
//   - ドロップダウン内部値 hour は [0,2,4,...,22] の偶数
//   - hour=H は 時辰 [H-1, H+1] を表し、hour=0 は 23-01時（子刻）を表す特例
//   - 23時台は子刻として hour=0 を返す

export const JISHIN_LABELS = {
  0:  '23-01時 (子)',
  2:  '01-03時 (丑)',
  4:  '03-05時 (寅)',
  6:  '05-07時 (卯)',
  8:  '07-09時 (辰)',
  10: '09-11時 (巳)',
  12: '11-13時 (午)',
  14: '13-15時 (未)',
  16: '15-17時 (申)',
  18: '17-19時 (酉)',
  20: '19-21時 (戌)',
  22: '21-23時 (亥)',
};

/** Date から JST基準の「時」(0-23) を返す。実行環境TZに依存しない。
 *  getBoardDate / getTodayJst と同じ +9hシフト→getUTCHours() 方式。 */
export function getJstHours(date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
}

/** Date から「現在の時辰スロット」の hour 値 (0,2,...,22) を返す。 */
export function getJishinSlotHour(date) {
  const hour = getJstHours(date);
  if (hour === 23) return 0;
  return Math.floor((hour + 1) / 2) * 2;
}

/** 端末の現在日 (JST, YYYY-MM-DD)。 */
export function getTodayJst(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}
