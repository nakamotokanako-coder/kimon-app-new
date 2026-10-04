// 無料の検索サーバー（Overpass）は、混んでいると 504 を返したり、10秒以上かかったりする。
// 1回目は長めに待ち、だめなら同じサーバーにもう一度、最後に予備のサーバーに頼む。
const ATTEMPTS = [
  { url: 'https://overpass-api.de/api/interpreter', timeoutMs: 15000 },
  { url: 'https://overpass-api.de/api/interpreter', timeoutMs: 12000 },
  { url: 'https://overpass.kumi.systems/api/interpreter', timeoutMs: 8000 },
];

async function readBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (req.body?.data) return req.body.data;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const query = await readBody(req);
  if (!query.trim()) {
    return res.status(400).json({ error: 'empty overpass query' });
  }

  for (const { url, timeoutMs } of ATTEMPTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain; charset=UTF-8',
          'User-Agent': 'kimon-app/1.0 (https://kimon-tonko.vercel.app/)',
        },
        body: query,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) continue;
      const json = await response.json();
      res.setHeader('Cache-Control', 's-maxage=300');
      return res.status(200).json(json);
    } catch {
      clearTimeout(timer);
    }
  }

  return res.status(502).json({ error: 'overpass upstream failed' });
}
