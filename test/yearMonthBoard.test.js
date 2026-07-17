import { describe, it, expect } from 'vitest';
import { buildBoard } from '../src/kimon/buildBoard.js';
import testCase from '../test_case_2025-12-05.json';

// 宮番号(洛書)↔宮名(kan/gon/...)対応表。src/kimon/・盤画面のいずれにも
// 既存の数値マッピングが見当たらなかった（§2着手前に確認済み・ぶりちゃん
// 承認済み）ため、test_case 自身の palace_name_jp（数値→日本語宮名）と、
// src/components/BoardGrid.jsx の PALACE_DISPLAY で使われている日本語ラベル
// を突き合わせてこのテスト専用に新設する。中宮(5)は8宮に含まれないため対象外。
const JP_LABEL_TO_PALACE_KEY = {
  '坎': 'kan',
  '艮': 'gon',
  '震': 'shin',
  '巽': 'son',
  '離': 'ri',
  '坤': 'kun',
  '兌': 'da',
  '乾': 'ken',
};

// test_case の要素名 → buildBoard() の board.palaces[key] の要素名。
// buildBoard.js の palaces セルは tenban/chiban/kyusei/hasshin/hachimon の
// 5要素のみを持つ（shisei・kikkyo は含まれない。九星表示名・吉凶判定は
// このモジュールが生成する範囲外のため、shisei/kikkyo は突合対象から除く）。
const FIELD_MAP = {
  tenban_kan: 'tenban',
  chiban_kan: 'chiban',
  tenban_star: 'kyusei',
  hasshin: 'hasshin',
  hachimon: 'hachimon',
};

// §2実装中に判明した、chito_v2_with_kakkyoku.csv 側の既知の差異
// （kyokusu決定ロジックの追加とは無関係。ぶりちゃん確認済み・2026-07-17）。
//   ① 旬首宮の干支合成表示: chito_v2 は中宮の寄干を host 宮の1セルに合成
//      表示する（例 "癸庚"）が、先生Excelは中宮(5番)と host宮を分けて記載
//      する。既存の日盤テストにも同じ合成表示パターンが存在する
//      （buildBoard.test.js の kun.chiban="乙庚" 等）。無害な表記慣習のため
//      引き続き突合から除外する。
//   ② 星の異体字: chito_v2 は「天冲」で統一（全1080行中1080件、他表記なし）、
//      先生Excelは「天衝」。データ全体の表記揺れで、今回の実装とは無関係。
//      引き続き突合から除外する。
//   ③【修正済み・fix-chito-inyo7-hachimon】chito_v2.csv / chito_v2_with_kakkyoku.csv
//      の "陰7局丁亥" 行で、hachimon列8宮すべてが対冲宮（洛書の和10ペア:
//      1↔9, 2↔8, 3↔7, 4↔6）で入れ替わっていたデータ側の誤りを修正した。
//      test_case_2025-12-05.json との突合で正しい値を確定済み。
//      以前はここでxfail的に除外していたが、修正後は通常のアサーションに戻す。
const KNOWN_DATA_ISSUES = {
  年盤: new Set(['2:chiban', '8:kyusei', '9:tenban']), // ①②
  月盤: new Set(['1:tenban', '2:chiban', '2:kyusei']), // ①②（③は修正済みのため除外リストから削除）
};

function assertBoardMatchesTestCase(board, testCaseBoard, boardLabel) {
  const knownIssues = KNOWN_DATA_ISSUES[boardLabel] || new Set();
  for (const [numberKey, expected] of Object.entries(testCaseBoard)) {
    if (numberKey === '5') continue; // 中宮はPALACESの8宮に含まれない
    const label = testCase.palace_name_jp[numberKey];
    const palaceKey = JP_LABEL_TO_PALACE_KEY[label];
    const actual = board.palaces[palaceKey];
    for (const [testField, boardField] of Object.entries(FIELD_MAP)) {
      if (knownIssues.has(`${numberKey}:${boardField}`)) continue; // 既知の差異(上記コメント参照)
      expect(
        actual[boardField],
        `宮#${numberKey}(${label}/${palaceKey}).${boardField} (test_case.${testField})`,
      ).toBe(expected[testField]);
    }
  }
}

describe('buildBoard: 年盤 2025-12-05 (test_case_2025-12-05.json)', () => {
  const board = buildBoard({ date: '2025-12-05', boardType: '年' });

  it('局数・干支が test_case と一致', () => {
    expect(board.meta.kyokusu).toBe('陰7局');
    expect(board.meta.eto).toBe('乙巳');
  });

  it('全8宮が test_case.boards.年盤 と一致（既知の差異①②を除く）', () => {
    assertBoardMatchesTestCase(board, testCase.boards.年盤, '年盤');
  });
});

describe('buildBoard: 月盤 2025-12-05 (test_case_2025-12-05.json)', () => {
  const board = buildBoard({ date: '2025-12-05', boardType: '月' });

  it('局数・干支が test_case と一致', () => {
    expect(board.meta.kyokusu).toBe('陰7局');
    expect(board.meta.eto).toBe('丁亥');
  });

  it('全8宮が test_case.boards.月盤 と一致（既知の差異①②を除く。③はfix-chito-inyo7-hachimonで修正済み）', () => {
    assertBoardMatchesTestCase(board, testCase.boards.月盤, '月盤');
  });
});

describe('buildBoard: 年盤・月盤 立春境界（実効年の算出）', () => {
  it('1984-02-04（立春当日・eto_year切替前）は中元(陰4局)のまま', () => {
    const board = buildBoard({ date: '1984-02-04', boardType: '年' });
    expect(board.meta.kyokusu).toBe('陰4局');
  });

  it('1984-02-05（eto_year切替後）は下元(陰7局)に切り替わる', () => {
    const board = buildBoard({ date: '1984-02-05', boardType: '年' });
    expect(board.meta.kyokusu).toBe('陰7局');
  });

  it('2044-01-31（データ最終日・立春前）は下元(陰7局)のまま範囲外エラーにならない', () => {
    const board = buildBoard({ date: '2044-01-31', boardType: '年' });
    expect(board.meta.kyokusu).toBe('陰7局');
  });
});
