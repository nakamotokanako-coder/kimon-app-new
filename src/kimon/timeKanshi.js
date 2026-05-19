const KAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const SHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

export const JIAZI_60 = Array.from({ length: 60 }, (_, i) => KAN[i % 10] + SHI[i % 12]);

const ZIHOUR_START_INDEX = {
  甲: 0, 己: 0,
  乙: 12, 庚: 12,
  丙: 24, 辛: 24,
  丁: 36, 壬: 36,
  戊: 48, 癸: 48,
};

export function calcTimeKanshi(dayKan, hour) {
  const start = ZIHOUR_START_INDEX[dayKan];
  if (start === undefined) throw new Error(`unknown dayKan: ${dayKan}`);
  const hourIdx = Math.floor(hour / 2) % 12;
  return JIAZI_60[(start + hourIdx) % 60];
}
