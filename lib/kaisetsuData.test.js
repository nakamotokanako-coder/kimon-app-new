import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPalaces, loadKaisetsu } from './kaisetsuData.js';

const KNOWN_KEY = '陰1局丁卯';
const PALACES = ['kan', 'gon', 'shin', 'son', 'ri', 'kun', 'da', 'ken'];
const AXES = ['goen', 'shigoto', 'kinun', 'kenko', 'benkyo'];
const RANK_SYMBOLS = ['◎', '○', '△', '▲', '×'];

const ROOT = new URL('..', import.meta.url);
const DATA_PATH = fileURLToPath(new URL('data/kaisetsu/generated/kaisetsu_text_v2.json', ROOT));

describe('buildPalaces axisRanks（PR-2: /api/kaisetsu-full 配線）', () => {
  beforeAll(() => {
    if (!existsSync(DATA_PATH)) {
      execFileSync('node', ['scripts/build_kaisetsu_text.mjs'], {
        cwd: fileURLToPath(ROOT),
        stdio: 'ignore',
      });
    }
  });

  it('paid=true では各宮に axisRanks（5軸ぶんのランク記号）が含まれる', () => {
    const { data } = loadKaisetsu();
    const board = data[KNOWN_KEY];
    const palaces = buildPalaces(board, { paid: true });
    for (const palace of PALACES) {
      expect(palaces[palace].axisRanks).toBeTruthy();
      for (const axis of AXES) {
        expect(RANK_SYMBOLS).toContain(palaces[palace].axisRanks[axis]);
      }
    }
  });

  it('paid=false（既定・/api/kaisetsu 相当）では axisRanks を含まず、各セルは short のみのまま', () => {
    const { data } = loadKaisetsu();
    const board = data[KNOWN_KEY];
    const palaces = buildPalaces(board);
    for (const palace of PALACES) {
      expect(palaces[palace].axisRanks).toBeUndefined();
      for (const axis of AXES) {
        expect(Object.keys(palaces[palace][axis])).toEqual(['short']);
      }
    }
  });
});
