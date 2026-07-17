import { describe, it, expect } from 'vitest';
import { buildBoard } from '../src/kimon/buildBoard.js';
import { lookupDayKyokusu, dayKyokusuRange } from '../src/kimon/loadDayKyokusu.js';

describe('buildBoard: 2026-01-01 日盤 (新 day_kyokusu.csv: 陽3局乙亥)', () => {
  const board = buildBoard({ date: '2026-01-01', boardType: '日' });

  it('局数は day_kyokusu.csv 由来（陽3局）、干支は koyomi の eto_day（乙亥）', () => {
    expect(board.meta.kyokusu).toBe('陽3局');
    expect(board.meta.eto).toBe('乙亥');
  });

  it('旬首=己, 直符=天輔, 直使=杜門 (陽3局乙亥)', () => {
    expect(board.meta.junshu).toBe('己');
    expect(board.meta.chokufu).toBe('天輔');
    expect(board.meta.chokushi).toBe('杜門');
  });

  it('全8宮が chito_v2.csv (陽3局乙亥) と完全一致', () => {
    expect(board.palaces).toEqual({
      kan:  { tenban: '壬',   chiban: '丙',   kyusei: '天柱', hasshin: '六合', hachimon: '驚門' },
      gon:  { tenban: '辛',   chiban: '癸',   kyusei: '天心', hasshin: '勾陳', hachimon: '開門' },
      shin: { tenban: '丙',   chiban: '戊',   kyusei: '天蓬', hasshin: '朱雀', hachimon: '休門' },
      son:  { tenban: '癸',   chiban: '己',   kyusei: '天任', hasshin: '九地', hachimon: '生門' },
      ri:   { tenban: '戊',   chiban: '丁',   kyusei: '天冲', hasshin: '九天', hachimon: '傷門' },
      kun:  { tenban: '己',   chiban: '乙庚', kyusei: '天輔', hasshin: '直符', hachimon: '杜門' },
      da:   { tenban: '丁',   chiban: '壬',   kyusei: '天英', hasshin: '螣蛇', hachimon: '景門' },
      ken:  { tenban: '乙庚', chiban: '辛',   kyusei: '天芮', hasshin: '太陰', hachimon: '死門' },
    });
  });
});

describe('buildBoard: 2026-06-21 日盤 (陰陽切替日: 夏至 → 陰7局丙寅)', () => {
  const board = buildBoard({ date: '2026-06-21', boardType: '日' });

  it('夏至で陽→陰に切替わり 陰7局、eto_day=丙寅', () => {
    expect(board.meta.kyokusu).toBe('陰7局');
    expect(board.meta.eto).toBe('丙寅');
  });
});

describe('buildBoard: 日盤 範囲外日付は明示エラー', () => {
  const RANGE_MSG = /日盤は2026-01-01〜2044-01-31の期間のみ鑑定できます/;

  // 2026-01-01 より前は koyomi には存在するが day_kyokusu には無い → 日盤エラー
  it('2026-01-01 より前（2025-12-31）は日盤範囲エラー', () => {
    expect(() => buildBoard({ date: '2025-12-31', boardType: '日' }))
      .toThrow(RANGE_MSG);
  });

  it('エラーメッセージに指定日が含まれる', () => {
    expect(() => buildBoard({ date: '2025-12-31', boardType: '日' }))
      .toThrow(/指定日: 2025-12-31/);
  });

  // 注: 上限 2044-01-31 より後は koyomi_v3.csv 自体が 2044-01-31 までのため、
  //     buildBoard では koyomi 側のエラーが先に出る。day_kyokusu 単体の
  //     上限境界は loadDayKyokusu のユニットテストで検証する。
});

describe('lookupDayKyokusu: ローダー単体（範囲・境界）', () => {
  const RANGE_MSG = /日盤は2026-01-01〜2044-01-31の期間のみ鑑定できます/;

  it('境界内: 2026-01-01=陽3局, 2044-01-31=陽7局', () => {
    expect(lookupDayKyokusu('2026-01-01')).toBe('陽3局');
    expect(lookupDayKyokusu('2044-01-31')).toBe('陽7局');
  });

  it('下限の外（2025-12-31）はエラー', () => {
    expect(() => lookupDayKyokusu('2025-12-31')).toThrow(RANGE_MSG);
  });

  it('上限の外（2044-02-01）はエラー', () => {
    expect(() => lookupDayKyokusu('2044-02-01')).toThrow(RANGE_MSG);
  });

  it('対応期間は 2026-01-01〜2044-01-31', () => {
    expect(dayKyokusuRange()).toEqual({ min: '2026-01-01', max: '2044-01-31' });
  });
});

describe('buildBoard: 2025-12-05 0:00 時盤 (陰2局壬子)', () => {
  const board = buildBoard({ date: '2025-12-05', hour: 0, boardType: '時' });

  it('キー組立 = time_kyokusu + 五鼠遁時干支', () => {
    expect(board.meta.kyokusu).toBe('陰2局');
    expect(board.meta.eto).toBe('壬子');
    expect(board.meta.time_kyokusu).toBe('陰2局');
    expect(board.meta.eto_time).toBe('壬子');
  });

  it('時盤の chokufu/chokushi は陰2局壬子', () => {
    expect(board.meta.chokufu).toBe('天柱');
    expect(board.meta.chokushi).toBe('驚門');
  });
});

describe('buildBoard: バリデーション', () => {
  it("boardType='時' で hour 未指定はエラー", () => {
    expect(() => buildBoard({ date: '2025-12-05', boardType: '時' })).toThrow(/hour/);
  });
  // 年盤・月盤対応（feat-year-month-kyokusu）: '年'/'月' はエラーではなく
  // 正常に盤を返すようになった。詳細は test/yearMonthBoard.test.js を参照。
  it('boardType は "日" "時" "年" "月" 以外を受け付けない', () => {
    expect(() => buildBoard({ date: '2025-12-05', boardType: 'X' }))
      .toThrow('boardType は "日" "時" "年" "月" のみ');
  });

  it('boardType="年"/"月" は例外を投げず盤を返す', () => {
    expect(() => buildBoard({ date: '2025-12-05', boardType: '年' })).not.toThrow();
    expect(() => buildBoard({ date: '2025-12-05', boardType: '月' })).not.toThrow();
  });
});
