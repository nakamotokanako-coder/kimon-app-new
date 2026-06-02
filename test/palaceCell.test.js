// test/palaceCell.test.js
// Phase 2D 要件1 (表示順) と 要件2 (外枠色統一) のテスト

import { describe, it, expect } from 'vitest';
import { buildInfoItems, sortPalaceShoui } from '../src/components/palaceCellHelpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// styles.css?raw だと Vite が CSS パイプライン経由で空文字列を返すため
// fs で直接ファイル内容を取得する。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssText = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'styles.css'),
  'utf-8'
);

// ============================================================
// 要件1: セル内象意の優先順位・重複排除・4件制限
// ============================================================

describe('sortPalaceShoui: 先生確定の優先順位', () => {
  it('priority_order 通りに並ぶ', () => {
    const jukkan = [
      { name: '金華水流', kikkyo: '〇' },
    ];
    const kakkyoku = [
      { name: '伏宮格', kichi_kyo: 'kyo', score: -10 },
    ];
    expect(sortPalaceShoui(jukkan, kakkyoku).map((item) => item.name)).toEqual([
      '金華水流',
      '伏宮格',
    ]);
  });

  it('同名は重複排除し、先に来る十干剋応側を残す', () => {
    const items = sortPalaceShoui(
      [{ name: '青龍返首', kikkyo: '〇', tenban: '戊', chiban: '丙' }],
      [{ name: '青龍返首', kichi_kyo: 'kichi', score: 10 }],
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'jukkan', name: '青龍返首' });
  });

  it('リスト外の象意は priority_order の後ろに来る', () => {
    expect(sortPalaceShoui(
      [{ name: 'リスト外', kikkyo: '×' }],
      [{ name: '龍遁', kichi_kyo: 'kichi', score: 10 }],
    ).map((item) => item.name)).toEqual([
      '龍遁',
      'リスト外',
    ]);
  });

  it('リスト外同士は絶対値降順、同値なら凶を中立より先に並べる', () => {
    expect(sortPalaceShoui(
      [
        { name: '中立', kikkyo: '△' },
        { name: '凶10', kikkyo: '×' },
      ],
      [
        { name: '凶20', kichi_kyo: 'kyo', score: -20 },
      ],
    ).map((item) => item.name)).toEqual([
      '凶20',
      '凶10',
      '中立',
    ]);
  });
});

describe('buildInfoItems: 上位4件と +N 表示', () => {
  it('5件以上は上位4件と残数を返す', () => {
    const items = buildInfoItems([
      { name: '青龍返首', kikkyo: '〇' },
      { name: '飛鳥跌穴', kikkyo: '〇' },
      { name: '青龍逃走', kikkyo: '×' },
      { name: '焚入太白', kikkyo: '×' },
      { name: '朱雀投江', kikkyo: '×' },
      { name: '太白入熒', kikkyo: '×' },
      { name: '官符刑格', kikkyo: '×' },
    ], []);
    expect(items).toHaveLength(5);
    expect(items.slice(0, 4).map((item) => item.name)).toEqual([
      '青龍返首',
      '飛鳥跌穴',
      '青龍逃走',
      '焚入太白',
    ]);
    expect(items[4]).toEqual({ kind: 'overflow', count: 3 });
  });

  it('4件以下なら +N を返さない', () => {
    const items = buildInfoItems([
      { name: '青龍返首', kikkyo: '〇' },
    ], [
      { name: '天遁', kichi_kyo: 'kichi', score: 10 },
    ]);
    expect(items).toHaveLength(2);
    expect(items.some((item) => item.kind === 'overflow')).toBe(false);
  });

  it('null/undefined でも空配列を返す', () => {
    expect(buildInfoItems(null, null)).toEqual([]);
    expect(buildInfoItems(undefined, undefined)).toEqual([]);
  });
});

// ============================================================
// 要件2: 外枠色の統一（status-based 差分 border-color を撤去）
// ============================================================

describe('外枠色の統一（border-color 差分なし）', () => {
  /** 指定セレクタの最初の {} ブロック中身を返す（簡易パーサ） */
  function ruleBody(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`);
    const m = cssText.match(re);
    return m ? m[1] : null;
  }

  it('.cell-usable に border-color が設定されていない', () => {
    const body = ruleBody('.cell-usable');
    expect(body).not.toBeNull();
    expect(body).not.toMatch(/border-color\s*:/);
  });

  it('.cell-has-kyo に border-color が設定されていない（rule 自体無くてもOK）', () => {
    const body = ruleBody('.cell-has-kyo');
    if (body !== null) {
      expect(body).not.toMatch(/border-color\s*:/);
    }
    // body が null なら rule 自体が削除されていて、border-color も付与され得ない → OK
  });

  it('.cell（基本宮セル）の border-color が --border-main 系を使用', () => {
    const body = ruleBody('.cell');
    expect(body).not.toBeNull();
    expect(body).toMatch(/border\s*:[^;]*var\(--border-main\)/);
  });
});

// ============================================================
// 要件: 旬首マーカーの 3 カラム固定幅スロット構造
// 括弧の有無にかかわらず干文字の中心 X 位置が一致することを担保する
// ============================================================

describe('旬首マーカー: 固定幅スロット構造', () => {
  function ruleBody(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`);
    const m = cssText.match(re);
    return m ? m[1] : null;
  }

  it('.kan-char に固定幅 (width: 1em) が設定されている', () => {
    const body = ruleBody('.kan-char');
    expect(body).not.toBeNull();
    expect(body).toMatch(/width\s*:\s*1em\b/);
    expect(body).toMatch(/text-align\s*:\s*center/);
  });

  it('.kan-bracket に固定幅 (width: 0.5em) が設定されている（空でも幅を保つ）', () => {
    const body = ruleBody('.kan-bracket');
    expect(body).not.toBeNull();
    expect(body).toMatch(/width\s*:\s*0\.5em\b/);
    expect(body).toMatch(/text-align\s*:\s*center/);
  });

  it('.kan-bracket は通常の干より小さく薄い装飾（font-size < 1em, opacity < 1）', () => {
    const body = ruleBody('.kan-bracket');
    expect(body).not.toBeNull();
    const fontSizeMatch = body.match(/font-size\s*:\s*([\d.]+)em/);
    expect(fontSizeMatch).not.toBeNull();
    expect(parseFloat(fontSizeMatch[1])).toBeLessThan(1);
    const opacityMatch = body.match(/opacity\s*:\s*([\d.]+)/);
    expect(opacityMatch).not.toBeNull();
    expect(parseFloat(opacityMatch[1])).toBeLessThan(1);
  });

  it('.kan-slot は inline-flex / align-items center で 3 子要素を整列', () => {
    const body = ruleBody('.kan-slot');
    expect(body).not.toBeNull();
    expect(body).toMatch(/display\s*:\s*inline-flex/);
    expect(body).toMatch(/align-items\s*:\s*center/);
  });

  it('旧 .is-junshu::before / ::after の擬似要素ルールは撤去されている', () => {
    // 3 カラム構造に移行したため、擬似要素を使った括弧描画は無いはず
    expect(cssText).not.toMatch(/\.is-junshu::before/);
    expect(cssText).not.toMatch(/\.is-junshu::after/);
  });
});

// ============================================================
// コンテンツ駆動レイアウト (Phase 2D-followup3 2026-05-21)
// 八門・剋応・格局など全コンテンツが切れずに表示されることを担保
// ============================================================

describe('コンテンツ駆動レイアウト', () => {
  // ルール本体からコメントを除いた文字列を返す（コメント内記述を誤マッチしないため）
  function ruleBody(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`);
    const m = cssText.match(re);
    if (!m) return null;
    return m[1].replace(/\/\*[\s\S]*?\*\//g, '');
  }

  it('.cell に min-height があり、固定 height は無い（コンテンツに応じて伸びる）', () => {
    const body = ruleBody('.cell');
    expect(body).not.toBeNull();
    expect(body).toMatch(/min-height\s*:/);
    // 固定 height / aspect-ratio は撤去済
    expect(body).not.toMatch(/^\s*height\s*:/m);
    expect(body).not.toMatch(/aspect-ratio\s*:/);
  });

  it('.cell に overflow: hidden がない（コンテンツ切れを防止）', () => {
    const body = ruleBody('.cell');
    expect(body).not.toBeNull();
    // overflow: hidden は完全撤去
    expect(body).not.toMatch(/overflow\s*:\s*hidden/);
  });

  it('.info-list にスクロール設定がない（外側でセル全体が伸びる方針）', () => {
    const body = ruleBody('.info-list');
    expect(body).not.toBeNull();
    expect(body).not.toMatch(/overflow-y\s*:\s*auto/);
    expect(body).not.toMatch(/flex\s*:\s*1\s+1\s+0/);
  });

  it('.board-grid の grid-template-rows は固定値ではなく auto ベース', () => {
    const body = ruleBody('.board-grid');
    expect(body).not.toBeNull();
    // grid-template-rows に --cell-h や固定px が無く、auto を使用
    const rowsMatch = body.match(/grid-template-rows\s*:\s*([^;]+)/);
    expect(rowsMatch).not.toBeNull();
    expect(rowsMatch[1]).toMatch(/auto/);
    expect(rowsMatch[1]).not.toMatch(/--cell-h|var\(--cell-h\)/);
  });
});
