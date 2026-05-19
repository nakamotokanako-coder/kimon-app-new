import { loadBanTable } from '../src/kimon/loadData.js';

const ban = loadBanTable();
const r = ban['陰7局丁亥'];

console.log('chito 行 "陰7局丁亥":');
console.log(`  junshu=${r.junshu}, chokufu=${r.chokufu}, chokushi=${r.chokushi}, futatsu_no_tokoro=${r.futatsu_no_tokoro}`);
console.log(`  p1_tenban_kan=${r.p1_tenban_kan}, p1_tenban_kan2=${r.p1_tenban_kan2}`);
console.log('  八門:', [1, 2, 3, 4, 6, 7, 8, 9].map((p) => `p${p}=${r['p' + p + '_hachimon']}`).join(', '));
console.log('  ↑ ルオシュ標準配置と完全一致 (= 旋回前の素のテーブル)');

const tenchuFields = Object.entries(r).filter(([, v]) => v === '天冲');
console.log(`\nnormalize(天冲→天衝) が走った箇所数 (陰7局丁亥 行内): ${tenchuFields.length}`);
for (const [k] of tenchuFields) console.log(`  - ${k}: 天冲 → 天衝`);

const dupCount = Object.keys(ban).filter((k) => k === '陰7局丁亥').length;
console.log(`\nlookupBan("陰7局", "丁亥") の一発引き: ${r ? `hit (chito table 内 ${dupCount} 件)` : 'miss'}`);
