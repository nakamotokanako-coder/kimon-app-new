import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { PRO_PRICE_LABEL, ANNUAL_PRICE_LABEL } from '../lib/accessPolicy.js';
import { RARE_TIERS } from '../src/reverseDirection/rareDays.js';
import { KAKKYOKU_GUIDE } from '../src/reverseDirection/kakkyokuGuide.js';
import { INTRO_SEEN_KEY } from '../src/components/IntroPage.jsx';

// 紹介ページ（/about）。文は about.html に全部書いてある。
const html = readFileSync('about.html', 'utf8');
const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');

describe('紹介ページ（about.html）', () => {
  it('効果は約束しない', () => {
    expect(text).not.toMatch(/運が上が|運気|開運|叶う|叶い|必ず|絶対|最強|運を動か/u);
  });

  it('料金は、アプリの設定と同じ文字', () => {
    expect(text).toContain(PRO_PRICE_LABEL);
    expect(text).toContain(ANNUAL_PRICE_LABEL);
  });

  it('稀日の名前と回数は、アプリと同じ', () => {
    for (const tier of Object.values(RARE_TIERS)) {
      expect(text).toContain(tier.name);
      expect(text).toContain(tier.reading);
      expect(text).toContain(tier.rarity);
    }
  });

  it('格局の名前・一言・絵は、格局検索の案内と同じ（12個）', () => {
    const guides = Object.entries(KAKKYOKU_GUIDE);
    expect(guides).toHaveLength(12);
    for (const [name, guide] of guides) {
      expect(html).toContain('<b>' + name + '</b><span>' + guide.line + '</span>');
      expect(html).toContain('/divination/' + guide.image + '.webp');
    }
  });

  it('使っている画像が、全部ある', () => {
    const images = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]);
    expect(images.length).toBeGreaterThan(20);
    for (const src of images) expect(existsSync('public' + src), src).toBe(true);
  });

  it('アプリへのボタンは / へ行き、アプリの中の案内をもう一度は出さない', () => {
    const links = [...html.matchAll(/<a class="[^"]*js-open-app[^"]*" href="([^"]+)"/g)].map((match) => match[1]);
    expect(links.length).toBeGreaterThanOrEqual(4);
    expect(new Set(links)).toEqual(new Set(['/']));
    expect(html).toContain("setItem('" + INTRO_SEEN_KEY + "', '1')");
  });

  it('検索に出すための設定がある（/about で開く・地図に載せる）', () => {
    expect(html).toContain('<link rel="canonical" href="https://kimon-tonko.vercel.app/about" />');
    expect(JSON.parse(readFileSync('vercel.json', 'utf8')).cleanUrls).toBe(true);
    expect(readFileSync('public/sitemap.xml', 'utf8')).toContain('https://kimon-tonko.vercel.app/about');
    expect(readFileSync('public/robots.txt', 'utf8')).toContain('Sitemap: https://kimon-tonko.vercel.app/sitemap.xml');
    expect(readFileSync('vite.config.js', 'utf8')).toContain("about: 'about.html'");
  });
});
