// time_kyokusu が無い区間(1900-1921)用の sekki24 復元。
// 方式: sangen の「上元ブロック」を、天文の冬至/夏至アンカーに合わせて
//       正準24節気へ割り当て。閏(節気の重複)は至点直前の節気を倍化して吸収。
import { SEKKI_ORDER, addDays, dayDiff } from './koyomi_engine.mjs';
import { solstice } from './astro.mjs';

// rows: [{date, sangen}] 昇順（連続日）
// 戻り: Map date -> sekki24
export function reconstructSekkiSolsticeWalk(rows, yearLo, yearHi) {
  // 1) 上元ブロックの開始日を列挙
  const blocks = []; // {start, idx(in rows)}
  let prev = null;
  rows.forEach((r, i) => {
    if (r.sangen === '上元' && prev !== '上元') blocks.push({ start: r.date, i });
    prev = r.sangen;
  });
  if (!blocks.length) return new Map();

  // 2) 至点(冬至/夏至)アンカー = 各至点に最も近い上元ブロック
  const solAnchors = []; // {date(block.start), which, blockIndex}
  for (let y = yearLo - 1; y <= yearHi + 1; y++) {
    for (const which of ['冬至', '夏至']) {
      const sol = solstice(y, which).date;
      let best = -1, bestOff = 99;
      for (let b = 0; b < blocks.length; b++) {
        const off = Math.abs(dayDiff(blocks[b].start, sol));
        if (off < bestOff) { bestOff = off; best = b; }
      }
      if (best >= 0 && bestOff <= 25) solAnchors.push({ blockIndex: best, which, sol });
    }
  }
  // 重複ブロックを除去（同じblockIndexに複数至点が付いたら近い方）
  const byBlock = new Map();
  for (const a of solAnchors) {
    if (!byBlock.has(a.blockIndex) || Math.abs(dayDiff(blocks[a.blockIndex].start, a.sol)) < Math.abs(dayDiff(blocks[byBlock.get(a.blockIndex).blockIndex].start, byBlock.get(a.blockIndex).sol))) byBlock.set(a.blockIndex, a);
  }
  const anchors = [...byBlock.values()].sort((x, y) => x.blockIndex - y.blockIndex);

  // 3) 各ブロックに節気を割り当て。アンカー間を正準順序で埋め、閏は至点直前で倍化。
  const blockSekki = new Array(blocks.length).fill(null);
  for (let a = 0; a < anchors.length; a++) {
    const cur = anchors[a];
    blockSekki[cur.blockIndex] = cur.which; // 冬至/夏至
    const next = anchors[a + 1];
    if (!next) continue;
    // cur(冬至 or 夏至)..next(夏至 or 冬至) の間: 半年=12節気のはず
    const span = next.blockIndex - cur.blockIndex; // ブロック数
    const startSekkiIdx = SEKKI_ORDER.indexOf(cur.which);
    // 期待節気列: cur.which から next.which の手前まで（12個）
    const half = []; // 半年の節気12個
    for (let k = 0; k < 12; k++) half.push(SEKKI_ORDER[(startSekkiIdx + k) % 24]);
    // span 個のブロックに 12 節気を割当。span==12 通常, span==13 で閏(1個倍化)。
    const extra = span - 12; // 通常0, 閏で1(まれに2)
    // 閏は至点直前(=最後の節気 half[11])を倍化させる流派慣行に合わせ、末尾を重複。
    const seq = [];
    for (let k = 0; k < 12; k++) {
      seq.push(half[k]);
      // 最後の節気の直前に閏を挿入（半年の最後 half[11] を extra 回多く）
    }
    // extra 個を half[11](至点直前節気)の位置に追加
    for (let e = 0; e < Math.max(0, extra); e++) seq.splice(11, 0, half[11]);
    // span に合わせて切り詰め/補填
    for (let b = 0; b < span; b++) {
      blockSekki[cur.blockIndex + b] = seq[b] ?? half[Math.min(b, 11)];
    }
  }
  // アンカー前(最初のアンカーより前)のブロックは後方の節気から逆算
  // 先頭側: 最初のアンカーから逆順で埋める
  if (anchors.length) {
    const first = anchors[0];
    let idx = SEKKI_ORDER.indexOf(first.which);
    for (let b = first.blockIndex - 1; b >= 0; b--) {
      idx = (idx - 1 + 24) % 24;
      blockSekki[b] = SEKKI_ORDER[idx];
    }
    const last = anchors[anchors.length - 1];
    if (!blockSekki[blocks.length - 1]) {
      let i2 = SEKKI_ORDER.indexOf(blockSekki[last.blockIndex]);
      for (let b = last.blockIndex + 1; b < blocks.length; b++) { i2 = (i2 + 1) % 24; blockSekki[b] = SEKKI_ORDER[i2]; }
    }
  }

  // 4) 各日に、属する上元ブロックの節気を付与
  const out = new Map();
  for (let b = 0; b < blocks.length; b++) {
    const start = blocks[b].i;
    const end = b + 1 < blocks.length ? blocks[b + 1].i : rows.length;
    const sek = blockSekki[b] || blockSekki[Math.max(0, b - 1)] || '冬至';
    for (let i = start; i < end; i++) out.set(rows[i].date, sek);
  }
  // 先頭ブロック前(最初の上元より前)の日も埋める
  if (blocks.length) {
    const firstI = blocks[0].i;
    const sek0 = (() => { const i = SEKKI_ORDER.indexOf(blockSekki[0]); return SEKKI_ORDER[(i - 1 + 24) % 24]; })();
    for (let i = 0; i < firstI; i++) out.set(rows[i].date, sek0);
  }
  return out;
}
