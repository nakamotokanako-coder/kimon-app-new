import { describe, it, expect } from 'vitest';
import { buildHourBoard } from '../src/kimon/buildHourBoard.js';

describe('buildHourBoard: 2026-05-09 0:00 (陽4局壬子)', () => {
  const board = buildHourBoard({ date: '2026-05-09', hour: 0 });

  it('meta が期待値と一致', () => {
    expect(board.meta).toEqual({
      date: '2026-05-09',
      hour: 0,
      eto_day: '癸未',
      eto_time: '壬子',
      time_kyokusu: '陽4局',
      junshu: '壬',
      tenban_junshu_p: '艮',
      chiban_junshu_p: '艮',
      chokufu: '天任',
      chokushi: '生門',
      kuubou: '寅卯',
    });
  });

  it('palaces.kan が仕様書記載値と一致', () => {
    expect(board.palaces.kan).toEqual({
      tenban: '丁',
      chiban: '丁',
      kyusei: '天蓬',
      hasshin: '九天',
      hachimon: '杜門',
    });
  });

  it('palaces.gon が仕様書記載値と一致', () => {
    expect(board.palaces.gon).toEqual({
      tenban: '壬',
      chiban: '壬',
      kyusei: '天任',
      hasshin: '直符',
      hachimon: '景門',
    });
  });

  it('全8宮が chito_v2.csv の値と完全一致', () => {
    expect(board.palaces).toEqual({
      kan:  { tenban: '丁',   chiban: '丁',   kyusei: '天蓬', hasshin: '九天', hachimon: '杜門' },
      gon:  { tenban: '壬',   chiban: '壬',   kyusei: '天任', hasshin: '直符', hachimon: '景門' },
      shin: { tenban: '乙',   chiban: '乙',   kyusei: '天冲', hasshin: '螣蛇', hachimon: '死門' },
      son:  { tenban: '戊',   chiban: '戊',   kyusei: '天輔', hasshin: '太陰', hachimon: '驚門' },
      ri:   { tenban: '癸',   chiban: '癸',   kyusei: '天英', hasshin: '六合', hachimon: '開門' },
      kun:  { tenban: '丙己', chiban: '丙己', kyusei: '天芮', hasshin: '勾陳', hachimon: '休門' },
      da:   { tenban: '辛',   chiban: '辛',   kyusei: '天柱', hasshin: '朱雀', hachimon: '生門' },
      ken:  { tenban: '庚',   chiban: '庚',   kyusei: '天心', hasshin: '九地', hachimon: '傷門' },
    });
  });

  it('中宮は含まれない（8宮のみ）', () => {
    expect(Object.keys(board.palaces).sort()).toEqual(
      ['da', 'gon', 'kan', 'ken', 'kun', 'ri', 'shin', 'son'],
    );
  });
});

describe('buildHourBoard: 2025-12-05 0:00 (陰2局壬子)', () => {
  const board = buildHourBoard({ date: '2025-12-05', hour: 0 });

  it('meta が期待値と一致', () => {
    expect(board.meta).toEqual({
      date: '2025-12-05',
      hour: 0,
      eto_day: '戊申',
      eto_time: '壬子',
      time_kyokusu: '陰2局',
      junshu: '壬',
      tenban_junshu_p: '兌',
      chiban_junshu_p: '兌',
      chokufu: '天柱',
      chokushi: '驚門',
      kuubou: '寅卯',
    });
  });

  it('全8宮が chito_v2.csv (陰2局壬子) の値と完全一致', () => {
    expect(board.palaces).toEqual({
      kan:  { tenban: '己',   chiban: '己',   kyusei: '天蓬', hasshin: '九地', hachimon: '死門' },
      gon:  { tenban: '辛',   chiban: '辛',   kyusei: '天任', hasshin: '朱雀', hachimon: '驚門' },
      shin: { tenban: '乙',   chiban: '乙',   kyusei: '天冲', hasshin: '勾陳', hachimon: '開門' },
      son:  { tenban: '丙',   chiban: '丙',   kyusei: '天輔', hasshin: '六合', hachimon: '休門' },
      ri:   { tenban: '庚',   chiban: '庚',   kyusei: '天英', hasshin: '太陰', hachimon: '生門' },
      kun:  { tenban: '戊丁', chiban: '戊丁', kyusei: '天芮', hasshin: '螣蛇', hachimon: '傷門' },
      da:   { tenban: '壬',   chiban: '壬',   kyusei: '天柱', hasshin: '直符', hachimon: '杜門' },
      ken:  { tenban: '癸',   chiban: '癸',   kyusei: '天心', hasshin: '九天', hachimon: '景門' },
    });
  });
});
