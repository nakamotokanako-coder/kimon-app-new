// test/palaceCell.test.js
// Phase 2D 要件1 (表示順) と 要件2 (外枠色統一) のテスト

import { describe, it, expect } from 'vitest';
import { buildInfoItems } from '../src/components/palaceCellHelpers.js';
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
// 要件1: セル内表示順の統一（上=十干剋応, 下=格局）
// ============================================================

describe('buildInfoItems: 十干剋応(上) → 格局(下) の固定順', () => {
  it('jukkan が kakkyoku より先に並ぶ', () => {
    const jukkan = [
      { name: '官符刑格', kikkyo: '×', tenban: '庚', chiban: '己' },
    ];
    const kakkyoku = [
      { name: '刑格', kichi_kyo: 'kyo', score: -10 },
    ];
    const items = buildInfoItems(jukkan, kakkyoku);
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('jukkan');
    expect(items[0].name).toBe('官符刑格');
    expect(items[1].kind).toBe('kakkyoku');
    expect(items[1].name).toBe('刑格');
  });

  it('複数 jukkan + 複数 kakkyoku でも順序維持（全 jukkan が全 kakkyoku より前）', () => {
    const jukkan = [
      { name: '日格', kikkyo: '×' },
      { name: '伏干', kikkyo: '△' },
    ];
    const kakkyoku = [
      { name: '人遁吉格', kichi_kyo: 'kichi' },
      { name: '朱雀入墓', kichi_kyo: 'kyo' },
    ];
    const items = buildInfoItems(jukkan, kakkyoku);
    expect(items.map((x) => x.kind)).toEqual([
      'jukkan', 'jukkan', 'kakkyoku', 'kakkyoku',
    ]);
  });

  it('片方が空配列でも問題なく動く', () => {
    expect(buildInfoItems([], [{ name: 'A', kichi_kyo: 'kichi' }])).toEqual([
      { kind: 'kakkyoku', name: 'A', kichi_kyo: 'kichi' },
    ]);
    expect(buildInfoItems([{ name: 'B', kikkyo: '×' }], [])).toEqual([
      { kind: 'jukkan', name: 'B', kikkyo: '×' },
    ]);
  });

  it('両方 null/undefined でも空配列を返す', () => {
    expect(buildInfoItems(null, null)).toEqual([]);
    expect(buildInfoItems(undefined, undefined)).toEqual([]);
  });

  it('Phase 2A の坤宮 4 パターン例（2026-01-02 旬首=己 想定）', () => {
    // 丙×丙, 丙×己, 己×丙, 己×己 の 4 パターン + 格局 1 件
    const jukkan = [
      { name: '月奇孛師', kikkyo: '×' },
      { name: '太孛入刑', kikkyo: '△' },
      { name: '火孛地戸', kikkyo: '×' },
      { name: '地戸蓬鬼', kikkyo: '×' },
    ];
    const kakkyoku = [
      { name: '六儀撃刑格', kichi_kyo: 'kyo' },
    ];
    const items = buildInfoItems(jukkan, kakkyoku);
    expect(items).toHaveLength(5);
    expect(items.slice(0, 4).every((x) => x.kind === 'jukkan')).toBe(true);
    expect(items[4].kind).toBe('kakkyoku');
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
